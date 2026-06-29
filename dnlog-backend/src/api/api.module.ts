import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { SapModule } from '../sap/sap.module';
import { OeModule } from '../oe/oe.module';

@Module({
  imports: [SapModule, OeModule],
  controllers: [ApiController],
})
export class ApiModule {}
