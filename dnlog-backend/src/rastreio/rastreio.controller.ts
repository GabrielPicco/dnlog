import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { RastreioService } from './rastreio.service';
import { Public } from '../common/public.decorator';
import { Inject } from '@nestjs/common';
import { SAP_SERVICE } from '../sap/sap.module';

/**
 * Rastreio de lote (exige login — guard JWT global).
 *   GET /api/rastreio-lote?lotes=L1,L2
 * Histórico SAP + saldo + OEs do DNLog + reservas e laudos do QCDN.
 */
@Controller('rastreio-lote')
export class RastreioController {
  constructor(private readonly rastreio: RastreioService, @Inject(SAP_SERVICE) private readonly sap: any) {}

  @Get()
  async rastrear(@Query('lotes') lotes?: string) {
    const lista = String(lotes || '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!lista.length) throw new HttpException('Informe ?lotes=L1,L2', HttpStatus.BAD_REQUEST);
    if (lista.length > 10) throw new HttpException('Máximo de 10 lotes por consulta', HttpStatus.BAD_REQUEST);
    return this.rastreio.rastrear(lista);
  }

  // DIAG TEMPORÁRIO (read-only): armazéns/filiais e onde há saldo.
  @Public()
  @Get('diag')
  async diag(@Query('t') t: string) {
    if (t !== 'DBG-7k2') throw new HttpException('nope', HttpStatus.FORBIDDEN);
    const out: any = {};
    const tenta = async (k: string, fn: () => Promise<any>) => { try { out[k] = await fn(); } catch (e: any) { out[k] = { erro: e?.response?.data?.error?.message?.value || e?.message }; } };
    await this.sap.ensureSession();
    await tenta('pedidosPorFilial', async () => {
      const docs: any[] = await this.sap.getAllPages('/Orders', { $select: 'DocEntry,DocNum,DocDate,CardName,BPL_IDAssignedToInvoice,DocumentStatus,DocumentLines', $filter: "DocDate ge '2026-01-01'", $orderby: 'DocEntry desc' });
      const m: Record<string, any> = {};
      for (const d of docs) {
        const k = String(d.BPL_IDAssignedToInvoice);
        m[k] = m[k] || { pedidos: 0, abertos: 0, armazens: {}, exemplos: [] };
        m[k].pedidos++; if (d.DocumentStatus === 'bost_Open') m[k].abertos++;
        for (const l of d.DocumentLines || []) m[k].armazens[l.WarehouseCode] = (m[k].armazens[l.WarehouseCode] || 0) + 1;
        if (m[k].exemplos.length < 5) m[k].exemplos.push({ n: d.DocNum, c: d.CardName, s: d.DocumentStatus, wh: (d.DocumentLines || []).map((l: any) => l.WarehouseCode + ':' + l.ItemCode) });
      }
      return m;
    });
    await tenta('lotesPI', async () => ((await this.sap.getSaldoPorLote()) || []).filter((r: any) => String(r.CodigoDeposito || '').startsWith('PI') || String(r.CodigoDeposito || '').startsWith('MA')).map((r: any) => ({ f: r.IdFilial, item: r.CodigoItem, lote: r.Lote, dep: r.CodigoDeposito, saldo: r.SaldoAtual, pv: r.SaldoPedidoVenda })));
    return out;
  }
}
