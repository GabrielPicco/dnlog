import { Controller, Get, Post, Body, Inject, Logger, Param, HttpException, HttpStatus } from '@nestjs/common';
import { SAP_SERVICE } from '../sap/sap.module';
import { Public } from '../common/public.decorator';
import { OeService } from '../oe/oe.service';

// ===== Helpers compartilhados por pedidos de VENDA e de COMPRA =====
// (Venda e compra têm a MESMA estrutura de linhas no SAP; estas funções evitam
//  duplicar a tradução das linhas nos dois endpoints — mexer aqui vale p/ ambos.)

type ItemInfo = Record<string, { grupo_codigo: any; grupo_nome: string }>;

/**
 * Saldo em aberto de uma linha. No SAP o campo pode vir como OpenQuantity ou
 * RemainingOpenQuantity; sem nenhum, cai para a quantidade total (linha tratada
 * como totalmente em aberto).
 */
function saldoLinha(l: any): number {
  const v = l.OpenQuantity ?? l.RemainingOpenQuantity ?? l.Quantity ?? 0;
  return Number(v) || 0;
}

/** Mapa ItemCode -> { grupo_codigo, grupo_nome } a partir dos catálogos do SAP. */
function construirItemInfo(itens: any[], grupos: any[]): ItemInfo {
  const grupoNomePorNumero: Record<string, string> = {};
  for (const g of grupos || []) grupoNomePorNumero[String(g.Number)] = g.GroupName;
  const itemInfo: ItemInfo = {};
  for (const it of itens || []) {
    itemInfo[it.ItemCode] = {
      grupo_codigo: it.ItemsGroupCode,
      grupo_nome: grupoNomePorNumero[String(it.ItemsGroupCode)] || '',
    };
  }
  return itemInfo;
}

/**
 * Traduz as DocumentLines do SAP para o formato DNLog e calcula os totais.
 * Defensivo: pedido sem linhas ou com campos ausentes não quebra a tela.
 */
function resumirLinhas(p: any, itemInfo: ItemInfo) {
  const linhas: any[] = Array.isArray(p.DocumentLines) ? p.DocumentLines : [];
  return {
    qtd_total_bb: linhas.reduce((a: number, l: any) => a + (Number(l.Quantity) || 0), 0),
    qtd_saldo_bb: linhas.reduce((a: number, l: any) => a + saldoLinha(l), 0),
    saldo_aberto: linhas.reduce((a: number, l: any) => a + saldoLinha(l) * (Number(l.Price) || 0), 0),
    itens: linhas.map((l: any) => {
      const info = itemInfo[l.ItemCode] || { grupo_codigo: null, grupo_nome: '' };
      return {
        sap_line_num: l.LineNum,
        codigo: l.ItemCode,
        descricao: l.ItemDescription,
        grupo_codigo: info.grupo_codigo,
        grupo_nome: info.grupo_nome,
        embalagem: l.MeasureUnit || l.UoMCode || '',
        qtd_bb: Number(l.Quantity) || 0,
        qtd_entregue: (Number(l.Quantity) || 0) - saldoLinha(l),
        saldo: saldoLinha(l),
        valor_unitario: Number(l.Price) || 0,
        armazem: l.WarehouseCode,
      };
    }),
  };
}

/**
 * Endpoints da API consumidos pelo frontend DNLog.
 *
 * Traduzem a estrutura SAP B1 (DocEntry, CardCode, DocumentLines...) para
 * um formato amigavel ao app (numero, cliente, itens...).
 */
@Controller()
export class ApiController {
  private readonly logger = new Logger(ApiController.name);

  constructor(
    @Inject(SAP_SERVICE) private sap: any,
    private readonly oeService: OeService,
  ) {}

