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

  // DIAG TEMPORÁRIO (read-only)
  @Public()
  @Get('diag')
  async diag(@Query('t') t: string, @Query('lote') lote: string, @Query('q') q: string) {
    if (t !== 'DBG-7k2') throw new HttpException('nope', HttpStatus.FORBIDDEN);
    const linhas: any[] = (await this.sap.getSaldoPorLote()) || [];
    const parecidos = linhas.filter((r) => String(r.Lote || '').toUpperCase().includes(String(q || '').toUpperCase()));
    const r = await this.rastreio.rastrear([lote]);
    return { totalLinhasView: linhas.length, parecidos, rastreio: r };
  }
}
