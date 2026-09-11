import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../auth.types';

/**
 * Exige que el usuario tenga al menos uno de los roles declarados con @Roles().
 * Si el endpoint no declara roles, deja pasar (solo aplica autenticación).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('No autenticado');

    const ok = user.roles?.some((r) => required.includes(r));
    if (!ok) {
      throw new ForbiddenException('No tienes permisos para esta acción');
    }
    return true;
  }
}
