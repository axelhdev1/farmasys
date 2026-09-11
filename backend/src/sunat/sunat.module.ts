import { Module } from '@nestjs/common';
import { SunatService } from './sunat.service';
import { SunatController } from './sunat.controller';
import { PSE_PROVIDER } from './pse.interface';
import { PseStubProvider } from './pse-stub.provider';

/**
 * Módulo SUNAT. El proveedor PSE se inyecta por token: en local usa el stub;
 * en producción se sustituye por Nubefact/Bizlinks implementando PseProvider.
 */
@Module({
  controllers: [SunatController],
  providers: [
    SunatService,
    { provide: PSE_PROVIDER, useClass: PseStubProvider },
  ],
  exports: [SunatService],
})
export class SunatModule {}
