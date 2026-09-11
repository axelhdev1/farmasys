import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError, timeout } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

/**
 * Interceptor HTTP global.
 *
 * Responsabilidades:
 *  1. Adjuntar header Authorization: Bearer <token> en peticiones privadas.
 *  2. Manejar errores HTTP de forma centralizada:
 *       401 → cerrar sesión y redirigir a /login
 *       403 → log de acceso denegado
 *       404 → log de recurso no encontrado
 *       500 → log de error del servidor
 *         0 → sin conexión a internet
 *     timeout → petición demoró más de TIMEOUT_MS milisegundos
 *
 * Los mensajes de error quedan disponibles en err.message para que los
 * componentes o un servicio de notificaciones los muestren al usuario.
 */

const TIMEOUT_MS = 15_000;         // 15 segundos máximo por petición
const ENDPOINTS_PUBLICOS = ['/auth/login', '/auth/refresh'];

/**
 * Extrae el mensaje real que envía el backend NestJS.
 * NestJS responde `{ statusCode, message, error }` donde `message` puede ser
 * un string o un array de strings (errores de validación). Algunos módulos
 * usan `mensaje` (español). Devuelve el primero disponible.
 */
function mensajeBackend(err: HttpErrorResponse): string | null {
  const cuerpo = err.error;
  if (!cuerpo) return null;
  const m = cuerpo.mensaje ?? cuerpo.message;
  if (Array.isArray(m)) return m.length ? String(m[0]) : null;
  if (typeof m === 'string' && m.trim()) return m;
  return null;
}

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const esPublico = ENDPOINTS_PUBLICOS.some((ep) => req.url.includes(ep));

  // 1. Adjuntar token si la ruta es privada y hay sesión activa
  const token = auth.accessToken();
  const reqFinal =
    token && !esPublico
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(reqFinal).pipe(
    // 2. Timeout: si el backend no responde en TIMEOUT_MS → error
    timeout(TIMEOUT_MS),

    // 3. Manejo centralizado de errores
    catchError((err: unknown) => {
      // ── Timeout ──────────────────────────────────────────────────────
      if (err instanceof Error && err.name === 'TimeoutError') {
        if (environment.debug) {
          console.warn('[API] Timeout — el servidor tardó más de', TIMEOUT_MS / 1000, 's');
        }
        return throwError(
          () => new Error('El servidor tardó demasiado. Intente nuevamente.')
        );
      }

      // ── Errores HTTP estándar ─────────────────────────────────────────
      if (err instanceof HttpErrorResponse) {
        switch (err.status) {
          // Solicitud inválida → mostrar el motivo real del backend
          case 400:
          case 422:
            if (environment.debug) {
              console.warn('[API] 400 — solicitud inválida:', req.url, err.error);
            }
            return throwError(
              () => new Error(mensajeBackend(err) ?? 'Solicitud inválida. Revise los datos.')
            );

          // Sin conexión o servidor caído
          case 0:
            if (environment.debug) {
              console.warn('[API] Sin conexión al servidor:', req.url);
            }
            return throwError(
              () => new Error('Sin conexión. Verifique su red e intente nuevamente.')
            );

          // No autorizado → cerrar sesión
          case 401: {
            // En /auth/login y /auth/refresh un 401 NO es una sesión vencida:
            // son credenciales incorrectas. Devolver "Sesión expirada" ahí
            // confundía al cajero, que veía ese cartel al escribir mal su
            // contraseña y creía que el sistema estaba fallando.
            if (esPublico) {
              if (environment.debug) {
                console.warn('[API] 401 en endpoint público:', req.url, err.error);
              }
              return throwError(
                () => new Error(mensajeBackend(err) ?? 'Credenciales inválidas'),
              );
            }

            // Solo se cierra sesión si REALMENTE había una y no estamos ya en
            // el login. Sin estas dos guardas, una petición de fondo que llega
            // sin token (o llega tarde durante el propio login) mataba la
            // sesión recién creada y rebotaba al usuario al login: por eso
            // "no entraba a la primera".
            //
            // Se mira `auth.sesion()` y no `token`: si el access token ya
            // expiró, `token` es null pero la sesión sigue en memoria, y hay
            // que expulsar igual en vez de dejar una pantalla muerta.
            const enLogin = router.url.split('?')[0] === '/login';
            const habiaSesion = !!auth.sesion();
            if (habiaSesion && !enLogin) {
              if (environment.debug) {
                console.warn('[API] 401 — sesión expirada, redirigiendo a login', req.url);
              }
              auth.logout();
              // Sin query params: si se guardara router.url completo, el propio
              // "?redirect=..." se anidaría en cada 401 y la URL crecía sola.
              const destino = router.url.split('?')[0];
              router.navigate(['/login'], {
                queryParams:
                  destino && destino !== '/login'
                    ? { redirect: destino, expirada: '1' }
                    : { expirada: '1' },
              });
            }
            return throwError(() => new Error('Sesión expirada. Inicie sesión nuevamente.'));
          }

          // Demasiadas peticiones (anti fuerza bruta del login)
          case 429: {
            // El throttler de NestJS manda `Retry-After` en segundos. Decir
            // cuánto falta exactamente evita que el cajero reintente en bucle
            // —cada reintento reinicia la espera— creyendo que está colgado.
            const espera = Number(err.headers?.get('Retry-After') ?? 0);
            if (environment.debug) {
              console.warn('[API] 429 — límite de intentos:', req.url, 'Retry-After:', espera);
            }
            return throwError(
              () =>
                new Error(
                  espera > 0
                    ? `Demasiados intentos seguidos. Espera ${espera} segundos y vuelve a intentar.`
                    : 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.',
                ),
            );
          }

          // Acceso denegado
          case 403:
            if (environment.debug) {
              console.warn('[API] 403 — acceso denegado:', req.url);
            }
            return throwError(
              () => new Error('No tiene permisos para realizar esta acción.')
            );

          // Recurso no encontrado
          case 404:
            if (environment.debug) {
              console.warn('[API] 404 — recurso no encontrado:', req.url);
            }
            return throwError(() => new Error('El recurso solicitado no existe.'));

          // Conflicto (ej. duplicado)
          case 409:
            if (environment.debug) {
              console.warn('[API] 409 — conflicto:', req.url);
            }
            return throwError(
              () => new Error(mensajeBackend(err) ?? 'Conflicto: el recurso ya existe.')
            );

          // Error del servidor
          case 500:
            if (environment.debug) {
              console.error('[API] 500 — error interno del servidor:', req.url, err.error);
            }
            return throwError(
              () => new Error('Error interno del servidor. Contacte al soporte técnico.')
            );

          // Servicio no disponible
          case 503:
            if (environment.debug) {
              console.error('[API] 503 — servicio no disponible:', req.url);
            }
            return throwError(
              () => new Error('Servicio temporalmente no disponible. Intente en unos minutos.')
            );

          // Cualquier otro error HTTP
          default:
            if (environment.debug) {
              console.error(`[API] Error ${err.status}:`, req.url, err);
            }
            return throwError(
              () => new Error(mensajeBackend(err) ?? `Error inesperado (${err.status}).`)
            );
        }
      }

      // ── Error desconocido ─────────────────────────────────────────────
      if (environment.debug) {
        console.error('[API] Error desconocido:', err);
      }
      return throwError(() => new Error('Ocurrió un error inesperado.'));
    })
  );
};
