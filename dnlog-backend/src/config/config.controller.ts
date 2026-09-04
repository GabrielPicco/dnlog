import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ConfigAppService } from './config.service';
import { GestorGuard } from '../auth/jwt-auth.guard';

/**
 * Config global do DNLog.
 *   GET  /api/config  -> qualquer usuário logado (usada no bootstrap)
 *   POST /api/config  -> só GESTOR (salva as preferências)
 */
@Controller('config')
export class ConfigController {
  constructor(private readonly svc: ConfigAppService) {}

  @Get()
  get() {
    return this.svc.get();
  }

  @Post()
  @UseGuards(GestorGuard)
  save(@Body() body: any) {
    return this.svc.save(body);
  }
}