  // -------- HEALTH --------
  // Público: o frontend chama /health para detectar o backend sem precisar de API key.
  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      modo: process.env.USE_MOCK === 'true' ? 'mock' : 'sap_real',
      // Somente leitura no SAP (padrao). O frontend usa isso para nem tentar
      // faturar enquanto a escrita estiver desligada.
      somente_leitura: process.env.SAP_READ_ONLY !== 'false',
      timestamp: new Date().toISOString(),
    };
  }

  /** true enquanto a escrita no SAP estiver desligada (padrao). */
  private get somenteLeitura(): boolean {
    return process.env.SAP_READ_ONLY !== 'false';
  }

  // -------- PEDIDOS --------
  @Get('pedidos')
  async getPedidos() {
    // Busca tudo em paralelo: pedidos + catalogos para enriquecer
    // (nome do vendedor e grupo de cada item). Os catalogos sao opcionais —
    // se algum falhar, o pedido ainda volta, so sem o enriquecimento.
    const [pedidosSap, itens, grupos, vendedores] = await Promise.all([
      this.sap.getPedidosAbertos(),
      this.sap.getItems?.().catch(() => []) ?? [],
      this.sap.getItemGroups?.().catch(() => []) ?? [],
      this.sap.getSalesPersons?.().catch(() => []) ?? [],
    ]);

    const itemInfo = construirItemInfo(itens, grupos);

    // Nome do vendedor por código (catálogo SalesPersons).
    const vendedorNome: Record<string, string> = {};
    for (const v of vendedores || []) vendedorNome[String(v.SalesEmployeeCode)] = v.SalesEmployeeName;

    return pedidosSap.map((p: any) => {
      const vendCodigo = p.SalesPersonCode != null ? String(p.SalesPersonCode) : '';
      return {
        numero: `PV-${p.DocNum}`,
        doc_entry: p.DocEntry,
        cliente: p.CardName,
        cliente_codigo: p.CardCode,
        data_emissao: p.DocDate,
        data_entrega: p.DocDueDate,
        // Vendedor: nome (via SalesPersons) com fallback para UDF/codigo.
        vendedor: p.U_VENDEDOR || vendedorNome[vendCodigo] || vendCodigo,
        vendedor_codigo: vendCodigo,
        observacoes: p.Comments || '',
        tem_saldo: p.DocumentStatus === 'bost_Open',
        ...resumirLinhas(p, itemInfo),
      };
    });
  }

  // -------- RESUMO DE ENTREGAS (para o gráfico do painel) --------
  @Get('pedidos-resumo')
  async getPedidosResumo() {
    return (await this.sap.getResumoEntregas?.()) ?? { entregues: 0, nao_entregues: 0 };
  }

  // -------- PEDIDOS DE COMPRA --------
  @Get('pedidos-compra')
  async getPedidosCompra() {
    const [pedidosSap, itens, grupos] = await Promise.all([
      this.sap.getPedidosCompraAbertos?.().catch(() => []) ?? [],
      this.sap.getItems?.().catch(() => []) ?? [],
      this.sap.getItemGroups?.().catch(() => []) ?? [],
    ]);

    const itemInfo = construirItemInfo(itens, grupos);

    return pedidosSap.map((p: any) => ({
      numero: `PC-${p.DocNum}`,
      doc_entry: p.DocEntry,
      fornecedor: p.CardName,
      fornecedor_codigo: p.CardCode,
      data_emissao: p.DocDate,
      data_entrega: p.DocDueDate,
      observacoes: p.Comments || '',
      tem_saldo: p.DocumentStatus === 'bost_Open',
      ...resumirLinhas(p, itemInfo),
    }));
  }

  // -------- CLIENTES E FORNECEDORES --------
  @Get('clientes')
  async getClientes() {
    const bps = await this.sap.getBusinessPartners('cCustomer');
    return bps.map((b: any) => ({
      codigo: b.CardCode,
      nome: b.CardName,
      cpf_cnpj: b.FederalTaxID,
      telefone: b.Phone1,
      email: b.EmailAddress,
    }));
  }

  @Get('fornecedores')
  async getFornecedores() {
    const bps = await this.sap.getBusinessPartners('cSupplier');
    return bps.map((b: any) => {
      const a = this.escolherEndereco(b.BPAddresses);
      return {
        codigo: b.CardCode,
        nome: b.CardName,
        cnpj: b.FederalTaxID,
        endereco: this.formatarEndereco(a),
        cidade: a?.City || '',
        uf: a?.State || '',
      };
    });
  }

  /** Escolhe o endereco do parceiro: prefere entrega (ShipTo), senao o primeiro. */
  private escolherEndereco(addrs: any[]): any | null {
    const lista = Array.isArray(addrs) ? addrs : [];
    if (!lista.length) return null;
    return lista.find((x) => x.AddressType === 'bo_ShipTo') || lista[0];
  }

  /** Monta uma linha de endereco legivel a partir de um BPAddress do SAP. */
  private formatarEndereco(a: any): string {
    if (!a) return '';
    const partes = [
      [a.Street, a.StreetNo].filter(Boolean).join(', '),
      a.Block,
      a.City && a.State ? `${a.City}/${a.State}` : a.City || a.State,
      a.ZipCode ? `CEP ${a.ZipCode}` : '',
    ].filter(Boolean);
    return partes.join(' - ');
  }

  // -------- ITENS / LOTES --------
  @Get('itens')
  async getItens() {
    const itens = await this.sap.getItems();
    return itens.map((i: any) => ({
      codigo: i.ItemCode,
      descricao: i.ItemName,
      cultivar: i.U_CULTIVAR,
      controla_lote: i.ManageBatchNumbers === 'tYES',
    }));
  }

  // -------- ESTOQUE (saldo por item x armazem) --------
  @Get('estoque')
  async getEstoque() {
    const [itens, armazens] = await Promise.all([
      this.sap.getEstoque(),
      this.sap.getWarehouses(),
    ]);

    // Mapa codigo do armazem -> nome, para exibir bonito.
    const nomeArmazem: Record<string, string> = {};
    for (const w of armazens || []) nomeArmazem[w.WarehouseCode] = w.WarehouseName;

    // Achata: uma linha por (item x armazem) que tenha saldo ou compromisso.
    const linhas: any[] = [];
    for (const it of itens || []) {
      const whs: any[] = it.ItemWarehouseInfoCollection || [];
      for (const w of whs) {
        const emEstoque = Number(w.InStock) || 0;
        const comprometido = Number(w.Committed) || 0;
        if (emEstoque === 0 && comprometido === 0) continue;
        linhas.push({
          item_codigo: it.ItemCode,
          descricao: it.ItemName,
          grupo: it.ItemsGroupCode,
          controla_lote: it.ManageBatchNumbers === 'tYES',
          armazem: w.WarehouseCode,
          armazem_nome: nomeArmazem[w.WarehouseCode] || w.WarehouseCode,
          em_estoque: emEstoque,
          comprometido,
          disponivel: emEstoque - comprometido,
        });
      }
    }
    return linhas;
  }

  @Get('itens/:codigo/lotes')
  async getLotes(@Param('codigo') codigo: string) {
    const lotes = await this.sap.getBatchesForItem(codigo);
    return lotes.map((l: any) => ({
      lote_codigo: l.BatchNumber,
      item_codigo: l.ItemCode,
      qtd_disponivel: l.Quantity,
      peneira: l.U_PENEIRA,
      germinacao: l.U_GERMINACAO,
    }));
  }

  // -------- FATURAR OE (cria Delivery Note no SAP) --------
  @Post('oe/faturar')
  async faturarOE(@Body() body: any) {
    // SEGURANÇA (fase de implantação): com SAP_READ_ONLY ligado, NÃO grava
    // nada no SAP. A OE continua salva no banco do DNLog (via /oe/sync), mas
    // nenhuma Delivery Note é criada no ERP. Retorna claro para o app.
    if (this.somenteLeitura) {
      this.logger.warn(`Faturamento bloqueado (somente leitura) para OE ${body.oe_numero || body.oe_id || '?'}`);
      return {
        sucesso: true,
        somente_leitura: true,
        notas: [],
        mensagem: 'Modo SOMENTE LEITURA: nada foi gravado no SAP. A OE ficou salva apenas no DNLog.',
      };
    }

    // body esperado: { paradas: [{ pedido_doc_entry, cliente_codigo,
    //                              itens: [{ sap_line_num, qtd_bb, lote_codigo }] }],
    //                  motorista_cpf, placa, placa_uf, observacoes, oe_numero }
    if (!body.paradas || body.paradas.length === 0) {
      throw new HttpException('Paradas vazias', HttpStatus.BAD_REQUEST);
    }

    // Uma Delivery Note do SAP é por cliente (CardCode). Uma OE pode ter
    // várias paradas/clientes, então agrupamos as linhas por cliente e
    // criamos uma DN por cliente. Antes, todas as linhas iam para o cliente
    // da primeira parada — gerando nota errada em OE multi-cliente.
    const porCliente = new Map<string, any[]>();
    for (const parada of body.paradas) {
      const cardCode = parada.cliente_codigo;
      if (!cardCode) {
        throw new HttpException(
          'Parada sem cliente_codigo — não é possível faturar',
          HttpStatus.BAD_REQUEST,
        );
      }
      const linhas = porCliente.get(cardCode) || [];
      for (const item of parada.itens) {
        linhas.push({
          BaseType: 17,
          BaseEntry: parada.pedido_doc_entry,
          BaseLine: item.sap_line_num,
          Quantity: item.qtd_bb,
          ...(item.lote_codigo && {
            BatchNumbers: [{
              BatchNumber: item.lote_codigo,
              Quantity: item.qtd_bb,
            }],
          }),
        });
      }
      porCliente.set(cardCode, linhas);
    }

    const udfs = {
      U_DNLOG_OE: body.oe_numero || '',
      U_PLACA: body.placa || '',
      U_PLACA_UF: body.placa_uf || '',
      U_MOTORISTA_CPF: body.motorista_cpf || '',
      U_MODALIDADE: 'PROPRIO',
    };

    const notas = [];
    try {
      for (const [cardCode, documentLines] of porCliente) {
        const dn = await this.sap.createDeliveryNote({
          CardCode: cardCode,
          Comments: body.observacoes || '',
          DocumentLines: documentLines,
          ...udfs,
        });
        notas.push({
          tipo: 'DeliveryNote',
          cliente_codigo: cardCode,
          sap_doc_entry: dn.DocEntry,
          sap_doc_num: dn.DocNum,
        });
      }
    } catch (err) {
      this.logger.error('Falha ao faturar OE', err);
      throw err;
    }

    // Grava o vinculo na OE persistida: marca como faturada e anexa os
    // documentos criados no SAP. So acontece se o app mandou body.oe_id
    // (OE ja salva no banco). Falha aqui nao invalida a nota ja criada no SAP.
    let oeAtualizada = null;
    if (body.oe_id) {
      try {
        const nfNumero = notas.map((n) => n.sap_doc_num).join(', ');
        oeAtualizada = await this.oeService.registrarFaturamento(
          body.oe_id,
          notas,
          nfNumero,
        );
      } catch (err) {
        this.logger.warn(`Nota criada no SAP, mas falhou ao atualizar a OE ${body.oe_id} no banco: ${err.message}`);
      }
    }

    return {
      sucesso: true,
      notas,
      oe: oeAtualizada,
      mensagem: `${notas.length} Delivery Note(s) criada(s): ${notas.map((n) => n.sap_doc_num).join(', ')}`,
    };
  }

  // -------- TRIANGULAR (cria Purchase Order no SAP) --------
  @Post('oe/triangular/troca-nota')
  async triangularTrocaNota(@Body() body: any) {
    if (this.somenteLeitura) {
      this.logger.warn(`Triangular bloqueado (somente leitura) para OE ${body.oe_numero || '?'}`);
      return {
        sucesso: true,
        somente_leitura: true,
        mensagem: 'Modo SOMENTE LEITURA: nenhum Pedido de Compra foi criado no SAP.',
      };
    }

    const payload = {
      CardCode: body.fornecedor_codigo,
      Comments: `Triangular - cliente ${body.cliente_nome}`,
      DocumentLines: body.itens.map((i: any) => ({
        ItemCode: i.codigo,
        Quantity: i.qtd_bb,
        Price: i.valor_unitario,
      })),
      U_DNLOG_OE: body.oe_numero,
    };

    const po = await this.sap.createPurchaseOrder(payload);
    return {
      sucesso: true,
      sap_doc_entry: po.DocEntry,
      sap_doc_num: po.DocNum,
    };
  }
}
