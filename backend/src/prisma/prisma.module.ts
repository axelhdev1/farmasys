import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Módulo global para que PrismaService esté disponible en toda la app. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
