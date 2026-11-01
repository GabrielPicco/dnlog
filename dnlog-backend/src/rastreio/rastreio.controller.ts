import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { RastreioService } from './rastreio.service';
import { Public } from '../common/public.decorator';
import { Inject } from '@nestjs/common';
import { SAP_SERVICE } from '../sap/sap.module';
import { OeService } from '../oe/oe.service';

/**
 * Rastreio de lote (exige login — guard JWT global).
 *   GET /api/rastreio-lote?lotes=L1,L2
 * Histórico SAP + saldo + OEs do DNLog + reservas e laudos do QCDN.
 */
@Controller('rastreio-lote')
export class RastreioController {
  constructor(private readonly rastreio: RastreioService, @Inject(SAP_SERVICE) private readonly sap: any, private readonly oes: OeService) {}

  @Get()
  async rastrear(@Query('lotes') lotes?: string) {
    const lista = String(lotes || '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!lista.length) throw new HttpException('Informe ?lotes=L1,L2', HttpStatus.BAD_REQUEST);
    if (lista.length > 10) throw new HttpException('Máximo de 10 lotes por consulta', HttpStatus.BAD_REQUEST);
    return this.rastreio.rastrear(lista);
  }

  // DIAG TEMPORÁRIO (read-only)
  @Public()
  @Get('diag')
  async diag(@Query('t') t: string, @Query('item') item: string) {
    if (t !== 'DBG-7k2') throw new HttpException('nope', HttpStatus.FORBIDDEN);
    const linhas: any[] = (await this.sap.getSaldoPorLote()) || [];
    const lotesSap = linhas.filter((r) => r.CodigoItem === item);
    const nomes = new Set(lotesSap.map((r) => r.Lote));
    const todas: any[] = (await this.oes.findAll()) || [];
    const oes = todas.map((o: any) => {
      const itens = [...(o.itens || []), ...((o.paradas || []).flatMap((p: any) => p.itens || []))];
      const alocs = itens.filter((it: any) => it.codigo === item || (it.lotes_alocados || []).some((la: any) => nomes.has(la.lote_codigo)))
        .map((it: any) => ({ codigo: it.codigo, pedido: it.pedido_numero, qtd: it.qtd_bb, mod: it.modalidade, lotes: it.lotes_alocados }));
      return alocs.length ? { numero: o.numero, status: o.status, faturada: o.faturada, nf: o.nf_numero || o.nota_fiscal, cliente: o.cliente, criado: o.criado_em, alocs } : null;
    }).filter(Boolean);
    const pedidos: any[] = (await this.sap.getPedidosAbertos()) || [];
    const ped = pedidos.filter((p: any) => (p.DocumentLines || []).some((i: any) => i.ItemCode === item))
      .map((p: any) => ({ numero: p.DocNum, cliente: p.CardName, status: p.DocumentStatus, cancelado: p.Cancelled,
        linhas: p.DocumentLines.filter((i: any) => i.ItemCode === item).map((i: any) => ({ q: i.Quantity, aberto: i.RemainingOpenQuantity, st: i.LineStatus, wh: i.WarehouseCode })) }));
    return { lotesSap, oes, pedidos: ped };
  }
}
