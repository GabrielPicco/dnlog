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

  // DIAG TEMPORÁRIO (read-only): pedidos de venda + NFs ligadas, p/ conciliar planilha.
  @Public()
  @Get('diag')
  async diag(@Query('t') t: string) {
    if (t !== 'DBG-7k2') throw new HttpException('nope', HttpStatus.FORBIDDEN);
    await this.sap.ensureSession();
    const desde = "DocDate ge '2025-07-01'";
    const ped: any[] = await this.sap.getAllPages('/Orders', { $filter: desde, $orderby: 'DocEntry asc', $select: 'DocEntry,DocNum,DocDate,DocDueDate,CardCode,CardName,DocTotal,DocumentStatus,Cancelled,CancelStatus,BPL_IDAssignedToInvoice,SalesPersonCode,DocumentLines' });
    const pedidos = ped.map((d: any) => ({ e: d.DocEntry, n: d.DocNum, dt: d.DocDate, due: d.DocDueDate, cc: d.CardCode, cli: d.CardName, tot: d.DocTotal, st: d.DocumentStatus, can: d.Cancelled, cs: d.CancelStatus, bpl: d.BPL_IDAssignedToInvoice, sp: d.SalesPersonCode,
      l: (d.DocumentLines || []).map((l: any) => ({ ln: l.LineNum, it: l.ItemCode, ds: l.ItemDescription, q: l.Quantity, ab: l.RemainingOpenQuantity, pr: l.Price, lt: l.LineTotal, ls: l.LineStatus, un: l.MeasureUnit || l.UoMCode, wh: l.WarehouseCode })) }));
    const nf = async (ent: string) => (await this.sap.getAllPages('/' + ent, { $filter: desde, $orderby: 'DocEntry asc', $select: 'DocEntry,DocNum,DocDate,CardCode,CardName,SequenceSerial,SeriesString,Cancelled,CancelStatus,DocTotal,DocumentLines' }))
      .map((d: any) => ({ e: d.DocEntry, n: d.DocNum, dt: d.DocDate, cc: d.CardCode, nf: d.SequenceSerial, can: d.Cancelled, cs: d.CancelStatus, tot: d.DocTotal,
        l: (d.DocumentLines || []).map((l: any) => ({ it: l.ItemCode, q: l.Quantity, bt: l.BaseType, be: l.BaseEntry, bl: l.BaseLine })) }));
    const notas = await nf('Invoices');
    const entregas = await nf('DeliveryNotes');
    const devol = await nf('CreditNotes');
    return { pedidos, notas, entregas, devol };
  }
}
