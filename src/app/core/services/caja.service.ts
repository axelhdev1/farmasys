import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api';
import { AuthService } from '../auth/auth.service';
import { SucursalService } from './sucursal.service';
import {
  CajaSesion, MovimientoCaja, TotalesCaja,
  TipoMovimientoCaja, CategoriaMovimientoCaja,
} from '../models/caja.model';

/** Datos del reporte de cierre Z (crudos del backend). */
export interface ReporteZBackend {
  sucursal: string;
  cajero: string;
  terminal: string;
  aperturaEn: string;
  cerradaEn: string | null;
  estado: string;
  montoInicial: string | number;
  porMetodo: Record<string, string | number>;
  totalVendido: string | number;
  ingresos: string | number;
  egresos: string | number;
  efectivoEsperado: string | number;
  efectivoContado: string | number | null;
  diferencia: string | number | null;
  tickets: number;
  anuladas?: number;
  movimientos: Array<{ tipo: string; categoria: string; monto: string | number; motivo: string; fecha: string }>;
}
import { MetodoPago } from '../models/carrito.model';

/** Último cierre de un terminal (relevo de turno). */
export interface UltimoCierreTerminal {
  cerradaEn: string | null;
  cajeroAnterior: string;
  efectivoContado: string | null;
}

/** Terminal (cajón físico) con su estado para el selector de apertura. */
export interface TerminalCaja {
  id: string;
  nombre: string;
  ocupado: boolean;
  ocupadoPor: string | null;
  /** Desde cuándo está ocupado: delata cajas olvidadas. */
  ocupadoDesde: string | null;
  diasOcupado: number;
  ultimoCierre: UltimoCierreTerminal | null;
}

/** Mi caja abierta, viva en la sucursal que viva. */
export interface MiCajaAbierta {
  id: string;
  sucursalId: string;
  sucursalNombre: string;
  terminal: string;
  montoInicial: string;
  aperturaEn: string;
  diasAbierta: number;
}

/** Caja abierta hace demasiado tiempo (alerta de olvido para el ADMIN). */
export interface CajaOlvidada {
  id: string;
  sucursalId: string;
  sucursal: string;
  terminal: string;
  cajero: string;
  aperturaEn: string;
  diasAbierta: number;
}

/** Sesión de caja como la devuelve el backend. */
interface CajaBackend {
  id: string;
  sucursalId: string;
  cajeroId: string;
  terminal: string;
  montoInicial: string;
  aperturaEn: string;
  estado: string;
  efectivoEsperado: string | null;
  efectivoContado: string | null;
  diferencia: string | null;
  cerradaEn: string | null;
  /** Quién ABRIÓ la sesión. El backend lo incluye; antes se ignoraba. */
  cajero?: { nombres: string; apellidos: string } | null;
  /** Quién la CERRÓ. Distinto del cajero cuando un admin fuerza el cierre. */
  cerradaPor?: { nombres: string; apellidos: string } | null;
  /** Solo en el histórico: vendido y tickets del turno. */
  totalVentas?: string | number;
  cantidadTickets?: number;
}

/** Resumen/arqueo como lo devuelve el backend. */
interface ResumenBackend {
  montoInicial: string;
  porMetodo: Record<string, string>;
  totalVendido: string;
  ingresos: string;
  egresos: string;
  efectivoEsperado: string;
  tickets: number;
  movimientos: MovimientoCaja[];
}

/**
 * CajaService — turnos de caja conectados al backend real.
 * Usa la sucursal REAL del usuario (del token), no el mock de SucursalService.
 * Expone signals reactivos para que la pantalla se actualice sola.
 */
@Injectable({ providedIn: 'root' })
export class CajaService {
  private readonly api  = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly sucursalSvc = inject(SucursalService);

  private readonly _cajaActiva = signal<CajaSesion | null>(null);
  private readonly _totales    = signal<TotalesCaja | null>(null);
  private readonly _historial  = signal<CajaSesion[]>([]);

  /** Signals públicos (los lee el componente). */
  readonly cajaActivaSig = this._cajaActiva.asReadonly();
  readonly totalesSig    = this._totales.asReadonly();
  readonly historialSig  = this._historial.asReadonly();

  // Fuente única de la sucursal activa: respeta el switch del SUPER_ADMIN.
  // El effect de abajo ya recarga la caja sola cuando cambia.
  private readonly sucursalId = computed(() => this.sucursalSvc.sucursalActivaId());

