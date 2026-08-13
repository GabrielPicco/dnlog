import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { SapModule } from '../sap/sap.module';
import { OeModule } from '../oe/oe.module';
import { CacheService } from '../common/cache.service';

@Module({
  imports: [SapModule, OeModule],
  controllers: [ApiController],
  providers: [CacheService],
})
export class ApiModule {}
