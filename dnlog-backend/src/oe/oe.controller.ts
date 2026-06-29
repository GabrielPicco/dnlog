import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { OeService } from './oe.service';

/**
 * CRUD das Ordens de Embarque persistidas no banco.
 *
 * Rotas (prefixo global /api):
 *   GET    /api/oe          -> lista todas as OEs
 *   GET    /api/oe/:id      -> uma OE
 *   POST   /api/oe          -> cria/atualiza uma OE (upsert)
 *   POST   /api/oe/sync     -> envia um lote de OEs (sincronizacao do app)
 *   PUT    /api/oe/:id      -> atualiza uma OE existente
 *   DELETE /api/oe/:id      -> remove uma OE
 *
 * Obs.: as rotas POST /api/oe/faturar e /api/oe/triangular/troca-nota ficam
 * no ApiController (integracao SAP). Como o Nest casa por caminho completo,
 * elas nao conflitam com este controller.
 */
@Controller('oe')
export class OeController {
  constructor(private readonly oe: OeService) {}

  @Get()
  listar() {
    return this.oe.findAll();
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.oe.findOne(id);
  }

  @Post()
  salvar(@Body() body: any) {
    return this.oe.upsert(body);
  }

  @Post('sync')
  sincronizar(@Body() body: any) {
    // Aceita { ordens: [...] } ou diretamente um array.
    const ordens = Array.isArray(body) ? body : body?.ordens || [];
    return this.oe.upsertMany(ordens);
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() body: any) {
    return this.oe.upsert({ ...body, id });
  }

  @Delete(':id')
  async remover(@Param('id') id: string) {
    await this.oe.remove(id);
    return { sucesso: true };
  }
}
