import { RolUsuario } from '../models/auth.model';

/**
 * Modelo de permisos del front — ESPEJO del backend (backend/src/auth/permisos.ts).
 *
 * El rol es la plantilla inicial; la lista `permisos` del usuario es la verdad.
 * Los pisos de seguridad se respetan también aquí (la UI deshabilita lo que el
 * backend rechazaría), pero el backend siempre tiene la última palabra.
 */

export type Modulo =
  | 'pos' | 'caja' | 'inventario' | 'compras' | 'reposicion' | 'mermas'
  | 'transferencias' | 'inventario_fisico' | 'ventas' | 'clientes'
  | 'importar' | 'finanzas' | 'usuarios' | 'configuracion' | 'sucursales';

export const MODULOS: Modulo[] = [
  'pos', 'caja', 'inventario', 'compras', 'reposicion', 'mermas',
  'transferencias', 'inventario_fisico', 'ventas', 'clientes',
  'importar', 'finanzas', 'usuarios', 'configuracion', 'sucursales',
];

/** Plantillas por rol (idénticas al backend). */
export const PERMISOS_POR_ROL: Record<RolUsuario, Modulo[]> = {
  SUPER_ADMIN: [...MODULOS],
  ADMIN: [...MODULOS],
  VENDEDOR: ['pos', 'caja', 'clientes'],
  FARMACEUTICO: ['pos', 'caja', 'inventario', 'ventas', 'clientes', 'mermas'],
  ALMACENERO: ['inventario', 'compras', 'reposicion', 'mermas', 'transferencias', 'inventario_fisico'],
};

/** Piso de rango por módulo. finanzas/usuarios/config → ADMIN(2); sucursales → SUPER(3). */
const PISO_POR_MODULO: Partial<Record<Modulo, number>> = {
  finanzas: 2, usuarios: 2, configuracion: 2, sucursales: 3,
};

export function rangoDeRol(rol: RolUsuario): number {
  if (rol === 'SUPER_ADMIN') return 3;
  if (rol === 'ADMIN') return 2;
  return 1;
}

export function rangoDeRoles(roles: RolUsuario[]): number {
  return roles.reduce((max, r) => Math.max(max, rangoDeRol(r)), 0);
}

/** ¿El rango de estos roles alcanza el piso del módulo? */
export function moduloAlcanzaPiso(modulo: Modulo, roles: RolUsuario[]): boolean {
  return rangoDeRoles(roles) >= (PISO_POR_MODULO[modulo] ?? 0);
}

export function plantillaPorRoles(roles: RolUsuario[]): Modulo[] {
  const set = new Set<Modulo>();
  for (const r of roles) for (const m of PERMISOS_POR_ROL[r]) set.add(m);
  return MODULOS.filter((m) => set.has(m));
}

/**
 * Permisos EFECTIVOS: si la lista está vacía (usuario anterior a este sistema),
 * cae a la plantilla del rol. Filtra los que no alcanzan piso. Igual que el
 * backend, para que el guard del front y el del back coincidan.
 */
export function permisosEfectivos(permisos: string[], roles: RolUsuario[]): Modulo[] {
  const base = permisos.length
    ? permisos.filter((p): p is Modulo => (MODULOS as string[]).includes(p))
    : plantillaPorRoles(roles);
  return base.filter((m) => moduloAlcanzaPiso(m, roles));
}

// ── Metadatos para la UI (etiquetas y agrupación de los checkboxes) ──────────

export interface ModuloInfo {
  id: Modulo;
  label: string;
  /** Piso de rol para el tooltip "requiere rol Administrador/Super Admin". */
  requiere?: 'ADMIN' | 'SUPER_ADMIN';
}

export interface GrupoModulos {
  titulo: string;
  modulos: ModuloInfo[];
}

/** Los 15 módulos agrupados para el formulario de usuario. */
export const GRUPOS_MODULOS: GrupoModulos[] = [
  {
    titulo: 'Operación',
    modulos: [
      { id: 'pos', label: 'Punto de venta' },
      { id: 'caja', label: 'Caja' },
      { id: 'ventas', label: 'Historial de ventas' },
      { id: 'clientes', label: 'Clientes' },
    ],
  },
  {
    titulo: 'Inventario',
    modulos: [
      { id: 'inventario', label: 'Inventario' },
      { id: 'compras', label: 'Compras' },
      { id: 'reposicion', label: 'Reposición' },
      { id: 'mermas', label: 'Mermas' },
      { id: 'transferencias', label: 'Transferencias' },
      { id: 'inventario_fisico', label: 'Inventario físico' },
      { id: 'importar', label: 'Importar catálogo' },
    ],
  },
  {
    titulo: 'Gestión',
    modulos: [
      { id: 'finanzas', label: 'Finanzas', requiere: 'ADMIN' },
      { id: 'usuarios', label: 'Usuarios', requiere: 'ADMIN' },
      { id: 'configuracion', label: 'Configuración', requiere: 'ADMIN' },
      { id: 'sucursales', label: 'Sucursales (global)', requiere: 'SUPER_ADMIN' },
    ],
  },
];
