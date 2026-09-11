/**
 * Modelos de autenticación.
 * Hoy se usan con un AuthService mock; cuando exista el backend
 * se mantendrán las mismas formas (la API devolverá lo mismo).
 */

/**
 * Roles del sistema:
 *  SUPER_ADMIN  → Dueño / desarrollador. Acceso total a TODAS las sucursales.
 *  ADMIN        → Administrador de UNA sucursal. Sin acceso a otras.
 *  VENDEDOR     → Cajero de su sucursal.
 *  FARMACEUTICO → Farmacéutico de su sucursal.
 *  ALMACENERO   → Almacenero de su sucursal.
 */
export type RolUsuario = 'SUPER_ADMIN' | 'ADMIN' | 'VENDEDOR' | 'FARMACEUTICO' | 'ALMACENERO';

export interface Usuario {
  id: string;
  email: string;
  nombres: string;
  apellidos: string;
  telefono?: string | null;
  roles: RolUsuario[];
  /** Módulos accesibles (efectivos, con fallback y pisos ya aplicados). */
  permisos: string[];
  /** ID de la sucursal a la que pertenece. Null solo para SUPER_ADMIN (ve todas). */
  sucursalActualId?: string;
  /** Si es true, se le obliga a cambiar la clave antes de usar el sistema. */
  debeCambiarPassword?: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
  recordarme?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  usuario: Usuario;
}

/** Snapshot persistible de la sesión activa. */
export interface Sesion {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  usuario: Usuario;
}
