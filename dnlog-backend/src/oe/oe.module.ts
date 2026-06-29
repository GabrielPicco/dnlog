import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Oe } from './oe.entity';
import { OeService } from './oe.service';
import { OeController } from './oe.controller';

/**
 * Modulo das Ordens de Embarque persistidas.
 * Exporta o OeService para o ApiModule poder registrar o faturamento na OE.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Oe])],
  controllers: [OeController],
  providers: [OeService],
  exports: [OeService],
})
export class OeModule {}
