import { ForbiddenException } from '@nestjs/common';
import { Rol } from '@prisma/client';

/**
 * Modelo de permisos de FarmaSys.
 *
 * El ROL es una PLANTILLA: al crear un usuario, su rol decide qué módulos
 * quedan marcados por defecto. Pero la lista `permisos` del usuario es la que
 * manda — un admin puede darle a un vendedor acceso a Inventario sin cambiarle
 * el rol.
 *
 * Sobre eso hay PISOS DE SEGURIDAD que ningún checkbox puede saltar: da igual
 * lo que se marque, Finanzas/Usuarios/Configuración exigen rol ADMIN o superior,
 * y Sucursales exige SUPER_ADMIN. Esto se valida en el backend al asignar y se
 * respeta en el guard: la UI nunca es la última palabra.
 */

/** Catálogo completo de módulos. Debe coincidir con el del front. */
export const MODULOS = [
  'pos',
  'caja',
  'inventario',
  'compras',
  'reposicion',
  'mermas',
  'transferencias',
  'inventario_fisico',
  'ventas',
  'clientes',
  'importar',
  'finanzas',
  'usuarios',
  'configuracion',
  'sucursales',
] as const;

export type Modulo = (typeof MODULOS)[number];

const TODOS: Modulo[] = [...MODULOS];

/** Plantilla de módulos pre-marcados según el rol principal. */
export const PERMISOS_POR_ROL: Record<Rol, Modulo[]> = {
  SUPER_ADMIN: TODOS,
  ADMIN: TODOS,
  VENDEDOR: ['pos', 'caja', 'clientes'],
  FARMACEUTICO: ['pos', 'caja', 'inventario', 'ventas', 'clientes', 'mermas'],
  ALMACENERO: ['inventario', 'compras', 'reposicion', 'mermas', 'transferencias', 'inventario_fisico'],
};

/**
 * Pisos: módulos que exigen un rango MÍNIMO de rol, marque lo que se marque.
 * finanzas/usuarios/configuracion → ADMIN+ (rango 2). sucursales → SUPER (3).
 */
const PISO_POR_MODULO: Partial<Record<Modulo, number>> = {
  finanzas: 2,
  usuarios: 2,
  configuracion: 2,
  sucursales: 3,
};

/** Rango numérico de un rol. Mayor = más poder. */
export function rangoDeRol(rol: Rol): number {
  if (rol === 'SUPER_ADMIN') return 3;
  if (rol === 'ADMIN') return 2;
  return 1;
}

/** Rango del usuario = el más alto de sus roles. */
export function rangoDeRoles(roles: Rol[]): number {
  return roles.reduce((max, r) => Math.max(max, rangoDeRol(r)), 0);
}

/** ¿El rango de estos roles alcanza el piso del módulo? */
export function moduloAlcanzaPiso(modulo: Modulo, roles: Rol[]): boolean {
  const piso = PISO_POR_MODULO[modulo] ?? 0;
  return rangoDeRoles(roles) >= piso;
}

/** Unión de plantillas de varios roles (ADMIN/SUPER ⇒ todo). */
export function plantillaPorRoles(roles: Rol[]): Modulo[] {
  const set = new Set<Modulo>();
  for (const r of roles) for (const m of PERMISOS_POR_ROL[r]) set.add(m);
  return TODOS.filter((m) => set.has(m));
}

/**
 * Permisos EFECTIVOS de un usuario. Si su lista está vacía (usuario anterior a
 * este sistema), cae a la plantilla de sus roles. Nunca devuelve un módulo cuyo
 * piso no alcance el rango del usuario: aunque en BD quedara uno indebido, aquí
 * se filtra.
 */
export function permisosEfectivos(permisos: string[], roles: Rol[]): Modulo[] {
  const base = permisos.length
    ? (permisos.filter((p): p is Modulo => (MODULOS as readonly string[]).includes(p)))
    : plantillaPorRoles(roles);
  return base.filter((m) => moduloAlcanzaPiso(m, roles));
}

/**
 * Valida y normaliza los permisos que se quieren ASIGNAR a un usuario con
 * ciertos roles. Rechaza (no filtra en silencio) cualquier módulo inexistente
 * o que viole un piso: así una llamada directa a la API con
 * `permisos=['finanzas']` sobre un VENDEDOR es rechazada, no ignorada.
 */
export function validarPermisosAsignables(permisos: string[], rolesDelUsuario: Rol[]): Modulo[] {
  const desconocidos = permisos.filter((p) => !(MODULOS as readonly string[]).includes(p));
  if (desconocidos.length) {
    throw new ForbiddenException(`Módulos inválidos: ${desconocidos.join(', ')}`);
  }
  const limitados = (permisos as Modulo[]).filter((m) => !moduloAlcanzaPiso(m, rolesDelUsuario));
  if (limitados.length) {
    throw new ForbiddenException(
      `Estos módulos requieren un rol superior: ${limitados.join(', ')}. ` +
        'Asigna el rol adecuado o quítalos.',
    );
  }
  // Únicos y en orden de catálogo.
  return TODOS.filter((m) => permisos.includes(m));
}
