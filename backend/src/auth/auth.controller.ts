import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './auth.types';

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * POST /api/v1/auth/login — email + password → tokens.
   *
   * Límite anti fuerza bruta: 15 intentos por minuto POR IP.
   *
   * Ojo con el número: el contador NO distingue aciertos de fallos, y en una
   * botica varios cajeros comparten la misma IP de salida. Con el límite de 5
   * bastaba un relevo de turno (tres personas entrando, alguna tecleando mal
   * su clave) para dejar el mostrador bloqueado un minuto entero, sin poder
   * vender. 15 sigue frenando un ataque por fuerza bruta —que necesita miles
   * de intentos— sin castigar el uso normal.
   *
   * El bloqueo fino por CUENTA (no por IP) está planificado en PLAN-LOGIN.md
   * como L7; ese es el control que de verdad frena a un atacante.
   */
  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión y obtener tokens JWT' })
  @ApiOkResponse({ description: 'Login correcto: usuario + access/refresh tokens.' })
  @ApiUnauthorizedResponse({ description: 'Credenciales inválidas.' })
  @ApiTooManyRequestsResponse({ description: 'Demasiados intentos. Espera un momento.' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    // IP y navegador quedan en la auditoría: con varios cajeros por botica, es
    // lo que permite reconstruir quién estuvo dentro si algo no cuadra.
    return this.auth.login(dto, {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  /** POST /api/v1/auth/refresh — refreshToken → nuevo par de tokens. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotar tokens a partir de un refresh token válido' })
  @ApiOkResponse({ description: 'Nuevo par de tokens.' })
  @ApiUnauthorizedResponse({ description: 'Refresh token inválido o expirado.' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  /** GET /api/v1/auth/me — datos del usuario autenticado. */
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Perfil del usuario autenticado' })
  @ApiOkResponse({ description: 'Datos públicos del usuario.' })
  @ApiUnauthorizedResponse({ description: 'No autenticado.' })
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.perfil(user.sub);
  }

  /**
   * GET /api/v1/auth/accesos — auditoría de ingresos al sistema.
   * Solo administración: es información sensible de control interno.
   */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('accesos')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Historial de accesos (exitosos y fallidos)' })
  accesos(
    @Query('dias') dias?: string,
    @Query('soloFallidos') soloFallidos?: string,
  ) {
    return this.auth.historialAccesos(
      dias ? Number(dias) : 7,
      soloFallidos === 'true',
    );
  }
}
