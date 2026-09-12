/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload } from '../../auth/auth.types';
import { Modulo } from '../../auth/permisos';

/**
 * Guard de PERMISO POR MÓDULO (no por rol).
 *
 * El rol es una plantilla; la lista `permisos` del usuario es la que manda —
 * un admin puede quitarle Reposición a un almacenero sin cambiarle el rol. El
 * `RolesGuard` global no ve eso, así que llamar a la IA se valida además contra
 * el módulo al que pertenece el dato que va a leer: si no puedes ver la tabla
 * de reposición, tampoco puedes pedir que una IA te la resuma.
 *
 * Se queda dentro de `ia/` a propósito: es aditivo y no toca el
 * comportamiento de ningún endpoint existente.
 */

export const PERMISO_MODULO_KEY = 'permisoModulo';

/** Exige que el usuario tenga este módulo entre sus permisos efectivos. */
export const PermisoModulo = (modulo: Modulo) => SetMetadata(PERMISO_MODULO_KEY, modulo);

@Injectable()
export class PermisoModuloGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const modulo = this.reflector.getAllAndOverride<Modulo | undefined>(PERMISO_MODULO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!modulo) return true;

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('No autenticado');

    const roles = user.roles ?? [];
    // Los administrativos tienen todos los módulos por definición (ver permisos.ts).
    if (roles.some((r) => r === 'SUPER_ADMIN' || r === 'ADMIN')) return true;

    if ((user.permisos ?? []).includes(modulo)) return true;

    throw new ForbiddenException(
      `Necesitas acceso al módulo "${modulo}" para usar el análisis con IA`,
    );
  }
}
