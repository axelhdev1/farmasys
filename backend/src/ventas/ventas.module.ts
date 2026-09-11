import { Module } from '@nestjs/common';
import { VentasService } from './ventas.service';
import { VentasController } from './ventas.controller';
import { InventarioModule } from '../inventario/inventario.module';

@Module({
  imports: [InventarioModule], // reutiliza consumirFefo dentro de la TX de venta
  controllers: [VentasController],
  providers: [VentasService],
  exports: [VentasService],
})
export class VentasModule {}
