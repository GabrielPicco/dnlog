import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Motorista } from './motorista.entity';
import { MotoristaService } from './motorista.service';
import { MotoristaController } from './motorista.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Motorista])],
  controllers: [MotoristaController],
  providers: [MotoristaService],
  exports: [MotoristaService],
})
export class MotoristaModule {}
