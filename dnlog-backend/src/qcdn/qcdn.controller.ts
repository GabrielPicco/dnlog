import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { QcdnService } from './qcdn.service';

/**
 * Proxy do DNLog para o QCDN. Mantém o token do QCDN no servidor (o frontend
 * chama estas rotas com a sessão normal do DNLog — guard JWT global).
 *   GET  /api/qcdn/reservas?cardCode=&nome=&lotes=  -> reservas do cliente
 *   POST /api/qcdn/baixa                             -> baixa (parcial) da reserva
 */
@Controller('qcdn')
export class QcdnController {
  constructor(private readonly qcdn: QcdnService) {}

  @Get('status')
  status() {
    return { configurado: this.qcdn.configurado() };
  }

  @Get('reservas')
  reservas(@Query('cardCode') cardCode?: string, @Query('nome') nome?: string, @Query('lotes') lotes?: string) {
    return this.qcdn.listarReservas({
      cardCode,
      nome,
      lotes: lotes ? lotes.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    });
  }

  @Post('baixa')
  baixa(@Body() body: any) {
    return this.qcdn.darBaixa({
      reservaId: String(body?.reservaId || ''),
      quantidadeBags: Number(body?.quantidadeBags),
      pedidoSap: body?.pedidoSap ? String(body.pedidoSap) : undefined,
      oeNumero: String(body?.oeNumero || ''),
      loteNumero: body?.loteNumero ? String(body.loteNumero) : undefined,
      observacoes: body?.observacoes ? String(body.observacoes) : undefined,
    });
  }
}
