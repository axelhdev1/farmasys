import { Injectable, computed, signal, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LoginRequest, LoginResponse, RolUsuario, Sesion, Usuario } from '../models/auth.model';
import { ApiService } from '../services/api';
import { permisosEfectivos } from './permisos';

const STORAGE_KEY = 'farmasys.sesion';

/**
 * Forma EXACTA de la respuesta del backend NestJS en POST /auth/login.
 * El backend devuelve el usuario y los tokens ANIDADOS; aquí se aplanan al
 * modelo `LoginResponse` que usa el resto del front.
 */
interface BackendLoginResponse {
  usuario: {
    id: string;
    nombres: string;
    apellidos: string;
    email: string;
    telefono: string | null;
    roles: RolUsuario[];
    permisos: string[];
    sucursalId: string | null;
    activo: boolean;
    debeCambiarPassword: boolean;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string; // p.ej. "15m"
  };
}

/**
 * AuthService.
 *
 * Responsabilidades:
 *  - Persistir y exponer la sesión activa.
 *  - Login / logout / refresh contra el backend NestJS.
 *  - Validar si el token está vigente.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api     = inject(ApiService);
  private readonly _sesion = signal<Sesion | null>(this.cargarSesionGuardada());

  /** Temporizador de renovación anticipada del access token. */
  private temporizadorRenovacion: ReturnType<typeof setTimeout> | null = null;
  /** Evita disparar dos refresh simultáneos. */
  private renovacionEnCurso: Promise<boolean> | null = null;

  /** Margen antes de la expiración real para renovar (60 s). */
  private static readonly MARGEN_RENOVACION_MS = 60_000;

  /** Sesión activa (readonly). */
  readonly sesion = this._sesion.asReadonly();

  /** ¿Hay un usuario autenticado con token vigente? */
  readonly autenticado = computed(() => {
    const s = this._sesion();
    return !!s && s.expiresAt > Date.now();
  });

  /** Usuario actual (o null si no hay sesión). */
  readonly usuario = computed<Usuario | null>(() => this._sesion()?.usuario ?? null);

  /** Roles del usuario actual. */
  readonly roles = computed(() => this._sesion()?.usuario.roles ?? []);

  /** Permisos efectivos del usuario actual (módulos accesibles). */
  readonly permisos = computed<string[]>(() => {
    const u = this._sesion()?.usuario;
    if (!u) return [];
    // Fallback en el propio front: si un usuario viejo llegó sin lista (sesión
    // vieja en localStorage), se usa la plantilla de su rol. Igual que el back.
    return permisosEfectivos(u.permisos ?? [], u.roles);
  });

  /** ¿El usuario tiene acceso a este módulo? SUPER_ADMIN siempre. */
  tienePermiso(modulo: string): boolean {
    if (this.tieneAlgunRol('SUPER_ADMIN')) return true;
    return this.permisos().includes(modulo);
  }

  /** ¿El usuario debe cambiar su contraseña antes de operar? */
  readonly debeCambiarPassword = computed(() =>
    this._sesion()?.usuario.debeCambiarPassword === true,
  );

  constructor() {
    // Si se restauró una sesión de un F5, hay que reprogramar su renovación:
    // sin esto, el token moría a los 15 min y el cajero era expulsado en
    // mitad de una venta aunque el refresh token siguiera siendo válido.
    if (this._sesion()) this.programarRenovacion();
  }

  /**
   * Login real contra el backend.
   * POST /api/v1/auth/login → { usuario, tokens: { accessToken, refreshToken, expiresIn } }
   * Solo se envían email y password (el backend rechaza campos extra).
   */
  async login(req: LoginRequest): Promise<Usuario> {
    const resp = await firstValueFrom(
      this.api.post<BackendLoginResponse>('/auth/login', {
        email: req.email.trim().toLowerCase(),
        password: req.password,
      }),
    );

    const usuario = this.mapearUsuario(resp.usuario);
    this.aplicarLogin(
      {
        accessToken: resp.tokens.accessToken,
        refreshToken: resp.tokens.refreshToken,
        expiresIn: this.segundosHastaExpirar(resp.tokens.accessToken),
        usuario,
      },
      req.recordarme ?? false,
    );
    return usuario;
  }

  /**
   * Renueva el access token usando el refresh token.
   * POST /api/v1/auth/refresh → { accessToken, refreshToken, expiresIn }
   * Devuelve true si se renovó; false si el refresh ya no es válido.
   */
  async refrescar(): Promise<boolean> {
    // Si ya hay una renovación volando, todos esperan la misma: dos refresh
    // en paralelo invalidarían el token del otro (rotación de refresh).
    if (this.renovacionEnCurso) return this.renovacionEnCurso;
    this.renovacionEnCurso = this.ejecutarRefresh();
    try {
      return await this.renovacionEnCurso;
    } finally {
      this.renovacionEnCurso = null;
    }
  }

  private async ejecutarRefresh(): Promise<boolean> {
    const actual = this._sesion();
    if (!actual?.refreshToken) return false;
    try {
      const tokens = await firstValueFrom(
        this.api.post<{ accessToken: string; refreshToken: string; expiresIn: string }>(
          '/auth/refresh',
          { refreshToken: actual.refreshToken },
        ),
      );
      this.aplicarLogin(
        {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: this.segundosHastaExpirar(tokens.accessToken),
          usuario: actual.usuario,
        },
        // Mantener el mismo tipo de almacenamiento que ya se usaba.
        !!localStorage.getItem(STORAGE_KEY),
      );
      return true;
    } catch {
      // OJO: solo se cierra la sesión si sigue siendo LA MISMA que se intentó
      // renovar. Si mientras la petición volaba el usuario inició sesión de
      // nuevo, este catch estaría matando una sesión recién creada y válida:
      // el usuario entraba, llegaba al dashboard y el guard lo rebotaba al
      // login con ?redirect=/dashboard. Ese era el "no me deja entrar".
      if (this._sesion()?.refreshToken === actual.refreshToken) {
        this.logout();
      }
      return false;
    }
  }

  /** Cierra sesión y limpia almacenamiento. */
  logout(): void {
    this.cancelarRenovacion();
    this._sesion.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignorar si no hay storage disponible (SSR, modo incógnito estricto)
    }
  }

  /**
   * Token de acceso vigente, o null si expiró.
   *
   * Es una LECTURA PURA: no cierra sesión ni escribe signals. Antes hacía
   * `logout()` aquí dentro, y como el interceptor la llama en cada petición,
   * una sola request tardía provocaba una escritura de signal en mitad de un
   * ciclo de render de Angular. Quien decide cerrar sesión es el guard o el
   * 401 del interceptor.
   */
  accessToken(): string | null {
    const s = this._sesion();
    if (!s) return null;
    return s.expiresAt > Date.now() ? s.accessToken : null;
  }

  /** Refresh token actual (para que el interceptor pueda renovar). */
  refreshToken(): string | null {
    return this._sesion()?.refreshToken ?? null;
  }

  /** Indica si el usuario tiene al menos uno de los roles dados. */
  tieneAlgunRol(...roles: string[]): boolean {
    const current = this.roles();
    return roles.some((r) => current.includes(r as RolUsuario));
  }

  // ===================== privados =====================

  /** Mapea el usuario del backend (sucursalId) al modelo del front (sucursalActualId). */
  private mapearUsuario(u: BackendLoginResponse['usuario']): Usuario {
    return {
      id: u.id,
      email: u.email,
      nombres: u.nombres,
      apellidos: u.apellidos,
      telefono: u.telefono ?? null,
      roles: u.roles,
      permisos: u.permisos ?? [],
      sucursalActualId: u.sucursalId ?? undefined,
      debeCambiarPassword: u.debeCambiarPassword ?? false,
    };
  }

  /**
   * Apaga el flag de "debe cambiar contraseña" en la sesión viva, tras un
   * cambio exitoso. Evita re-loguear solo para salir del modo obligatorio.
   */
  marcarPasswordCambiada(): void {
    const s = this._sesion();
    if (!s) return;
    const sesion: Sesion = { ...s, usuario: { ...s.usuario, debeCambiarPassword: false } };
    this._sesion.set(sesion);
    this.persistir(sesion);
  }

  /** Actualiza datos básicos del usuario en la sesión viva (tras editar perfil). */
  actualizarUsuarioSesion(cambios: Partial<Usuario>): void {
    const s = this._sesion();
    if (!s) return;
    const sesion: Sesion = { ...s, usuario: { ...s.usuario, ...cambios } };
    this._sesion.set(sesion);
    this.persistir(sesion);
  }

  /** Reescribe la sesión en el storage donde ya vivía (local o session). */
  private persistir(sesion: Sesion): void {
    try {
      if (localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sesion));
      } else if (sessionStorage.getItem(STORAGE_KEY)) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sesion));
      }
    } catch {
      // no-op
    }
  }

  /** Calcula los segundos hasta la expiración leyendo el claim `exp` del JWT. */
  private segundosHastaExpirar(token: string): number {
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
      if (!payload.exp) return 900;
      const segundos = payload.exp - Math.floor(Date.now() / 1000);
      return segundos > 0 ? segundos : 900;
    } catch {
      return 900;
    }
  }

  private aplicarLogin(resp: LoginResponse, recordarme: boolean): void {
    const sesion: Sesion = {
      accessToken: resp.accessToken,
      refreshToken: resp.refreshToken,
      expiresAt: Date.now() + resp.expiresIn * 1000,
      usuario: resp.usuario,
    };
    this._sesion.set(sesion);
    try {
      const storage = recordarme ? localStorage : sessionStorage;
      storage.setItem(STORAGE_KEY, JSON.stringify(sesion));
      // Limpiar el otro storage por las dudas
      (recordarme ? sessionStorage : localStorage).removeItem(STORAGE_KEY);
    } catch {
      // no-op
    }
    this.programarRenovacion();
  }

  /**
   * Programa la renovación del access token un minuto antes de que expire.
   *
   * Con esto la sesión se mantiene viva mientras el refresh token sea válido,
   * en vez de morir a los 15 min. Es un temporizador aparte: no toca el camino
   * de ninguna petición, así que no puede romper una venta en curso.
   */
  private programarRenovacion(): void {
    this.cancelarRenovacion();
    const s = this._sesion();
    if (!s?.refreshToken) return;

    const restante = s.expiresAt - Date.now() - AuthService.MARGEN_RENOVACION_MS;
    // Nunca por debajo de 5 s: evita un bucle si el reloj del equipo está mal.
    const espera = Math.max(restante, 5_000);

    this.temporizadorRenovacion = setTimeout(() => {
      this.temporizadorRenovacion = null;
      // Si la sesión ya se cerró mientras esperábamos, no renovar.
      if (this._sesion()) void this.refrescar();
    }, espera);
  }

  private cancelarRenovacion(): void {
    if (this.temporizadorRenovacion !== null) {
      clearTimeout(this.temporizadorRenovacion);
      this.temporizadorRenovacion = null;
    }
  }

  private cargarSesionGuardada(): Sesion | null {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Sesion;
      if (parsed.expiresAt <= Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}
