import { Module } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { InventarioController } from './inventario.controller';

@Module({
  controllers: [InventarioController],
  providers: [InventarioService],
  // Exportado para que Ventas (Fase 4) reutilice consumirFefo dentro de su TX.
  exports: [InventarioService],
})
export class InventarioModule {}
