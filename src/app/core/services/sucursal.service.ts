import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { Sucursal, EstadoSucursal } from '../models/sucursal.model';
import { AuthService } from '../auth/auth.service';
import { ApiService } from './api';

/** KPIs del día por sucursal (de /reportes/sucursales). Decimales como string. */
export interface SucursalKpi {
  sucursalId: string;
  tickets: number;
  totalVendido: string;
  /** Venta acumulada del mes en curso (para el avance vs meta). */
  totalVendidoMes?: string;
  ticketPromedio: string;
  sinStock: number;
  stockCritico: number;
  alertasVencimiento: number;
  /**
   * Capital inmovilizado en stock, **a costo** (costoPromedio × cantidad).
   * El backend siempre lo devolvía; faltaba declararlo aquí, y por eso el
   * dashboard lo recalculaba por su cuenta a precio de venta — dos números
   * distintos para lo mismo en la misma pantalla.
   */
  valorInventario?: string;
  /** Venta por día de los últimos 7 (última posición = hoy). Para el sparkline. */
  serie7d?: number[];
  /** Usuarios activos asignados a la sucursal. */
  personalActivo?: number;
  cajaAbierta: boolean;
  cajeroCaja: string | null;
}

/** Terminal (cajón físico) de una sucursal. */
export interface TerminalSucursal {
  id: string;
  nombre: string;
  activo?: boolean;
  ocupado?: boolean;
  ocupadoPor?: string | null;
}

/** Datos para crear/editar una sucursal (lo que acepta el backend). */
export interface SucursalInput {
  nombre: string;
  distrito?: string;
  direccion?: string;
  telefono?: string;
  estado?: EstadoSucursal;
  serieBoleta?: string;
  serieFactura?: string;
  /** Serie propia del ticket interno (no quema correlativos legales). */
  serieTicket?: string;
  qrYape?: string;
  qrPlin?: string;
  responsableId?: string | null;
  email?: string;
  horarioApertura?: string;
  horarioCierre?: string;
  metaVentaMensual?: number;
}

/** Sucursal tal como la devuelve el backend (Prisma). */
interface SucursalBackend {
  id: string;
  nombre: string;
  direccion: string;
  distrito: string;
  telefono: string;
  estado: EstadoSucursal;
  serieBoleta?: string | null;
  serieFactura?: string | null;
  serieTicket?: string | null;
  siguienteBoleta?: number | null;
  siguienteFactura?: number | null;
  siguienteTicket?: number | null;
  qrYape?: string | null;
  qrPlin?: string | null;
  responsableId?: string | null;
  responsable?: { nombres: string; apellidos?: string | null } | null;
  email?: string | null;
  horarioApertura?: string | null;
  horarioCierre?: string | null;
  metaVentaMensual?: string | null;
  creadoEn?: string | null;
}

/**
 * SucursalService — gestiona el contexto de sucursal activa.
 *
 * ── Cómo funciona ────────────────────────────────────────────────────────
 *  • SUPER_ADMIN: puede cambiar de sucursal en el header o ver modo global.
 *  • ADMIN/VENDEDOR/etc.: solo ven su sucursal (sucursalActualId del token).
 *
 * El padrón y los KPIs vienen del backend real (/sucursales, /reportes/*).
 */
@Injectable({ providedIn: 'root' })
export class SucursalService {

  // ── Lista de sucursales (REAL, desde el backend) ──────────────────────
  private readonly _sucursales = signal<Sucursal[]>([]);
  readonly sucursales = this._sucursales.asReadonly();

  private readonly auth = inject(AuthService);
  private readonly api  = inject(ApiService);
  private cargado = false;

  /** True mientras se trae el padrón de sucursales (para skeletons). */
  private readonly _cargando = signal(false);
  readonly cargando = this._cargando.asReadonly();

  /** Evita re-sembrar la sucursal del token si el usuario ya conmutó. */
  private sucursalSembrada = false;

  constructor() {
    // Carga las sucursales reales en cuanto hay sesión (el listado requiere auth).
    effect(() => {
      if (this.auth.usuario() && !this.cargado) {
        this.cargado = true;
        this.cargar();
      }
    });

    // Siembra la sucursal activa desde el token la PRIMERA vez que hay sesión.
    // Sin esto, inicializarDesdeSesion() nunca se llamaba y el header/sidebar/QR
    // podían mostrar una sucursal distinta a la del usuario.
    effect(() => {
      const delToken = this.auth.usuario()?.sucursalActualId;
      if (delToken && !this.sucursalSembrada) {
        this.sucursalSembrada = true;
        this._sucursalActivaId.set(delToken);
      }
    });
  }

