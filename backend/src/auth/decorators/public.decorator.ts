import { SetMetadata } from '@nestjs/common';

/** Clave de metadato para marcar rutas públicas (sin JWT). */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un endpoint como público: el JwtAuthGuard global lo deja pasar
 * sin exigir token. Úsalo en /auth/login, /auth/refresh y /health.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
