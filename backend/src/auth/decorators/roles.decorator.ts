import { SetMetadata } from '@nestjs/common';
import { Rol } from '@prisma/client';

/** Clave de metadato con los roles permitidos por endpoint. */
export const ROLES_KEY = 'roles';

/**
 * Restringe un endpoint a uno o más roles. El RolesGuard exige que el
 * usuario autenticado tenga AL MENOS uno de los roles indicados.
 * Ej.: @Roles('SUPER_ADMIN', 'ADMIN')
 */
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