  constructor() {
    // Carga la caja abierta y el histórico cuando hay sucursal (tras login).
    effect(() => {
      const sid = this.sucursalId();
      if (sid) this.recargar();
    });
  }

  /** Recarga caja abierta + histórico desde el backend. */
  recargar(): void {
    const sid = this.sucursalId();
    if (!sid) return;
    this.api.get<CajaBackend | null>('/caja/abierta', { sucursalId: sid }).subscribe({
      next: (c) => {
        if (c) {
          this._cajaActiva.set(this.mapSesion(c));
          this.cargarResumen(c.id);
        } else {
          this._cajaActiva.set(null);
          this._totales.set(null);
        }
      },
      error: () => { this._cajaActiva.set(null); this._totales.set(null); },
    });
    this.api.get<CajaBackend[]>(`/caja/historico/${sid}`).subscribe({
      next: (lista) =>
        this._historial.set(lista.filter((c) => c.estado === 'CERRADA').map((c) => this.mapSesion(c)).slice(0, 8)),
      error: () => this._historial.set([]),
    });
  }

  /**
   * Carga el arqueo de una caja concreta en `totalesSig`, aunque NO sea la de
   * la sucursal activa. Lo usa la pantalla para cerrar una caja que quedó
   * abierta en otra botica.
   */
  cargarResumenDe(cajaId: string): void {
    this.cargarResumen(cajaId);
  }

  private cargarResumen(cajaId: string): void {
    this.api.get<ResumenBackend>(`/caja/${cajaId}/resumen`).subscribe({
      next: (r) => {
        this._totales.set(this.mapTotales(r));
        // Adjunta los movimientos al objeto de sesión para el panel.
        const actual = this._cajaActiva();
        if (actual && actual.id === cajaId) {
          this._cajaActiva.set({ ...actual, movimientos: r.movimientos ?? [] });
        }
      },
      error: () => this._totales.set(null),
    });
  }

  /**
   * Terminales (cajones físicos) de la sucursal activa, con su estado de
   * ocupación y el último cierre de cada uno (para sugerir el fondo inicial).
   */
  terminales(): Observable<TerminalCaja[]> {
    return this.api.get<TerminalCaja[]>('/caja/terminales', {
      sucursalId: this.sucursalId(),
    });
  }

  /** Mi caja abierta en cualquier sucursal (null si no tengo ninguna). */
  miCajaAbierta(): Observable<MiCajaAbierta | null> {
    return this.api.get<MiCajaAbierta | null>('/caja/mi-abierta');
  }

  /** Cajas abiertas hace más de `horas` (alerta de olvido; solo ADMIN). */
  cajasOlvidadas(horas = 24): Observable<CajaOlvidada[]> {
    return this.api.get<CajaOlvidada[]>('/caja/olvidadas', { horas });
  }

  /** Abre una caja para el usuario actual en su sucursal. */
  abrir(params: { terminal: string; montoInicial: number }): Observable<CajaBackend> {
    return this.api
      .post<CajaBackend>('/caja/abrir', {
        sucursalId: this.sucursalId(),
        terminal: params.terminal,
        montoInicial: params.montoInicial,
      })
      .pipe(tap(() => this.recargar()));
  }

  /** Registra un movimiento de efectivo (ingreso/egreso). */
  registrarMovimiento(
    cajaId: string,
    mov: { tipo: TipoMovimientoCaja; categoria: CategoriaMovimientoCaja; monto: number; motivo: string },
  ): Observable<unknown> {
    return this.api
      .post<unknown>(`/caja/${cajaId}/movimientos`, mov)
      .pipe(tap(() => this.cargarResumen(cajaId)));
  }

  /** Cierra la caja con el efectivo contado (arqueo). */
  cerrar(cajaId: string, efectivoContado: number, motivoDiferencia?: string): Observable<CajaBackend> {
    return this.api
      .patch<CajaBackend>(`/caja/${cajaId}/cerrar`, { efectivoContado, motivoDiferencia })
      .pipe(tap(() => this.recargar()));
  }

  /** Reporte de cierre Z (imprimible): datos crudos del backend. */
  reporteZ(cajaId: string): Observable<ReporteZBackend> {
    return this.api.get<ReporteZBackend>(`/caja/${cajaId}/reporte-z`);
  }

