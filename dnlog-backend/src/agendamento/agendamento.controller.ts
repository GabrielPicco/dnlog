import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { AgendamentoService } from './agendamento.service';

/**
 * CRUD dos Agendamentos de Embarque (retirada avulsa em fornecedor).
 *
 * Rotas (prefixo global /api):
 *   GET    /api/agendamento       -> lista todos
 *   GET    /api/agendamento/:id   -> um agendamento
 *   POST   /api/agendamento       -> cria/atualiza (upsert)
 *   POST   /api/agendamento/sync  -> envia um lote (sincronização do app)
 *   PUT    /api/agendamento/:id   -> atualiza um existente
 *   DELETE /api/agendamento/:id   -> remove
 */
@Controller('agendamento')
export class AgendamentoController {
  constructor(private readonly ag: AgendamentoService) {}

  @Get()
  listar() {
    return this.ag.findAll();
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.ag.findOne(id);
  }

  @Post()
  salvar(@Body() body: any) {
    return this.ag.upsert(body);
  }

  @Post('sync')
  sincronizar(@Body() body: any) {
    const ags = Array.isArray(body) ? body : body?.agendamentos || [];
    return this.ag.upsertMany(ags);
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() body: any) {
    return this.ag.upsert({ ...body, id });
  }

  @Delete(':id')
  async remover(@Param('id') id: string) {
    await this.ag.remove(id);
    return { sucesso: true };
  }
}
