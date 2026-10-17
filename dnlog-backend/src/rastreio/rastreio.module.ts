import { Module } from '@nestjs/common';
import { SapModule } from '../sap/sap.module';
import { OeModule } from '../oe/oe.module';
import { QcdnModule } from '../qcdn/qcdn.module';
import { CacheService } from '../common/cache.service';
import { RastreioController } from './rastreio.controller';
import { RastreioService } from './rastreio.service';

/** Rastreio de lote: SAP (movimentos/saldo) + OEs do DNLog + QCDN (reservas/laudos). */
@Module({
  imports: [SapModule, OeModule, QcdnModule],
  controllers: [RastreioController],
  providers: [RastreioService, CacheService],
})
export class RastreioModule {}
