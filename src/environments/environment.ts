/**
 * Entorno de DESARROLLO.
 * Apunta al backend NestJS corriendo localmente (Docker o `npm run start:dev`).
 *
 * Para usar en producción ejecutar:  ng build --configuration production
 * Angular reemplaza este archivo por environment.prod.ts automáticamente.
 */
export const environment = {
  production: false,

  /** URL base de la API REST de NestJS (sin barra final). */
  apiUrl: 'http://localhost:3000/api/v1',

  /** Nombre visible del entorno (útil para banners de desarrollo). */
  nombre: 'Desarrollo',

  /** Duración del token en segundos (debe coincidir con Spring Security). */
  tokenExpiracionSeg: 3600,

  /** Activar logs de debug en consola. */
  debug: true,
};
