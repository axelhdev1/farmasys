import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { ToastService } from '../services/toast.service';
import { RolUsuario } from '../models/auth.model';

/**
 * rolGuard — guard de autorización basado en roles.
 *
 * Es una fábrica: devuelve un CanActivateFn que comprueba si el usuario
 * autenticado posee al menos uno de los roles indicados.
 *
 * Uso en rutas (siempre después de authGuard):
 *   canActivate: [authGuard, rolGuard('ADMIN')]
 *   canActivate: [authGuard, rolGuard('ADMIN', 'FARMACEUTICO')]
 *
 * Comportamiento:
 *  - Sin sesión activa       → redirige a /login  (redundante con authGuard, pero seguro)
 *  - Con sesión, sin el rol  → redirige a /dashboard + toast de aviso
 *  - Con sesión y con el rol → permite la navegación
 */
export function rolGuard(...roles: RolUsuario[]): CanActivateFn {
  return (): boolean | UrlTree => {
    const auth   = inject(AuthService);
    const router = inject(Router);
    const toast  = inject(ToastService);

    if (!auth.autenticado()) {
      return router.createUrlTree(['/login']);
    }

    // SUPER_ADMIN tiene acceso a TODO el sistema sin excepción.
    if (auth.tieneAlgunRol('SUPER_ADMIN')) {
      return true;
    }

    if (auth.tieneAlgunRol(...roles)) {
      return true;
    }

    // Autenticado pero sin el rol necesario → dashboard + aviso visible.
    toast.aviso('No tienes permisos para acceder a esa sección.');
    return router.createUrlTree(['/dashboard']);
  };
}
