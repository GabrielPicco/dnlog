import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agendamento } from './agendamento.entity';

/**
 * Regras dos Agendamentos de Embarque persistidos.
 *
 * Espelha o OeService: upsert() recebe o agendamento no formato do frontend,
 * deriva as colunas indexadas (num, fornecedor, data, recebida, valor_frete) e
 * grava. id e num vêm do app (ou são gerados aqui), então salvar de novo apenas
 * atualiza — idempotente.
 */
@Injectable()
export class AgendamentoService {
  private readonly logger = new Logger(AgendamentoService.name);

  constructor(
    @InjectRepository(Agendamento)
    private readonly repo: Repository<Agendamento>,
  ) {}

  /** Lista todos (mais recentes por número primeiro). Formato do app. */
  async findAll(): Promise<any[]> {
    const registros = await this.repo.find({ order: { num: 'DESC' } });
    return registros.map((r) => this.toApp(r));
  }

  async findOne(id: string): Promise<any> {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Agendamento ${id} não encontrado`);
    return this.toApp(r);
  }

  /** Cria ou atualiza um agendamento a partir do objeto do frontend. */
  async upsert(ag: any): Promise<any> {
    if (!ag || typeof ag !== 'object') {
      throw new Error('Corpo do agendamento inválido');
    }

    const id = ag.id || 'ag_' + Date.now() + '_' + Math.round(Math.random() * 1e6);
    const num = Number(ag.num) || (await this.proximoNum());
    const recebida = !!ag.recebida;
    const valorFrete =
      ag.valor_frete == null || ag.valor_frete === ''
        ? null
        : Number(ag.valor_frete);
    const campos = ag.campos || {};
    const dados = { ...ag, id, num, recebida, valor_frete: valorFrete };

    const registro = this.repo.create({
      id,
      num,
      fornecedor: ag.fornecedor ?? campos.fornecedor ?? null,
      data: ag.data ?? campos.data_prevista_do_embarque ?? null,
      recebida,
      valorFrete,
      dados,
    });

    await this.repo.save(registro);
    this.logger.log(`Agendamento salvo: #${num} (${registro.fornecedor || '—'})`);
    return this.toApp(registro);
  }

  /** Salva muitos de uma vez (sincronização do app). */
  async upsertMany(ags: any[]): Promise<any[]> {
    const out: any[] = [];
    for (const ag of ags || []) out.push(await this.upsert(ag));
    return out;
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete({ id });
    if (!res.affected)
      throw new NotFoundException(`Agendamento ${id} não encontrado`);
    this.logger.log(`Agendamento removido: ${id}`);
  }

  // ---------------- helpers ----------------

  /** Devolve o agendamento no formato do frontend, com metadados do banco. */
  private toApp(r: Agendamento): any {
    return {
      ...r.dados,
      id: r.id,
      num: r.num,
      fornecedor: r.fornecedor ?? r.dados?.fornecedor ?? null,
      data: r.data ?? r.dados?.data ?? null,
      recebida: r.recebida,
      valor_frete: r.valorFrete,
      _persistido_em: r.updatedAt,
    };
  }

  /** Próximo número sequencial (max + 1). */
  private async proximoNum(): Promise<number> {
    const ultimo = await this.repo
      .createQueryBuilder('a')
      .orderBy('a.num', 'DESC')
      .getOne();
    return (ultimo?.num || 0) + 1;
  }
}
