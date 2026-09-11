import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';

/** Estado de resultados (P&L) del período. Decimales como string. */
export interface EstadoResultados {
  ventasTotales: string;
  ventasNetas: string;
  costoVentas: string;
  utilidadBruta: string;
  margenBruto: string;
  /** Vencidos, dañados y robos valorizados a costo (E6). */
  perdidaMermas: string;
  gastos: string;
  /** Gastos viejos cargados como MERCADERIA: si es > 0 hay doble conteo. */
  gastosMercaderia?: string;
  utilidadNeta: string;
  margenNeto: string;
  tickets: number;
  ticketPromedio: string;
  valorInventario: string;
}

/** IGV estimado del período. NO es una declaración jurada. */
export interface IgvPeriodo {
  igvVentas: string;
  igvCompras: string;
  /** Negativo = crédito fiscal a favor. */
  porPagar: string;
  estimado: boolean;
}

export interface MargenCategoriaRow {
  categoria: string;
  unidades: number;
  ingreso: string;
  costo: string;
  utilidad: string;
  margenPct: string;
}

export interface TopUtilidadRow {
  productoId: string;
  nombre: string;
  codigo: string;
  categoria: string;
  unidades: number;
  ingreso: string;
  costo: string;
  utilidad: string;
  margenPct: string;
}

export interface DiasInventarioCategoria {
  categoria: string;
  valorInventario: string;
  costoVendido: string;
  /** null = sin ventas en el período, no se puede calcular. */
  dias: number | null;
  capitalDormido: boolean;
}

export interface DiasInventario {
  diasPeriodo: number;
  valorInventario: string;
  costoVentas: string;
  dias: number | null;
  categorias: DiasInventarioCategoria[];
}

export interface TopProductoRow {
  producto?: { nombre: string; codigo: string } | null;
  unidades: number;
  vendido: string;
}

export interface MetodoPagoRow { metodo: string; monto: string; operaciones: number; }
export interface CategoriaRow { categoria: string; monto: string; }
export interface VentaDiaRow { dia: string; total: string; }
export interface FlujoCaja {
  ingresos: string;
  egresosCompras: string;
  egresosGastos: string;
  egresos: string;
  saldo: string;
}

export type CategoriaGasto =
  | 'ALQUILER' | 'SUELDOS' | 'SERVICIOS' | 'MERCADERIA'
  | 'MARKETING' | 'MANTENIMIENTO' | 'IMPUESTOS' | 'TRANSPORTE' | 'OTROS';

export interface GastoRow {
  id: string;
  sucursalId: string;
  categoria: CategoriaGasto;
  descripcion: string;
  monto: string;
  fecha: string;
  usuario?: { nombres: string; apellidos?: string | null } | null;
}

/** Gasto fijo mensual (alquiler, sueldos, internet…). */
export interface GastoRecurrente {
  id: string;
  sucursalId: string;
  categoria: CategoriaGasto;
  descripcion: string;
  monto: string;
  diaDelMes: number;
  activo: boolean;
}

export interface CrearRecurrenteInput {
  sucursalId: string;
  categoria: CategoriaGasto;
  descripcion: string;
  monto: number;
  diaDelMes: number;
}

/** Meses de gastos fijos que aún no se registraron. */
export interface PendientesRecurrentes {
  pendientes: Array<{
    clave: string;
    recurrenteId: string;
    descripcion: string;
    categoria: CategoriaGasto;
    monto: string;
    anio: number;
    mes: number;
    fecha: string;
  }>;
  total: string;
}

export interface CrearGastoInput {
  sucursalId: string;
  categoria: CategoriaGasto;
  descripcion: string;
  monto: number;
  fecha?: string;
}

/** Rango de fechas (ISO) para los reportes financieros. */
export interface RangoFinanzas {
  desde?: string;
  hasta?: string;
}

/**
 * FinanzasService — fuente de datos del módulo de Finanzas.
 * Reúne los reportes (P&L, métodos de pago, categorías, flujo, tendencia) y
 * el CRUD de gastos. Todo desde datos reales del backend.
 */
@Injectable({ providedIn: 'root' })
export class FinanzasService {
  private readonly api = inject(ApiService);

  private q(r?: RangoFinanzas): Record<string, string> | undefined {
    if (!r) return undefined;
    const p: Record<string, string> = {};
    if (r.desde) p['desde'] = r.desde;
    if (r.hasta) p['hasta'] = r.hasta;
    return Object.keys(p).length ? p : undefined;
  }

  estadoResultados(sucursalId: string, r?: RangoFinanzas): Observable<EstadoResultados> {
    return this.api.get<EstadoResultados>(`/reportes/estado-resultados/${sucursalId}`, this.q(r));
  }

