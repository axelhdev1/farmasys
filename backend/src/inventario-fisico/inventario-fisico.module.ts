import { Module } from '@nestjs/common';
import { InventarioFisicoService } from './inventario-fisico.service';
import { InventarioFisicoController } from './inventario-fisico.controller';

@Module({
  controllers: [InventarioFisicoController],
  providers: [InventarioFisicoService],
  exports: [InventarioFisicoService],
})
export class InventarioFisicoModule {}
