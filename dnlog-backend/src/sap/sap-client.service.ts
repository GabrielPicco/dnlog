import { Injectable, Logger, HttpException, HttpStatus, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

/**
 * Cliente do SAP Business One Service Layer.
 *
 * Responsabilidades:
 * - Autenticar e manter a sessão (SessionId é guardado em cookie)
 * - Renovar a sessão automaticamente quando expirar (~30 min de inatividade)
 * - Tratar erros do SAP e converter para exceções claras
 * - Disponibilizar métodos REST tipados para os principais recursos
 *
 * Documentação oficial:
 *   https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727
 */
@Injectable()
export class SapClientService implements OnModuleDestroy {
  private readonly logger = new Logger(SapClientService.name);
  private axios: AxiosInstance;
  private sessionId: string | null = null;
  private sessionExpiresAt: Date | null = null;

  /**
   * Ao desligar o backend, encerra a sessão no SAP (Logout). Sem isso, cada
   * restart deixa uma sessão "pendurada" por ~30 min, e o usuário de integração
   * acaba batendo o limite de sessões do Service Layer (login passa a falhar).
   */
  async onModuleDestroy() {
    if (!this.sessionId) return;
    try {
      await this.axios.post('/Logout', {});
      this.logger.log('Logout SAP OK (sessão encerrada no shutdown).');
    } catch (e) {
      this.logger.warn('Falha no Logout SAP no shutdown: ' + e.message);
    }
  }

  constructor(private config: ConfigService) {
    const baseURL = this.config.get<string>('SAP_SERVICE_LAYER_URL');
    const ignoreSsl = this.config.get<string>('SAP_IGNORE_SSL_ERRORS') === 'true';

    this.axios = axios.create({
      baseURL,
      timeout: 30000,
      httpsAgent: new https.Agent({ rejectUnauthorized: !ignoreSsl }),
      headers: { 'Content-Type': 'application/json' },
    });

    // ========================================================================
    // TRAVA DE REDE ABSOLUTA E HARDCODED (somente leitura) — a garantia final.
    // Bloqueia QUALQUER método que não seja GET (POST/PATCH/PUT/DELETE) antes de
    // sair pela rede. NÃO existe flag, variável de ambiente ou configuração que
    // libere isso: o DNLog NUNCA insere, baixa estoque/lote/saldo, emite ou
    // exclui nada no SAP. Só uma MUDANÇA DELIBERADA DESTE CÓDIGO poderia permitir
    // escrita — jamais um .env. Exceção: /Login e /Logout (apenas sessão, não são
    // dados; o Login ainda usa outra instância axios e nem passa por aqui).
    // ========================================================================
    this.axios.interceptors.request.use((cfg) => {
      const metodo = (cfg.method || 'get').toLowerCase();
      const url = String(cfg.url || '');
      const ehSessao = /\/Login$|\/Logout$/i.test(url);
      if (metodo !== 'get' && !ehSessao) {
        this.logger.error(`BLOQUEIO DE REDE: ${metodo.toUpperCase()} ${url} recusado — o DNLog é SOMENTE LEITURA no SAP (sem exceção).`);
        return Promise.reject(
          new HttpException(
            `DNLog é SOMENTE LEITURA no SAP: ${metodo.toUpperCase()} ${url} bloqueado na camada de rede. Nada foi enviado ao SAP.`,
            HttpStatus.FORBIDDEN,
          ),
        );
      }
      return cfg;
    });

    // Interceptor: se receber 401 (sessão expirada), tenta relogar e refaz a chamada
    this.axios.interceptors.response.use(
      (resp) => resp,
      async (error) => {
        if (error.response?.status === 401 && !error.config._retry) {
          this.logger.warn('Sessão SAP expirada. Renovando...');
          error.config._retry = true;
          await this.login();
          error.config.headers.Cookie = `B1SESSION=${this.sessionId}`;
          return this.axios.request(error.config);
        }
        return Promise.reject(error);
      },
    );
  }

  /**
   * Faz login no Service Layer. Guarda o SessionId em memória.
   * Chamado automaticamente na primeira request e quando a sessão expira.
   */
  async login(): Promise<void> {
    const url = '/Login';
    const body = {
      CompanyDB: this.config.get<string>('SAP_COMPANY_DB'),
      UserName: this.config.get<string>('SAP_USERNAME'),
      Password: this.config.get<string>('SAP_PASSWORD'),
      // Idioma do login (igual ao BI em producao). Evita "Switch company error".
      Language: this.config.get<string>('SAP_LANGUAGE') || '23',
    };

    try {
      const resp = await axios.post(
        this.config.get<string>('SAP_SERVICE_LAYER_URL') + url,
        body,
        {
          httpsAgent: new https.Agent({
            rejectUnauthorized: this.config.get<string>('SAP_IGNORE_SSL_ERRORS') !== 'true',
          }),
        },
      );

      // SAP retorna o SessionId no body e tambem em cookie B1SESSION
      this.sessionId = resp.data.SessionId;
      // Sessao tipicamente expira em 30 minutos de inatividade
      const sessionTimeoutMin = resp.data.SessionTimeout || 30;
      this.sessionExpiresAt = new Date(Date.now() + sessionTimeoutMin * 60 * 1000);

      // Atualiza header de cookie para todas as requests seguintes
      this.axios.defaults.headers.common['Cookie'] = `B1SESSION=${this.sessionId}`;

      this.logger.log(`Login SAP OK. Sessao expira em ${sessionTimeoutMin} min.`);
    } catch (err) {
      this.logger.error('Falha no login SAP', err.message);
      throw new HttpException(
        `Nao foi possivel autenticar no SAP B1: ${err.message}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Escapa um literal de string para uso seguro em filtros OData.
   * No OData v4, aspas simples são escapadas duplicando-as ('') — isso
   * evita injeção quando o valor vem do usuário (ex.: itemCode da URL).
   */
  private odataLiteral(value: string): string {
    return String(value).replace(/'/g, "''");
  }

  /**
   * Garante que ha uma sessao ativa antes de fazer uma request.
   */
  private async ensureSession(): Promise<void> {
    if (!this.sessionId || (this.sessionExpiresAt && this.sessionExpiresAt < new Date())) {
      await this.login();
    }
  }

  /**
   * Faz um GET paginado no Service Layer, juntando TODAS as paginas.
   *
   * O SAP B1 Service Layer devolve no maximo ~20 registros por pagina e indica
   * que ha mais via `@odata.nextLink`. Sem seguir esse link, so se enxerga os
   * primeiros 20 (foi o bug "nao aparecem todos os pedidos"). Aqui seguimos o
   * nextLink ate o fim, com um teto de seguranca para nunca entrar em loop.
   */
  private async getAllPages(endpoint: string, params?: any): Promise<any[]> {
    await this.ensureSession();
    const todos: any[] = [];
    const MAX_PAGINAS = 500; // teto de seguranca (~100 mil registros)

    // Pede ao SAP paginas maiores (padrao do Service Layer e so 20/pagina).
    // Com 200, a maioria das listas vem numa unica ida — bem mais rapido.
    // Se ainda houver mais, o nextLink continua sendo seguido normalmente.
    const headers = { Prefer: 'odata.maxpagesize=200' };

    let resp = await this.axios.get(endpoint, { params, headers });
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const data = resp.data || {};
      if (Array.isArray(data.value)) todos.push(...data.value);

      // O nextLink vem relativo, ex.: "Orders?$skip=200&$select=...". Ja traz
      // a query inteira, entao a proxima pagina NAO reenvia `params`.
      const next = data['@odata.nextLink'] || data['odata.nextLink'];
      if (!next) break;
      resp = await this.axios.get('/' + String(next).replace(/^\/+/, ''), { headers });
    }
    return todos;
  }

  // ========================================================
  // METODOS DE ALTO NIVEL — usados pelos endpoints da API
  // ========================================================

  /**
   * Busca pedidos de venda: todos os ABERTOS + os FECHADOS/cancelados do ano
   * corrente (pra mostrar status Aberto/Fechado/Cancelado e o saldo de cada um).
   * Cancelados vêm como DocumentStatus=bost_Close + Cancelled=tYES.
   */
  async getPedidosAbertos(): Promise<any[]> {
    await this.ensureSession();

    // So campos PADRAO do SAP B1 (sem UDFs U_*). Um $select com um campo que
    // nao existe derruba a consulta inteira — por isso, na 1a integracao,
    // pedimos apenas o que e garantido existir. As linhas (DocumentLines) vem
    // pelo PROPRIO $select (sao uma colecao embutida, nao navigation property:
    // usar $expand resulta em "Cannot expand invalid navigation property").
    // O vendedor sai por SalesPersonCode (codigo padrao), nao por UDF.
    const anoInicio = `${new Date().getFullYear()}-01-01`;
    const params = {
      $filter: `DocumentStatus eq 'bost_Open' or (DocumentStatus eq 'bost_Close' and DocDueDate ge '${anoInicio}')`,
      $select:
        'DocEntry,DocNum,DocDate,DocDueDate,CardCode,CardName,DocTotal,Comments,DocumentStatus,Cancelled,SalesPersonCode,DocumentLines',
      $orderby: 'DocDueDate asc',
    };

    try {
      // Paginado: traz TODOS os pedidos em aberto, nao so os primeiros 20.
      return await this.getAllPages('/Orders', params);
    } catch (err) {
      this.handleError(err, 'buscar pedidos');
    }
  }

  /**
   * Conta pedidos de venda ENTREGUES (fechados) x NÃO ENTREGUES (abertos) da
   * safra atual (data de entrega no ano corrente). Usa $inlinecount para
   * contar sem baixar os registros — bem leve. Tudo leitura.
   */
  /**
   * Resumo de entregas da safra (pedidos de venda do ano) por VOLUME: soma as
   * quantidades entregues × não entregues (não conta pedidos — um pedido grande
   * pesa mais que um pequeno). Por linha: entregue = Quantity − saldo em aberto;
   * não entregue = saldo em aberto (pedido fechado = tudo entregue). Com quebra
   * por GRUPO DE ITENS para o filtro do painel. Safra pequena → busca as linhas
   * e soma em memória.
   */
  async getResumoEntregas(): Promise<{
    entregues: number;
    nao_entregues: number;
    grupos: Array<{ grupo_codigo: any; grupo_nome: string; entregues: number; nao_entregues: number }>;
  }> {
    await this.ensureSession();
    const anoInicio = `${new Date().getFullYear()}-01-01`;
    try {
      const [orders, itens, grupos] = await Promise.all([
        this.getAllPages('/Orders', {
          $select: 'DocEntry,DocumentStatus,DocumentLines',
          $filter: `DocDueDate ge '${anoInicio}'`,
        }),
        this.getItems().catch(() => []),
        this.getItemGroups().catch(() => []),
      ]);

      const grupoNome: Record<string, string> = {};
      for (const g of grupos || []) grupoNome[String(g.Number)] = g.GroupName;
      const itemGrupo: Record<string, { codigo: any; nome: string }> = {};
      for (const it of itens || []) {
        itemGrupo[it.ItemCode] = {
          codigo: it.ItemsGroupCode,
          nome: grupoNome[String(it.ItemsGroupCode)] || '',
        };
      }

      let entregues = 0;
      let naoEnt = 0;
      const porGrupo: Record<string, { grupo_codigo: any; grupo_nome: string; entregues: number; nao_entregues: number }> = {};
      for (const o of orders || []) {
        const fechado = o.DocumentStatus === 'bost_Close';
        const linhas = Array.isArray(o.DocumentLines) ? o.DocumentLines : [];
        for (const l of linhas) {
          const qtd = Number(l.Quantity) || 0;
          // Saldo em aberto (não entregue). Pedido fechado = tudo entregue.
          const aberto = fechado
            ? 0
            : Math.min(qtd, Math.max(0, Number(l.OpenQuantity ?? l.RemainingOpenQuantity ?? qtd) || 0));
          const entregueVol = qtd - aberto;
          entregues += entregueVol;
          naoEnt += aberto;
          const info = itemGrupo[l.ItemCode];
          const codigo = info ? info.codigo : null;
          const key = codigo != null ? String(codigo) : 'SEM_GRUPO';
          if (!porGrupo[key]) {
            porGrupo[key] = {
              grupo_codigo: codigo,
              grupo_nome: (info && info.nome) || 'Sem grupo',
              entregues: 0,
              nao_entregues: 0,
            };
          }
          porGrupo[key].entregues += entregueVol;
          porGrupo[key].nao_entregues += aberto;
        }
      }

      const gruposArr = Object.values(porGrupo).sort(
        (a, b) => b.entregues + b.nao_entregues - (a.entregues + a.nao_entregues),
      );
      return { entregues, nao_entregues: naoEnt, grupos: gruposArr };
    } catch (err) {
      this.handleError(err, 'resumo de entregas');
    }
  }

  /**
   * Busca pedidos de COMPRA: todos os ABERTOS (com saldo a receber) + os
   * FECHADOS/baixados do ano corrente (pra aparecerem também os já atendidos).
   * Os fechados antigos ficam de fora pra não trazer histórico inteiro.
   */
  async getPedidosCompraAbertos(): Promise<any[]> {
    await this.ensureSession();
    const anoInicio = `${new Date().getFullYear()}-01-01`;
    const params = {
      $filter: `DocumentStatus eq 'bost_Open' or (DocumentStatus eq 'bost_Close' and DocDueDate ge '${anoInicio}')`,
      $select:
        'DocEntry,DocNum,DocDate,DocDueDate,CardCode,CardName,DocTotal,Comments,DocumentStatus,Cancelled,DocumentLines',
      $orderby: 'DocDueDate asc',
    };
    try {
      return await this.getAllPages('/PurchaseOrders', params);
    } catch (err) {
      this.handleError(err, 'buscar pedidos de compra');
    }
  }

  /**
   * Busca cadastro de Business Partners (clientes e fornecedores).
   * type: 'cCustomer' | 'cSupplier'
   */
  async getBusinessPartners(type: 'cCustomer' | 'cSupplier'): Promise<any[]> {
    await this.ensureSession();

    const params = {
      $filter: `CardType eq '${type}' and Frozen eq 'tNO'`,
      $select: 'CardCode,CardName,FederalTaxID,Phone1,EmailAddress,BPAddresses',
    };

    try {
      return await this.getAllPages('/BusinessPartners', params);
    } catch (err) {
      this.handleError(err, `buscar ${type}`);
    }
  }

  /**
   * Busca itens (cadastro de mercadorias).
   */
  async getItems(filter?: string): Promise<any[]> {
    await this.ensureSession();

    const params: any = {
      $select: 'ItemCode,ItemName,ItemsGroupCode,ManageBatchNumbers,ManageSerialNumbers',
      $filter: 'Valid eq \'tYES\'',
    };

    if (filter) params.$filter += ` and contains(ItemCode,'${this.odataLiteral(filter)}')`;

    try {
      return await this.getAllPages('/Items', params);
    } catch (err) {
      this.handleError(err, 'buscar itens');
    }
  }

  /**
   * Busca lotes (Batches) disponiveis para um item especifico.
   */
  async getBatchesForItem(itemCode: string): Promise<any[]> {
    await this.ensureSession();

    const params = {
      $filter: `ItemCode eq '${this.odataLiteral(itemCode)}' and Status eq 'bdsStatus_Released'`,
      $select:
        'BatchNumber,ItemCode,Quantity,ExpirationDate,SystemNumber,U_AGRT_PesoLiquido',
    };

    try {
      return await this.getAllPages('/BatchNumberDetails', params);
    } catch (err) {
      this.handleError(err, `buscar lotes do item ${itemCode}`);
    }
  }

  /**
   * Peso LÍQUIDO por big bag de cada lote (UDF U_AGRT_PesoLiquido na OBTN).
   * Traz todos os lotes liberados de uma vez — usado para anexar o peso real
   * ao saldo por lote. Não-fatal: em erro devolve [] (a OE cai na estimativa).
   */
  async getPesosPorLote(): Promise<any[]> {
    await this.ensureSession();
    try {
      return await this.getAllPages('/BatchNumberDetails', {
        $select: 'ItemCode,BatchNumber,U_AGRT_PesoLiquido',
        $filter: "Status eq 'bdsStatus_Released'",
      });
    } catch (err) {
      this.logger?.warn?.(
        'getPesosPorLote falhou — seguindo sem peso de lote: ' +
          (err?.message || err),
      );
      return [];
    }
  }

  /**
   * Grupos de itens (Number -> GroupName). Usado para filtrar por grupo de
   * item nos relatorios.
   */
  async getItemGroups(): Promise<any[]> {
    await this.ensureSession();
    try {
      return await this.getAllPages('/ItemGroups', {
        $select: 'Number,GroupName',
      });
    } catch (err) {
      this.handleError(err, 'buscar grupos de itens');
    }
  }

  /**
   * Vendedores (SalesEmployeeCode -> SalesEmployeeName). Usado para mostrar
   * o nome do vendedor no lugar do codigo.
   */
  async getSalesPersons(): Promise<any[]> {
    await this.ensureSession();
    try {
      return await this.getAllPages('/SalesPersons', {
        $select: 'SalesEmployeeCode,SalesEmployeeName',
      });
    } catch (err) {
      this.handleError(err, 'buscar vendedores');
    }
  }

  /**
   * Lista os armazens (depositos) cadastrados. Usado para mostrar o nome do
   * armazem junto do codigo no estoque.
   */
  async getWarehouses(): Promise<any[]> {
    await this.ensureSession();
    try {
      return await this.getAllPages('/Warehouses', {
        $select: 'WarehouseCode,WarehouseName',
      });
    } catch (err) {
      this.handleError(err, 'buscar armazens');
    }
  }

  /**
   * Estoque por item x armazem. Traz os itens COM saldo fisico
   * (QuantityOnStock > 0) e, para cada um, o detalhe por armazem
   * (ItemWarehouseInfoCollection: InStock, Committed...). E so leitura.
   *
   * Obs.: o saldo por LOTE (quantidade de cada lote) nao vem do Service Layer
   * padrao — depende de uma consulta que a Agrotis precisaria expor. Por isso,
   * aqui o estoque e por item/armazem, nao por lote.
   */
  async getEstoque(): Promise<any[]> {
    await this.ensureSession();
    try {
      return await this.getAllPages('/Items', {
        $filter: 'QuantityOnStock gt 0',
        $select:
          'ItemCode,ItemName,ItemsGroupCode,ManageBatchNumbers,QuantityOnStock,ItemWarehouseInfoCollection',
      });
    } catch (err) {
      this.handleError(err, 'buscar estoque');
    }
  }

  /**
   * Saldo por LOTE + armazém, via view da Semantic Layer CALCULOSALDOITENS
   * (sap.sbodnsprd.agrotisone.facts). É uma view PARAMETRIZADA — o único
   * parâmetro é ExibirItensSemSaldo ('S'/'N'; 'N' = só quem tem saldo/movimento).
   * Traz lote, depósito, validade e os saldos (atual, comprometido em PV, a
   * receber de PC). SOMENTE LEITURA (GET). Substitui a OIBT, que não é acessível
   * pela Service Layer.
   */
  async getSaldoPorLote(): Promise<any[]> {
    await this.ensureSession();
    const endpoint =
      "/sml.svc/CALCULOSALDOITENSParameters(ExibirItensSemSaldo='N')/CALCULOSALDOITENS";
    try {
      return await this.getAllPages(endpoint);
    } catch (err) {
      this.handleError(err, 'buscar saldo por lote (CALCULOSALDOITENS)');
    }
  }

  /**
   * Estoque por item × armazém — usado para os armazéns de TERCEIROS, que a view
   * de lotes (CALCULOSALDOITENS, escopo DN_EST) não cobre:
   *  - DN_EMTER "EM Terceiros" = nosso estoque guardado em terceiros;
   *  - DN_DETER "DE Terceiros" = estoque de terceiros guardado conosco (serviço).
   * Vem do ItemWarehouseInfoCollection. A Service Layer não filtra coleção
   * aninhada (any() dá erro), então busca todos os itens (poucos, ~500) e o
   * controller filtra os armazéns de terceiros. SOMENTE LEITURA.
   */
  async getEstoqueTerceiros(): Promise<any[]> {
    await this.ensureSession();
    try {
      return await this.getAllPages('/Items', {
        $select: 'ItemCode,ItemName,ItemsGroupCode,ItemWarehouseInfoCollection',
      });
    } catch (err) {
      this.handleError(err, 'buscar estoque de terceiros');
    }
  }

  /**
   * Cria uma Delivery Note (Nota de Saida) baseada em uma OE faturada.
   *
   * Esse e o passo critico: quando a OE eh marcada como faturada no DNLog,
   * uma DN eh criada no SAP, baixando o estoque.
   */
  async createDeliveryNote(payload: any): Promise<any> {
    this.bloquearSeSomenteLeitura('criar Delivery Note');
    await this.ensureSession();

    try {
      const resp = await this.axios.post('/DeliveryNotes', payload);
      this.logger.log(`Delivery Note criada: DocNum ${resp.data.DocNum}, DocEntry ${resp.data.DocEntry}`);
      return resp.data;
    } catch (err) {
      this.handleError(err, 'criar Delivery Note');
    }
  }

  /**
   * Cria um Pedido de Compra (Purchase Order) para operacao triangular.
   */
  async createPurchaseOrder(payload: any): Promise<any> {
    this.bloquearSeSomenteLeitura('criar Purchase Order');
    await this.ensureSession();

    try {
      const resp = await this.axios.post('/PurchaseOrders', payload);
      this.logger.log(`Purchase Order criada: DocNum ${resp.data.DocNum}`);
      return resp.data;
    } catch (err) {
      this.handleError(err, 'criar Purchase Order');
    }
  }

  /**
   * Trava de segurança HARDCODED: aborta SEMPRE qualquer escrita no SAP,
   * independente de qualquer flag/.env. Lançada ANTES de qualquer chamada de
   * rede, então nada chega ao SAP. Junto com a trava de rede no construtor, são
   * as duas garantias de que o DNLog é somente leitura por construção. Habilitar
   * escrita exigiria remover ESTA trava E a de rede (mudança de código), nunca
   * uma variável de ambiente.
   */
  private bloquearSeSomenteLeitura(acao: string): void {
    this.logger.warn(`BLOQUEADO (somente leitura, hardcoded): tentativa de ${acao} no SAP`);
    throw new HttpException(
      `DNLog é SOMENTE LEITURA no SAP — ${acao} bloqueado. Nada foi gravado no SAP.`,
      HttpStatus.FORBIDDEN,
    );
  }

  /**
   * Trata erros do SAP de forma uniforme.
   */
  private handleError(err: any, contexto: string): never {
    const sapError = err.response?.data?.error;
    const msg = sapError?.message?.value || sapError?.message || err.message;
    const code = sapError?.code || err.response?.status || 500;

    this.logger.error(`Erro ao ${contexto}: [${code}] ${msg}`);

    throw new HttpException(
      {
        message: `Erro ao ${contexto}`,
        sap_error: msg,
        sap_code: code,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}
