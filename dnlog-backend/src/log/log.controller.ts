import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { LogService } from './log.service';

/**
 * Trilha de auditoria (interna do DNLog).
 *   POST /api/log        -> registra uma ação
 *   GET  /api/log?limit  -> lista os últimos registros
 */
@Controller('log')
export class LogController {
  constructor(private readonly log: LogService) {}

  @Post()
  registrar(@Body() body: any) {
    return this.log.registrar(body);
  }

  @Get()
  listar(@Query('limit') limit?: string) {
    return this.log.listar(limit ? Number(limit) : 500);
  }
}
