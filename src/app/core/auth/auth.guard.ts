import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guard funcional que bloquea rutas privadas.
 * Si no hay sesión activa redirige a /login conservando la URL solicitada
 * en el query param `redirect` para volver después del login.
 */
export const authGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.autenticado()) {
    return true;
  }
  return router.createUrlTree(['/login'], {
    queryParams: { redirect: state.url },
  });
};

/**
 * Guard inverso: si YA está autenticado y entra a /login, lo manda al dashboard.
 * Útil para evitar que un usuario logueado vea de nuevo el login.
 */
export const noAuthGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.autenticado()) {
    return true;
  }
  return router.createUrlTree(['/dashboard']);
};

/**
 * Primer login: si el usuario debe cambiar su contraseña, se le encierra en
 * /perfil hasta que lo haga. Bloquea la navegación a CUALQUIER otra sección
 * (se aplica como canActivateChild del layout). Sin esto, un usuario nuevo
 * podría operar con la clave que le dio el admin, que el admin conoce.
 */
export const cambioPasswordGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.debeCambiarPassword()) return true;
  // Ya está en /perfil: dejarlo cambiar la clave.
  if (state.url.split('?')[0] === '/perfil') return true;
  return router.createUrlTree(['/perfil'], { queryParams: { forzar: '1' } });
};
