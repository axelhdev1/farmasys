import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { ToastService } from '../services/toast.service';
import type { Modulo } from './permisos';

/**
 * permisoGuard — autorización por MÓDULO (reemplaza al rolGuard).
 *
 * Antes el acceso a cada ruta se decidía por rol. Ahora se decide por el
 * permiso del usuario sobre ese módulo, que un admin puede ajustar con
 * checkboxes sin cambiarle el rol.
 *
 * Compatibilidad: `auth.tienePermiso()` ya aplica el fallback (usuario sin
 * lista → plantilla de su rol) y respeta los pisos, así que un usuario creado
 * antes de este sistema conserva EXACTAMENTE el acceso que tenía por rol.
 * SUPER_ADMIN pasa siempre.
 *
 * Uso:  canActivate: [permisoGuard('finanzas')]
 */
export function permisoGuard(modulo: Modulo): CanActivateFn {
  return (): boolean | UrlTree => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const toast = inject(ToastService);

    if (!auth.autenticado()) {
      return router.createUrlTree(['/login']);
    }
    if (auth.tienePermiso(modulo)) {
      return true;
    }
    toast.aviso('No tienes acceso a esa sección.');
    return router.createUrlTree(['/dashboard']);
  };
}
