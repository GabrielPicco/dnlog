import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { MotoristaService } from './motorista.service';

/**
 * Cadastro de motoristas/veículos (usado no formulário de Nova OE).
 *   GET    /api/motorista        -> lista os cadastrados
 *   POST   /api/motorista        -> upsert (grava ao salvar a OE)
 *   DELETE /api/motorista/:id    -> remove um cadastro
 * Todas exigem login (guard JWT global).
 */
@Controller('motorista')
export class MotoristaController {
  constructor(private readonly svc: MotoristaService) {}

  @Get()
  listar() {
    return this.svc.listar();
  }

  @Post()
  salvar(@Body() body: any) {
    return this.svc.salvar(body);
  }

  @Delete(':id')
  remover(@Param('id') id: string) {
    return this.svc.remover(id);
  }
}
