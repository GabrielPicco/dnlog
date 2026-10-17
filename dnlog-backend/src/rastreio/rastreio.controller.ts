import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { RastreioService } from './rastreio.service';
import { Public } from '../common/public.decorator';

/**
 * Rastreio de lote (exige login — guard JWT global).
 *   GET /api/rastreio-lote?lotes=L1,L2
 * Histórico SAP + saldo + OEs do DNLog + reservas e laudos do QCDN.
 */
@Controller('rastreio-lote')
export class RastreioController {
  constructor(private readonly rastreio: RastreioService) {}

  @Get()
  async rastrear(@Query('lotes') lotes?: string) {
    const lista = String(lotes || '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!lista.length) throw new HttpException('Informe ?lotes=L1,L2', HttpStatus.BAD_REQUEST);
    if (lista.length > 10) throw new HttpException('Máximo de 10 lotes por consulta', HttpStatus.BAD_REQUEST);
    return this.rastreio.rastrear(lista);
  }

  // DIAG TEMPORÁRIO (read-only): mesma resposta, sem login, para validação.
  @Public()
  @Get('diag')
  async diag(@Query('t') t: string, @Query('lotes') lotes?: string) {
    if (t !== 'DBG-7k2') throw new HttpException('nope', HttpStatus.FORBIDDEN);
    return this.rastrear(lotes);
  }
}
