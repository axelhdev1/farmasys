import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * Módulo de autenticación. Registra los guards GLOBALES:
 *  - JwtAuthGuard: exige access token en toda ruta salvo @Public().
 *  - RolesGuard: aplica @Roles() cuando esté presente.
 * El orden importa: primero autentica, luego autoriza por rol.
 */
@Module({
  imports: [
    ConfigModule,
    PassportModule,
    // Secretos/expiración se pasan por-firma en AuthService (access vs refresh).
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
