/**
 * Entorno de PRODUCCIÓN.
 * Angular CLI sustituye automáticamente environment.ts por este archivo
 * cuando se compila con: ng build --configuration production
 *
 * ⚠️  Cambiar apiUrl por la URL real del servidor antes de desplegar.
 */
export const environment = {
  production: true,

  /** URL base de la API REST en producción. Cambiar antes de desplegar. */
  apiUrl: 'https://api.farmasys.com/api/v1',

  /** Nombre visible del entorno. */
  nombre: 'Producción',

  /** Duración del token en segundos. */
  tokenExpiracionSeg: 3600,

  /** Sin logs de debug en producción. */
  debug: false,
};