  /** Trae el padrón real de sucursales y lo mapea al modelo del front. */
  cargar(): void {
    this._cargando.set(true);
    // incluirInactivas=true: la pantalla de gestión necesita ver y reactivar bajas.
    this.api.get<SucursalBackend[]>('/sucursales', { incluirInactivas: true }).subscribe({
      next: (rows) => {
        this._sucursales.set(rows.map((s) => this.mapSucursal(s)));
        // Si no hay sucursal activa válida, usa la primera real.
        const actual = this._sucursalActivaId();
        if (!actual || !rows.some((s) => s.id === actual)) {
          this._sucursalActivaId.set(rows[0]?.id ?? '');
        }
        this._cargando.set(false);
      },
      error: () => {
        this._sucursales.set([]);
        this._cargando.set(false);
      },
    });
  }

  // ── CRUD (solo SUPER_ADMIN/ADMIN en el backend) ──────────────────────
  crearSucursal(input: SucursalInput): Observable<SucursalBackend> {
    return this.api
      .post<SucursalBackend>('/sucursales', input)
      .pipe(tap(() => this.cargar()));
  }

  actualizarSucursal(id: string, input: Partial<SucursalInput>): Observable<SucursalBackend> {
    return this.api
      .patch<SucursalBackend>(`/sucursales/${id}`, input)
      .pipe(tap(() => this.cargar()));
  }

  /** Baja lógica (estado INACTIVA). */
  desactivarSucursal(id: string): Observable<SucursalBackend> {
    return this.api
      .delete<SucursalBackend>(`/sucursales/${id}`)
      .pipe(tap(() => this.cargar()));
  }

  /** Reactiva una sucursal (estado ACTIVA) vía actualización. */
  reactivarSucursal(id: string): Observable<SucursalBackend> {
    return this.actualizarSucursal(id, { estado: 'ACTIVA' });
  }

  // ── Terminales (cajones físicos) por sucursal ────────────────────────

  /** Terminales de una sucursal, con ocupación y último cierre. */
  terminalesDe(sucursalId: string): Observable<TerminalSucursal[]> {
    return this.api.get<TerminalSucursal[]>('/caja/terminales', { sucursalId });
  }

  /** Alta de terminal (solo ADMIN en el backend). */
  crearTerminal(sucursalId: string, nombre: string): Observable<TerminalSucursal> {
    return this.api.post<TerminalSucursal>('/caja/terminales', { sucursalId, nombre });
  }

  /** Renombrar o activar/desactivar un terminal (solo ADMIN). */
  actualizarTerminal(
    id: string,
    datos: { nombre?: string; activo?: boolean },
  ): Observable<TerminalSucursal> {
    return this.api.patch<TerminalSucursal>(`/caja/terminales/${id}`, datos);
  }

  // ── KPIs por sucursal (torre de control) ─────────────────────────────
  private readonly _kpis = signal<Record<string, SucursalKpi>>({});
  readonly kpis = this._kpis.asReadonly();

  /** Carga los KPIs del día de todas las sucursales (solo admin en backend). */
  cargarKpis(): void {
    this.api.get<SucursalKpi[]>('/reportes/sucursales').subscribe({
      next: (rows) => {
        const mapa: Record<string, SucursalKpi> = {};
        for (const r of rows) mapa[r.sucursalId] = r;
        this._kpis.set(mapa);
      },
      error: () => this._kpis.set({}),
    });
  }

  /**
   * Carga los KPIs de UNA sucursal y los fusiona en el mapa.
   *
   * A diferencia de `cargarKpis()`, este endpoint no exige rol admin: lo puede
   * llamar un cajero para su propia botica. Lo usa la campana de alertas del
   * header, que antes mostraba un número fijo.
   */
  cargarKpiDeSucursal(sucursalId: string): void {
    if (!sucursalId) return;
    this.api.get<SucursalKpi>(`/reportes/kpis/${sucursalId}`).subscribe({
      next: (k) => this._kpis.update((m) => ({ ...m, [sucursalId]: { ...k, sucursalId } })),
      // Silencioso: es un indicador secundario, no debe molestar si falla.
      error: () => undefined,
    });
  }

  /**
   * Alertas reales de la sucursal activa: productos sin stock + stock crítico
   * + lotes por vencer. Devuelve 0 si aún no se cargaron los KPIs.
   */
  readonly alertasSucursalActiva = computed(() => {
    const k = this._kpis()[this.sucursalActivaId() ?? ''];
    if (!k) return 0;
    return (k.sinStock ?? 0) + (k.stockCritico ?? 0) + (k.alertasVencimiento ?? 0);
  });

