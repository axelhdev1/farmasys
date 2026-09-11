import { Module } from '@nestjs/common';
import { TransferenciasService } from './transferencias.service';
import { TransferenciasController } from './transferencias.controller';

@Module({
  controllers: [TransferenciasController],
  providers: [TransferenciasService],
  exports: [TransferenciasService],
})
export class TransferenciasModule {}
