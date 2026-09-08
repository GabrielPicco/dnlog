import { Module } from '@nestjs/common';
import { QcdnService } from './qcdn.service';
import { QcdnController } from './qcdn.controller';

@Module({
  controllers: [QcdnController],
  providers: [QcdnService],
  exports: [QcdnService],
})
export class QcdnModule {}
