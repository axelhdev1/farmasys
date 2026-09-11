import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';
import { RolUsuario } from '../models/auth.model';

/** Usuario tal como lo devuelve el backend (gestión de cuentas). */
export interface UsuarioBackend {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
  dni: string | null;
  telefono: string | null;
  roles: RolUsuario[];
  permisos: string[];
  sucursalId: string | null;
  activo: boolean;
  debeCambiarPassword: boolean;
  ultimoAccesoEn: string | null;
}

export interface CrearUsuarioInput {
  nombres: string;
  apellidos: string;
  email: string;
  dni?: string;
  telefono?: string;
  password: string;
  roles: RolUsuario[];
  permisos?: string[];
  sucursalId?: string | null;
}

export type ActualizarUsuarioInput = Partial<Omit<CrearUsuarioInput, 'password'>> & {
  activo?: boolean;
};

/** Datos editables desde Mi Perfil. */
export interface MiPerfilInput {
  nombres?: string;
  apellidos?: string;
  telefono?: string;
}

/** Un intento de acceso al sistema (exitoso o fallido). */
export interface RegistroAcceso {
  id: string;
  fecha: string;
  email: string;
  nombre: string | null;
  rol: string | null;
  exito: boolean;
  motivo: string | null;
  ip: string | null;
}

/** Auditoría de accesos con su resumen del período. */
export interface HistorialAccesos {
  desde: string;
  total: number;
  exitosos: number;
  fallidos: number;
  /** Cuentas con 3+ intentos fallidos: lo que hay que mirar. */
  sospechosas: Array<{ email: string; intentos: number }>;
  registros: RegistroAcceso[];
}

/**
 * UsuarioApiService — gestión REAL de cuentas (solo ADMIN/SUPER_ADMIN en el backend).
 * Es la única fuente de usuarios para la pantalla de administración.
 */
@Injectable({ providedIn: 'root' })
export class UsuarioApiService {
  private readonly api = inject(ApiService);

  /** Lista usuarios. `incluirInactivos` también trae los desactivados. */
  listar(incluirInactivos = true): Observable<UsuarioBackend[]> {
    return this.api.get<UsuarioBackend[]>('/usuarios', { incluirInactivos });
  }

  crear(input: CrearUsuarioInput): Observable<UsuarioBackend> {
    return this.api.post<UsuarioBackend>('/usuarios', input);
  }

  actualizar(id: string, input: ActualizarUsuarioInput): Observable<UsuarioBackend> {
    return this.api.patch<UsuarioBackend>(`/usuarios/${id}`, input);
  }

  cambiarPassword(id: string, password: string): Observable<{ ok: true }> {
    return this.api.patch<{ ok: true }>(`/usuarios/${id}/password`, { password });
  }

  /** Soft-delete (activo=false). */
  desactivar(id: string): Observable<UsuarioBackend> {
    return this.api.delete<UsuarioBackend>(`/usuarios/${id}`);
  }

  reactivar(id: string): Observable<UsuarioBackend> {
    return this.api.patch<UsuarioBackend>(`/usuarios/${id}/reactivar`, {});
  }

  // ── Mi Perfil (cualquier rol) ─────────────────────────────────────────
  actualizarMiPerfil(input: MiPerfilInput): Observable<UsuarioBackend> {
    return this.api.patch<UsuarioBackend>('/usuarios/me', input);
  }

  cambiarMiPassword(actual: string, nueva: string): Observable<{ ok: true }> {
    return this.api.patch<{ ok: true }>('/usuarios/me/password', { actual, nueva });
  }

  /** Auditoría de accesos (solo administración). */
  accesos(dias = 7, soloFallidos = false): Observable<HistorialAccesos> {
    return this.api.get<HistorialAccesos>('/auth/accesos', {
      dias: String(dias),
      soloFallidos: String(soloFallidos),
    });
  }
}
