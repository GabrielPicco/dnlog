import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Oe } from './oe.entity';

/**
 * Regras de negocio das Ordens de Embarque persistidas.
 *
 * O metodo central e o upsert(): recebe a OE no formato do frontend, deriva
 * as colunas indexadas e grava. Como o frontend ja gera o `id` e o `numero`
 * da OE, usamos esses mesmos valores como chave — assim salvar a mesma OE
 * duas vezes apenas atualiza o registro (idempotente).
 */
@Injectable()
export class OeService {
  private readonly logger = new Logger(OeService.name);

  constructor(
    @InjectRepository(Oe)
    private readonly repo: Repository<Oe>,
  ) {}

  /** Lista todas as OEs (mais recentes primeiro). Retorna o formato do app. */
  async findAll(): Promise<any[]> {
    const registros = await this.repo.find({ order: { updatedAt: 'DESC' } });
    return registros.map((r) => this.toApp(r));
  }

  async findOne(id: string): Promise<any> {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`OE ${id} nao encontrada`);
    return this.toApp(r);
  }

  /**
   * Cria ou atualiza uma OE a partir do objeto do frontend.
   * Se a OE nao tiver id/numero, sao gerados aqui.
   */
  async upsert(oe: any): Promise<any> {
    if (!oe || typeof oe !== 'object') {
      throw new Error('Corpo da OE invalido');
    }

    const id = oe.id || uuidv4();
    const numero = oe.numero || (await this.proximoNumero());
    const dados = { ...oe, id, numero };

    const registro = this.repo.create({
      id,
      numero,
      status: oe.status || 'RASCUNHO',
      modalidade: oe.modalidade ?? null,
      dataPrevista: oe.data_prevista ?? null,
      cliente: this.extrairCliente(oe),
      motoristaNome: oe.motorista_nome ?? null,
      veiculoPlaca: oe.veiculo_placa ?? null,
      faturada: !!oe.faturada,
      nfNumero: oe.nf_numero ?? null,
      sapDocs: oe.sap_docs ?? null,
      dados,
    });

    await this.repo.save(registro);
    this.logger.log(`OE salva: ${numero} (status ${registro.status})`);
    return this.toApp(registro);
  }

  /**
   * Salva muitas OEs de uma vez (sincronizacao do app). RESILIENTE: se uma OE
   * falhar, as demais continuam sendo salvas — assim um registro problematico
   * nao derruba o sync inteiro (o que faria o app "perder" o salvamento e a OE
   * voltar ao status antigo no reload).
   */
  async upsertMany(ordens: any[]): Promise<any> {
    let salvos = 0;
    const erros: any[] = [];
    for (const oe of ordens || []) {
      try {
        await this.upsert(oe);
        salvos++;
      } catch (e: any) {
        this.logger.warn(
          `Falha ao salvar OE ${oe?.numero || oe?.id}: ${e?.message || e}`,
        );
        erros.push({ id: oe?.id, numero: oe?.numero, erro: String(e?.message || e) });
      }
    }
    return { sucesso: erros.length === 0, salvos, total: (ordens || []).length, erros };
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete({ id });
    if (!res.affected) throw new NotFoundException(`OE ${id} nao encontrada`);
    this.logger.log(`OE removida: ${id}`);
  }

  /**
   * Marca a OE como faturada e anexa os documentos criados no SAP.
   * Chamado pelo fluxo de faturamento depois que o SAP confirma a Delivery
   * Note. Mantem o registro do banco coerente com o que existe no ERP.
   */
  async registrarFaturamento(
    id: string,
    sapDocs: any[],
    nfNumero?: string,
  ): Promise<any | null> {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) {
      this.logger.warn(`registrarFaturamento: OE ${id} nao existe no banco`);
      return null;
    }
    r.faturada = true;
    r.sapDocs = sapDocs;
    if (nfNumero) r.nfNumero = nfNumero;
    r.status = 'EMBARCADA';
    r.dados = {
      ...r.dados,
      faturada: true,
      faturada_em: new Date().toISOString(),
      nf_numero: nfNumero ?? r.dados?.nf_numero,
      sap_docs: sapDocs,
      status: 'EMBARCADA',
    };
    await this.repo.save(r);
    return this.toApp(r);
  }

  // ---------------- helpers ----------------

  /** Devolve a OE no formato que o frontend espera, com metadados do banco. */
  private toApp(r: Oe): any {
    return {
      ...r.dados,
      id: r.id,
      numero: r.numero,
      faturada: r.faturada,
      nf_numero: r.nfNumero ?? r.dados?.nf_numero ?? null,
      sap_docs: r.sapDocs ?? r.dados?.sap_docs ?? null,
      _persistido_em: r.updatedAt,
    };
  }

  /** Primeiro cliente da OE (multi-paradas ou formato antigo). */
  private extrairCliente(oe: any): string | null {
    if (oe.cliente) return oe.cliente;
    const paradas = oe.paradas || [];
    if (paradas.length && paradas[0].cliente) return paradas[0].cliente;
    return null;
  }

  /** Gera o proximo numero sequencial OE-XXXX baseado no que ja existe. */
  private async proximoNumero(): Promise<string> {
    const ultimo = await this.repo
      .createQueryBuilder('oe')
      .orderBy('oe.numero', 'DESC')
      .getOne();
    let seq = 1;
    if (ultimo?.numero) {
      const m = ultimo.numero.match(/(\d+)$/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `OE-${String(seq).padStart(4, '0')}`;
  }
}
