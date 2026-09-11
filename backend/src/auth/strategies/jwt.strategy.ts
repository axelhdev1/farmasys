import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../auth.types';

/**
 * Estrategia para el ACCESS token. Valida firma + expiración del Bearer token
 * y deja el payload en request.user. No consulta la BD: stateless por diseño.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (payload?.type !== 'access') {
      throw new UnauthorizedException('Token no es de tipo access');
    }
    return payload;
  }
}
