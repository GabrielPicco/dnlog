import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { RastreioService } from './rastreio.service';
import { Public } from '../common/public.decorator';
import { OeService } from '../oe/oe.service';
import { QcdnService } from '../qcdn/qcdn.service';

/**
 * Rastreio de lote (exige login — guard JWT global).
 *   GET /api/rastreio-lote?lotes=L1,L2
 * Histórico SAP + saldo + OEs do DNLog + reservas e laudos do QCDN.
 */
@Controller('rastreio-lote')
export class RastreioController {
  constructor(private readonly rastreio: RastreioService, private readonly oes: OeService, private readonly qcdn: QcdnService) {}

  @Get()
  async rastrear(@Query('lotes') lotes?: string) {
    const lista = String(lotes || '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!lista.length) throw new HttpException('Informe ?lotes=L1,L2', HttpStatus.BAD_REQUEST);
    if (lista.length > 10) throw new HttpException('Máximo de 10 lotes por consulta', HttpStatus.BAD_REQUEST);
    return this.rastreio.rastrear(lista);
  }

  // DIAG TEMPORÁRIO (read-only): lotes de OEs faturadas x lotes do QCDN
  @Public()
  @Get('diag')
  async diag(@Query('t') t: string) {
    if (t !== 'DBG-7k2') throw new HttpException('nope', HttpStatus.FORBIDDEN);
    const todas: any[] = (await this.oes.findAll()) || [];
    const porLote: Record<string, any> = {};
    for (const o of todas) {
      if (o.status === 'CANCELADA' || !(o.faturada || o.status === 'ENTREGUE')) continue;
      const paradas = Array.isArray(o.paradas) && o.paradas.length ? o.paradas : [{ itens: o.itens || [], modalidade: o.modalidade, cliente: o.cliente }];
      for (const p of paradas) for (const it of p.itens || []) for (const la of it.lotes_alocados || []) {
        if (!la || !la.lote_codigo || la.sem_lotes_triangular) continue;
        const k = String(la.lote_codigo).trim().toUpperCase().replace(/\s+/g, ' ');
        const r = (porLote[k] = porLote[k] || { lote: la.lote_codigo, item: it.codigo, desc: it.descricao || it.nome || '', qtd: 0, oes: [] });
        r.qtd += Number(la.qtd_bb) || 0;
        r.oes.push({ oe: o.numero, nf: o.nf_numero || o.nota_fiscal || '', cliente: p.cliente || o.cliente, pedido: it.pedido_numero || p.pedido_numero || '',
          mod: p.modalidade || o.modalidade, armazem: la.armazem || '', qtd: Number(la.qtd_bb) || 0, paralelo: !!la.controle_paralelo,
          faturada_em: o.faturada_em || o.entregue_em || o.criado_em });
      }
    }
    const chaves = Object.keys(porLote);
    const nao: string[] = []; const erros: any[] = [];
    for (let i = 0; i < chaves.length; i += 20) {
      const lote = chaves.slice(i, i + 20).map((k) => porLote[k].lote);
      const r: any = await this.qcdn.qualidadeLotes(lote);
      if (!r.ok) { erros.push({ lote, erro: r.erro }); continue; }
      nao.push(...(r.naoEncontrados || []));
    }
    const naoSet = new Set(nao.map((n) => String(n).trim().toUpperCase().replace(/\s+/g, ' ')));
    return { totalLotes: chaves.length, erros, faltando: chaves.filter((k) => naoSet.has(k)).map((k) => porLote[k]),
      encontrados: chaves.filter((k) => !naoSet.has(k)).map((k) => ({ lote: porLote[k].lote, item: porLote[k].item })) };
  }
}
