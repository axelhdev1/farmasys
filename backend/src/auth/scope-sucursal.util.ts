import { ForbiddenException } from '@nestjs/common';
import { JwtPayload } from './auth.types';

/**
 * Scoping por sucursal — util compartido.
 *
 * Regla del negocio: un usuario NO administrativo solo puede ver y tocar datos
 * de SU sucursal (la que viene firmada en el JWT), pida lo que pida por query.
 * Sin esto, un VENDEDOR podría leer el inventario o las ventas de otra botica
 * simplemente cambiando el `sucursalId` en la URL (o desde Swagger).
 *
 * Los admins (SUPER_ADMIN / ADMIN) sí pueden consultar cualquier sucursal:
 * si no envían filtro, ven todas.
 */

/** ¿El usuario puede operar sobre cualquier sucursal? */
export function esAdmin(user: JwtPayload): boolean {
  return (user.roles ?? []).some((r) => r === 'SUPER_ADMIN' || r === 'ADMIN');
}

/**
 * Sucursal que debe aplicarse a una CONSULTA.
 *  • admin      → respeta lo solicitado (undefined = todas).
 *  • no admin   → siempre la del token, ignorando lo solicitado.
 */
export function sucursalEfectiva(user: JwtPayload, solicitada?: string): string | undefined {
  if (esAdmin(user)) return solicitada;
  return user.sucursalId ?? solicitada;
}

/**
 * Valida una ESCRITURA (o lectura de un recurso concreto) sobre una sucursal.
 * Lanza 403 si un no-admin intenta operar fuera de la suya.
 *
 * @param recurso Nombre para el mensaje de error (ej. "el inventario", "la caja").
 */
export function verificarSucursal(
  user: JwtPayload,
  sucursalId: string | null | undefined,
  recurso = 'este recurso',
): void {
  if (esAdmin(user)) return;
  if (!sucursalId || !user.sucursalId) return;
  if (sucursalId !== user.sucursalId) {
    throw new ForbiddenException(`No puedes acceder a ${recurso} de otra sucursal`);
  }
}

/**
 * Igual que `verificarSucursal`, pero SOLO el SUPER_ADMIN cruza sucursales.
 *
 * Se usa en lo que revela cuánto gana cada botica: estado de resultados,
 * márgenes, flujo de caja y gastos. La regla de arriba deja pasar a cualquier
 * ADMIN, y en cuanto haya un encargado con ADMIN por sede —que es como se va a
 * armar con 5 boticas— podría leer el P&L de las otras cuatro cambiando el id
 * en la URL.
 *
 * Deliberadamente aparte: cambiar `esAdmin` afectaría inventario, ventas y
 * caja. Esto solo toca las pantallas de dinero.
 */
export function verificarSucursalFinanciera(
  user: JwtPayload,
  sucursalId: string | null | undefined,
  recurso = 'la información financiera',
): void {
  const roles = user.roles ?? [];
  if (roles.includes('SUPER_ADMIN')) return;
  if (!sucursalId || !user.sucursalId) return;
  if (sucursalId !== user.sucursalId) {
    throw new ForbiddenException(`No puedes ver ${recurso} de otra sucursal`);
  }
}

/** Sucursal a aplicar en consultas financieras (mismo criterio que arriba). */
export function sucursalEfectivaFinanciera(
  user: JwtPayload,
  solicitada?: string,
): string | undefined {
  if ((user.roles ?? []).includes('SUPER_ADMIN')) return solicitada;
  return user.sucursalId ?? solicitada;
}