  private mapSucursal(s: SucursalBackend): Sucursal {
    return {
      id: s.id,
      nombre: s.nombre,
      direccion: s.direccion,
      distrito: s.distrito,
      telefono: s.telefono,
      estado: s.estado,
      adminEmail: '',
      apertura: s.creadoEn ?? '',
      qrYape: s.qrYape ?? undefined,
      qrPlin: s.qrPlin ?? undefined,
      serieBoleta: s.serieBoleta ?? undefined,
      serieFactura: s.serieFactura ?? undefined,
      serieTicket: s.serieTicket ?? undefined,
      siguienteBoleta: s.siguienteBoleta ?? undefined,
      siguienteFactura: s.siguienteFactura ?? undefined,
      siguienteTicket: s.siguienteTicket ?? undefined,
      responsableId: s.responsableId ?? undefined,
      responsableNombre: s.responsable
        ? `${s.responsable.nombres} ${s.responsable.apellidos ?? ''}`.trim()
        : undefined,
      email: s.email ?? undefined,
      horarioApertura: s.horarioApertura ?? undefined,
      horarioCierre: s.horarioCierre ?? undefined,
      metaVentaMensual: s.metaVentaMensual != null ? Number(s.metaVentaMensual) : undefined,
    };
  }

  // ── Sucursal seleccionada actualmente ─────────────────────────────────
  private readonly _sucursalActivaId = signal<string>('');

  /** Solo el SUPER_ADMIN puede conmutar de sucursal desde el header. */
  private readonly esSuperAdmin = computed(() => this.auth.tieneAlgunRol('SUPER_ADMIN'));

  /**
   * Id de la sucursal activa — FUENTE ÚNICA DE VERDAD.
   *
   *  • SUPER_ADMIN: manda su selección (cambiarSucursal). Su token trae una
   *    sucursal por defecto, pero no debe encadenarlo: puede supervisar todas.
   *  • Resto de roles: SIEMPRE la sucursal del token (no pueden conmutar).
   *    El backend igual valida el scope por JWT, esto es solo la vista.
   */
  readonly sucursalActivaId = computed(() => {
    const seleccion = this._sucursalActivaId();
    if (this.esSuperAdmin() && seleccion) return seleccion;
    return this.auth.usuario()?.sucursalActualId ?? seleccion;
  });

  /**
   * Sucursal activa resuelta contra el padrón real.
   * Deriva de sucursalActivaId() (no del signal interno) para no desincronizarse
   * del token. Puede ser undefined mientras carga el padrón: las plantillas ya
   * usan `?.` / `as`.
   */
  readonly sucursalActiva = computed(() =>
    this._sucursales().find(s => s.id === this.sucursalActivaId())
  );

  /** SUPER_ADMIN viendo todas las sucursales a la vez */
  readonly modoGlobal = signal<boolean>(false);

  /**
   * Padrón de sucursales CON sus KPIs reales del día ya fusionados
   * (traduce el shape del backend al `Sucursal.kpi` que esperan las vistas).
   * Requiere haber llamado antes a cargarKpis().
   */
  readonly sucursalesConKpi = computed<Sucursal[]>(() => {
    const mapa = this._kpis();
    return this._sucursales().map((s) => {
      const k = mapa[s.id];
      if (!k) return s;
      return {
        ...s,
        kpi: {
          ventaHoy: Number(k.totalVendido ?? 0),
          ticketsHoy: k.tickets ?? 0,
          productosActivos: 0, // el endpoint de KPIs no lo expone (aún)
          alertasStock: (k.sinStock ?? 0) + (k.stockCritico ?? 0),
          alertasVencimiento: k.alertasVencimiento ?? 0,
        },
      };
    });
  });

  /** KPI crudo del backend para una sucursal (cajaAbierta, cajeroCaja, etc.). */
  kpiDe(sucursalId: string): SucursalKpi | undefined {
    return this._kpis()[sucursalId];
  }

  // ── Computed rápidos (leen los KPIs REALES, no el kpi del padrón) ──────
  readonly totalVentaGlobal = computed(() =>
    Object.values(this._kpis()).reduce((acc, k) => acc + Number(k.totalVendido ?? 0), 0)
  );

  readonly totalTicketsGlobal = computed(() =>
    Object.values(this._kpis()).reduce((acc, k) => acc + (k.tickets ?? 0), 0)
  );

  readonly totalAlertasGlobal = computed(() =>
    Object.values(this._kpis()).reduce(
      (acc, k) => acc + (k.sinStock ?? 0) + (k.stockCritico ?? 0) + (k.alertasVencimiento ?? 0),
      0,
    )
  );

  readonly sucursalesActivas = computed(() =>
    this._sucursales().filter(s => s.estado === 'ACTIVA').length
  );

  // ── Acciones ──────────────────────────────────────────────────────────

  /** Cambia la sucursal activa (para SUPER_ADMIN). */
  cambiarSucursal(id: string): void {
    this._sucursalActivaId.set(id);
    this.modoGlobal.set(false);
  }

  /** Inicializa la sucursal activa según el token del usuario. */
  inicializarDesdeSesion(sucursalId: string): void {
    const existe = this._sucursales().some(s => s.id === sucursalId);
    if (existe) this._sucursalActivaId.set(sucursalId);
  }

  activarModoGlobal(): void {
    this.modoGlobal.set(true);
  }
}
