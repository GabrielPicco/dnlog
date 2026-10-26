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
    await tenta('armazens', async () => (await this.sap.getAllPages('/Warehouses', {})).map((w: any) => ({ c: w.WarehouseCode, n: w.WarehouseName, bpl: w.BusinessPlaceID, uf: w.State, cid: w.City, inativo: w.Inactive })));
    await tenta('filiais', async () => (await this.sap.getAllPages('/BusinessPlaces', { $select: 'BPLID,BPLName,Disabled' })));
    await tenta('view', async () => {
      const linhas: any[] = (await this.sap.getSaldoPorLote()) || [];
      const m: Record<string, any> = {};
      for (const r of linhas) { const k = r.CodigoDeposito; m[k] = m[k] || { nome: r.NomeDeposito, linhas: 0, comLote: 0, saldo: 0 }; m[k].linhas++; if (r.Lote) m[k].comLote++; m[k].saldo += Number(r.SaldoAtual) || 0; }
      return { total: linhas.length, colunas: Object.keys(linhas[0] || {}), porDeposito: m };
    });
    await tenta('itemWh', async () => {
      const itens: any[] = (await this.sap.getEstoque()) || [];
      const m: Record<string, any> = {};
      for (const it of itens) for (const w of it.ItemWarehouseInfoCollection || []) { const q = Number(w.InStock) || 0; if (!q) continue; m[w.WarehouseCode] = m[w.WarehouseCode] || { itens: 0, saldo: 0, lote: 0 }; m[w.WarehouseCode].itens++; m[w.WarehouseCode].saldo += q; if (it.ManageBatchNumbers === 'tYES') m[w.WarehouseCode].lote++; }
      return m;
    });
    return out;
  }
}
