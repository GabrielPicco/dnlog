import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LogEntry } from './log.entity';

@Injectable()
export class LogService {
  constructor(
    @InjectRepository(LogEntry)
    private readonly repo: Repository<LogEntry>,
  ) {}

  /** Registra uma ação. Best-effort: nunca lança (não pode travar o app). */
  async registrar(body: any): Promise<any> {
    try {
      const clip = (v: any, n = 500) =>
        v == null ? null : String(v).slice(0, n);
      const reg = this.repo.create({
        usuario: clip(body?.usuario, 120),
        tela: clip(body?.tela, 60),
        acao: clip(body?.acao, 120) || 'acao',
        detalhe: clip(body?.detalhe, 500),
        entidadeTipo: clip(body?.entidade_tipo, 60),
        entidadeId: clip(body?.entidade_id, 120),
      });
      const salvo = await this.repo.save(reg);
      return { ok: true, id: salvo.id };
    } catch (e: any) {
      return { ok: false, erro: String(e?.message || e) };
    }
  }

  /** Lista os últimos registros (mais recentes primeiro). */
  async listar(limit = 500): Promise<any[]> {
    const n = Math.min(2000, Math.max(1, Number(limit) || 500));
    const regs = await this.repo.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take: n,
    });
    return regs.map((r) => ({
      id: r.id,
      quando: r.createdAt,
      usuario: r.usuario,
      tela: r.tela,
      acao: r.acao,
      detalhe: r.detalhe,
      entidade_tipo: r.entidadeTipo,
      entidade_id: r.entidadeId,
    }));
  }
}
