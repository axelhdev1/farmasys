import { Injectable, inject } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { ApiService } from './api';
import { Venta } from '../models/venta.model';

/** Venta tal como la devuelve el backend (Decimal como string). */
export interface VentaBackend {
  id: string;
  numeroComprobante: string;
  tipoComprobante: 'BOLETA' | 'FACTURA' | 'TICKET';
  estado: 'COMPLETADA' | 'ANULADA' | 'PENDIENTE';
  subtotal: string;
  igv: string;
  descuento?: string;
  total: string;
  fecha: string;
  motivoAnulacion?: string | null;
  anuladaEn?: string | null;
  items: Array<{
    id: string;
    productoId: string;
    presentacionId?: string | null;
    cantidad: number;
    precioUnitario: string;
    subtotal: string;
    producto?: { nombre: string; codigo: string } | null;
  }>;
  pagos: Array<{ metodo: string; monto: string; referencia?: string | null }>;
  cliente?: {
    tipoDocumento: string;
    numeroDocumento: string;
    nombres: string;
    apellidos?: string | null;
    razonSocial?: string | null;
  } | null;
  cajero?: {
    nombres: string;
    apellidos?: string | null;
  } | null;
  /** Devoluciones registradas de la venta (para mostrar neto / badge). */
  devoluciones?: Array<{ id: string; monto: string }> | null;
}

/** Respuesta paginada del Historial (incluye el total real de la consulta). */
export interface HistorialPaginado {
  items: VentaBackend[];
  total: number;
  page: number;
  size: number;
}

/** Filtros opcionales para el historial de ventas (se mandan al backend). */
export interface FiltroListadoVentas {
  q?: string;
  /** Historial de compras de un cliente concreto. */
  clienteId?: string;
  metodoPago?: string;
  desde?: string;
  hasta?: string;
  estado?: string;
  orden?: string;
  page?: number;
  size?: number;
}

/**
 * VentaService — registro y consulta de ventas contra el backend REAL.
 * El registro (POS) es transaccional en el servidor: FEFO, correlativo
 * atómico, idempotencia y pagos. Aquí solo viven las llamadas HTTP.
 */
@Injectable({ providedIn: 'root' })
export class VentaService {
  private readonly api = inject(ApiService);

  /** Lista las ventas REALES del backend (para el Historial). Devuelve crudo. */
  listarBackend(sucursalId?: string, filtros?: FiltroListadoVentas): Observable<VentaBackend[]> {
    const params: Record<string, string> = {};
    if (sucursalId) params['sucursalId'] = sucursalId;
    if (filtros?.desde) params['desde'] = filtros.desde;
    if (filtros?.hasta) params['hasta'] = filtros.hasta;
    if (filtros?.estado && filtros.estado !== 'todos') params['estado'] = filtros.estado;
    if (filtros?.clienteId) params['clienteId'] = filtros.clienteId;
    if (filtros?.page != null) params['page'] = String(filtros.page);
    if (filtros?.size != null) params['size'] = String(filtros.size);
    return this.api.get<VentaBackend[]>('/ventas', Object.keys(params).length ? params : undefined);
  }

  /**
   * Historial paginado con TODOS los filtros aplicados en el SERVIDOR
   * (búsqueda, método, estado, fechas, orden) + total real de la consulta.
   */
  listarPaginado(sucursalId?: string, filtros?: FiltroListadoVentas): Observable<HistorialPaginado> {
    const params: Record<string, string> = {};
    if (sucursalId) params['sucursalId'] = sucursalId;
    if (filtros?.q?.trim()) params['q'] = filtros.q.trim();
    if (filtros?.metodoPago && filtros.metodoPago !== 'todos') params['metodoPago'] = filtros.metodoPago;
    if (filtros?.estado && filtros.estado !== 'todos') params['estado'] = filtros.estado;
    if (filtros?.desde) params['desde'] = filtros.desde;
    if (filtros?.hasta) params['hasta'] = filtros.hasta;
    if (filtros?.orden) params['orden'] = filtros.orden;
    if (filtros?.page != null) params['page'] = String(filtros.page);
    if (filtros?.size != null) params['size'] = String(filtros.size);
    return this.api.get<HistorialPaginado>('/ventas/historial', Object.keys(params).length ? params : undefined);
  }

  // ════════════════════════════════════════════════════════════════════════
  /**
   * Anula una venta registrada.
   * PATCH /api/v1/ventas/{id}/anular
   */
  anular(id: string, motivo: string): Observable<Venta> {
    return this.api.patch<Venta>(`/ventas/${id}/anular`, { motivo });
  }

  /** Cuenta las anulaciones REALIZADAS en un rango (por fecha de anulación). */
  contarAnuladas(sucursalId?: string, desde?: string, hasta?: string): Observable<{ count: number }> {
    const params: Record<string, string> = {};
    if (sucursalId) params['sucursalId'] = sucursalId;
    if (desde) params['desde'] = desde;
    if (hasta) params['hasta'] = hasta;
    return this.api.get<{ count: number }>('/ventas/anuladas/contar', Object.keys(params).length ? params : undefined);
  }

  /** Tiempo máximo de espera del cobro antes de dar por perdida la respuesta. */
  private static readonly TIMEOUT_COBRO_MS = 15_000;

  /**
   * Registra una venta REAL en el backend (transaccional, FEFO, pago).
   *
   * Idempotencia: `idempotencyKey` viaja al backend; si el cobro se reintenta
   * con la MISMA clave (p. ej. tras un timeout de red), el backend devuelve la
   * venta ya registrada en vez de duplicarla. El POS es quien genera y
   * conserva la clave entre reintentos.
   */
  registrarPOS(input: {
    sucursalId: string;
    cajaSesionId?: string;
    clienteId?: string;
    tipoComprobante: 'BOLETA' | 'FACTURA' | 'TICKET';
    items: { productoId: string; presentacionId?: string; cantidad: number }[];
    metodoPago: string;
    total: number;
    descuento?: number;
    referencia?: string;
    /** Pago mixto: si se envía, se usa en lugar del método único. */
    pagos?: { metodo: string; monto: number; referencia?: string }[];
    /** Clave de idempotencia (UUID generado por el POS). */
    idempotencyKey?: string;
  }): Observable<VentaBackend> {
    const pagos =
      input.pagos && input.pagos.length > 0
        ? input.pagos
        : [{ metodo: input.metodoPago, monto: input.total, referencia: input.referencia }];
    return this.api.post<VentaBackend>('/ventas', {
      sucursalId: input.sucursalId,
      cajaSesionId: input.cajaSesionId,
      clienteId: input.clienteId,
      tipoComprobante: input.tipoComprobante,
      items: input.items,
      descuento: input.descuento,
      pagos,
      idempotencyKey: input.idempotencyKey,
    }).pipe(timeout(VentaService.TIMEOUT_COBRO_MS));
  }

}
