import { Rol } from '@prisma/client';

/**
 * Contenido del JWT (tanto access como refresh).
 * `sub` = id del usuario. Se mantiene mínimo: roles y sucursal para que los
 * guards decidan sin tocar la BD en cada request (API stateless / escalable).
 */
export interface JwtPayload {
  sub: string;
  email: string;
  roles: Rol[];
  /** Módulos accesibles (ya resueltos con fallback y pisos). Guían a los guards. */
  permisos: string[];
  sucursalId: string | null;
  /** Tipo de token, para distinguir access de refresh. */
  type: 'access' | 'refresh';
}

/** Respuesta estándar al emitir tokens. */
export interface TokensDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

/** Usuario "público" (sin passwordHash) que se devuelve al cliente. */
export interface UsuarioPublico {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
  dni: string | null;
  telefono: string | null;
  roles: Rol[];
  permisos: string[];
  sucursalId: string | null;
  activo: boolean;
  debeCambiarPassword: boolean;
  ultimoAccesoEn: Date | null;
}