  // ── Compatibilidad con el POS (lee la caja activa por signals) ───────────
  /** Caja ABIERTA del usuario (los parámetros se ignoran: es la suya). */
  cajaAbiertaDe(_cajeroId: string, _sucursalId: string): CajaSesion | undefined {
    return this._cajaActiva() ?? undefined;
  }

  /** La venta ya quedó registrada en el backend; aquí solo refrescamos totales. */
  registrarVenta(
    cajaId: string,
    _venta: { comprobante: string; metodo: MetodoPago; total: number },
  ): void {
    this.cargarResumen(cajaId);
  }

  porId(id: string): CajaSesion | undefined {
    const a = this._cajaActiva();
    if (a?.id === id) return a;
    return this._historial().find((s) => s.id === id);
  }

  sesiones(): CajaSesion[] {
    const a = this._cajaActiva();
    return a ? [a, ...this._historial()] : this._historial();
  }

  totales(_sesion: CajaSesion): TotalesCaja | null {
    return this._totales();
  }

  // ── Mapeos backend → modelos del front ──────────────────────────────────
  /** Nombre completo, o '—' si el backend no lo trae. */
  private nombreDe(p?: { nombres: string; apellidos: string } | null): string {
    return p ? `${p.nombres} ${p.apellidos ?? ''}`.trim() : '';
  }

  private mapSesion(c: CajaBackend): CajaSesion {
    return {
      id: c.id,
      sucursalId: c.sucursalId,
      cajeroId: c.cajeroId,
      // BUG CORREGIDO: aquí se ponía el usuario CONECTADO en vez del cajero de
      // la sesión. El historial de cierres mostraba el nombre de quien estaba
      // mirando la pantalla, así que las mismas sesiones aparecían a nombre de
      // personas distintas según quién entrara. En un módulo de arqueo de
      // efectivo eso no es un detalle: falsea la única pista de quién manejó
      // esa caja. El backend siempre devolvió `cajero`; el front lo ignoraba.
      cajeroNombre: this.nombreDe(c.cajero) || '—',
      terminal: c.terminal,
      montoInicial: Number(c.montoInicial),
      aperturaEn: c.aperturaEn,
      estado: c.estado === 'CERRADA' ? 'CERRADA' : 'ABIERTA',
      ventas: [],
      movimientos: [],
      cierre: c.estado === 'CERRADA'
        ? {
            efectivoEsperado: Number(c.efectivoEsperado ?? 0),
            efectivoContado: Number(c.efectivoContado ?? 0),
            diferencia: Number(c.diferencia ?? 0),
            // El desglose por método solo lo trae el arqueo detallado; en el
            // histórico no se muestra, por eso queda en 0.
            totalEfectivo: 0, totalYapePlin: 0, totalTarjeta: 0, totalOtros: 0,
            totalIngresos: 0, totalEgresos: 0,
            // Estos DOS sí se muestran en "Cierres recientes". Estaban fijos en
            // 0 y la lista decía "S/. 0.00 · 0 tickets" en todos los turnos,
            // hubiera vendido lo que hubiera vendido.
            totalVentas: Number(c.totalVentas ?? 0),
            cantidadTickets: c.cantidadTickets ?? 0,
            cerradaEn: c.cerradaEn ?? '',
            cerradaPorNombre: this.nombreDe(c.cerradaPor),
            // Cierre forzado: lo cerró alguien distinto del cajero que abrió.
            cerradaPorAdmin:
              !!c.cerradaPor && this.nombreDe(c.cerradaPor) !== this.nombreDe(c.cajero),
          }
        : undefined,
    };
  }

  private mapTotales(r: ResumenBackend): TotalesCaja {
    const pm = r.porMetodo ?? {};
    const efectivo = Number(pm['EFECTIVO'] ?? 0);
    const yape = Number(pm['YAPE_PLIN'] ?? 0);
    const tarjeta = Number(pm['TARJETA'] ?? 0);
    const otros = Number(pm['TRANSFERENCIA'] ?? 0) + Number(pm['MIXTO'] ?? 0);
    return {
      totalEfectivo: efectivo,
      totalYapePlin: yape,
      totalTarjeta: tarjeta,
      totalOtros: otros,
      totalVentas: Number(r.totalVendido ?? 0),
      cantidadTickets: r.tickets ?? 0,
      totalIngresos: Number(r.ingresos ?? 0),
      totalEgresos: Number(r.egresos ?? 0),
      efectivoEsperado: Number(r.efectivoEsperado ?? 0),
    };
  }
}
