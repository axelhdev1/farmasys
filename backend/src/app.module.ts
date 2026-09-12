import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { SucursalesModule } from './sucursales/sucursales.module';
import { ProductosModule } from './productos/productos.module';
import { InventarioModule } from './inventario/inventario.module';
import { ComprasModule } from './compras/compras.module';
import { VentasModule } from './ventas/ventas.module';
import { CajaModule } from './caja/caja.module';
import { ClientesModule } from './clientes/clientes.module';
import { ReportesModule } from './reportes/reportes.module';
import { GastosModule } from './gastos/gastos.module';
import { DevolucionesModule } from './devoluciones/devoluciones.module';
import { TransferenciasModule } from './transferencias/transferencias.module';
import { InventarioFisicoModule } from './inventario-fisico/inventario-fisico.module';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { SunatModule } from './sunat/sunat.module';
import { IaModule } from './ia/ia.module';

@Module({
  imports: [
    // Carga las variables de entorno (.env) de forma global
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite base de peticiones (anti abuso). El login tiene un tope más estricto
    // vía @Throttle en su controlador.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    UsuariosModule,
    SucursalesModule,
    ProductosModule,
    InventarioModule,
    ComprasModule,
    VentasModule,
    CajaModule,
    ClientesModule,
    ReportesModule,
    GastosModule,
    DevolucionesModule,
    TransferenciasModule,
    InventarioFisicoModule,
    ConfiguracionModule,
    SunatModule,
    IaModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