  metodosPago(sucursalId: string, r?: RangoFinanzas): Observable<MetodoPagoRow[]> {
    return this.api.get<MetodoPagoRow[]>(`/reportes/metodos-pago/${sucursalId}`, this.q(r));
  }

  ventasPorCategoria(sucursalId: string, r?: RangoFinanzas): Observable<CategoriaRow[]> {
    return this.api.get<CategoriaRow[]>(`/reportes/ventas-categoria/${sucursalId}`, this.q(r));
  }

  ventasPorDia(sucursalId: string, r?: RangoFinanzas): Observable<VentaDiaRow[]> {
    return this.api.get<VentaDiaRow[]>(`/reportes/ventas-por-dia/${sucursalId}`, this.q(r));
  }

  flujoCaja(sucursalId: string, r?: RangoFinanzas): Observable<FlujoCaja> {
    return this.api.get<FlujoCaja>(`/reportes/flujo-caja/${sucursalId}`, this.q(r));
  }

  topProductos(sucursalId: string, r?: RangoFinanzas, limit = 8): Observable<TopProductoRow[]> {
    return this.api.get<TopProductoRow[]>(`/reportes/top-productos/${sucursalId}`, {
      ...(this.q(r) ?? {}),
      limit: String(limit),
    });
  }

  /** IGV estimado del período (E7). */
  igv(sucursalId: string, r?: RangoFinanzas): Observable<IgvPeriodo> {
    return this.api.get<IgvPeriodo>(`/reportes/igv/${sucursalId}`, this.q(r));
  }

  /** Rentabilidad por categoría (E10). */
  margenCategorias(sucursalId: string, r?: RangoFinanzas): Observable<MargenCategoriaRow[]> {
    return this.api.get<MargenCategoriaRow[]>(`/reportes/margen-categorias/${sucursalId}`, this.q(r));
  }

  /** Top productos por utilidad generada (E10). */
  topUtilidad(sucursalId: string, r?: RangoFinanzas, limit = 20): Observable<TopUtilidadRow[]> {
    return this.api.get<TopUtilidadRow[]>(`/reportes/top-utilidad/${sucursalId}`, {
      ...(this.q(r) ?? {}),
      limit: String(limit),
    });
  }

  /** Días de inventario global y por categoría (E11). */
  diasInventario(sucursalId: string, r?: RangoFinanzas): Observable<DiasInventario> {
    return this.api.get<DiasInventario>(`/reportes/dias-inventario/${sucursalId}`, this.q(r));
  }

  // ── Gastos ────────────────────────────────────────────────────────────
  listarGastos(sucursalId: string, r?: RangoFinanzas): Observable<GastoRow[]> {
    return this.api.get<GastoRow[]>('/gastos', { sucursalId, ...(this.q(r) ?? {}) });
  }

  crearGasto(input: CrearGastoInput): Observable<GastoRow> {
    return this.api.post<GastoRow>('/gastos', input);
  }

  actualizarGasto(id: string, input: Partial<CrearGastoInput>): Observable<GastoRow> {
    return this.api.patch<GastoRow>(`/gastos/${id}`, input);
  }

  eliminarGasto(id: string): Observable<{ ok: true }> {
    return this.api.delete<{ ok: true }>(`/gastos/${id}`);
  }

  // ── Gastos fijos mensuales ────────────────────────────────────────────
  listarRecurrentes(sucursalId: string): Observable<GastoRecurrente[]> {
    return this.api.get<GastoRecurrente[]>('/gastos/recurrentes', { sucursalId });
  }

  pendientesRecurrentes(sucursalId: string): Observable<PendientesRecurrentes> {
    return this.api.get<PendientesRecurrentes>('/gastos/recurrentes/pendientes', { sucursalId });
  }

  crearRecurrente(input: CrearRecurrenteInput): Observable<GastoRecurrente> {
    return this.api.post<GastoRecurrente>('/gastos/recurrentes', input);
  }

  actualizarRecurrente(id: string, input: Partial<CrearRecurrenteInput> & { activo?: boolean }):
    Observable<GastoRecurrente> {
    return this.api.patch<GastoRecurrente>(`/gastos/recurrentes/${id}`, input);
  }

  eliminarRecurrente(id: string): Observable<{ ok: true }> {
    return this.api.delete<{ ok: true }>(`/gastos/recurrentes/${id}`);
  }

  aplicarRecurrentes(sucursalId: string, claves: string[]): Observable<{ registrados: number }> {
    return this.api.post<{ registrados: number }>('/gastos/recurrentes/aplicar', {
      sucursalId,
      claves,
    });
  }
}
