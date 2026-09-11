/**
 * Modelos de sucursal (multi-botica).
 *
 * Cada botica del cliente es una Sucursal.
 * El SUPER_ADMIN puede ver y gestionar todas; el ADMIN solo la suya.
 *
 * En backend: cada tabla de negocio (ventas, stock, cierres, etc.)
 * tendrá una FK  sucursal_id  que filtra los datos automáticamente.
 */

export type EstadoSucursal = 'ACTIVA' | 'INACTIVA' | 'EN_MANTENIMIENTO';

/**
 * Datos de un QR estático de pago (Yape o Plin) asociado a una sucursal.
 *
 * El cliente lo escanea con su app y paga directamente al celular del local,
 * SIN comisión de pasarela. El cajero verifica visualmente el pago en el
 * celular del cliente y confirma en el POS.
 */
export interface PagoQR {
  /** URL de la imagen del QR (idealmente PNG, almacenada en backend o CDN) */
  imagenUrl: string;
  /** Celular asociado al QR (para verificación y para mostrarlo al cliente) */
  celular: string;
  /** Nombre del titular de la cuenta (lo que verá el cliente en su app) */
  titular?: string;
}

export interface Sucursal {
  id: string;
  nombre: string;
  direccion: string;
  distrito: string;
  telefono: string;
  estado: EstadoSucursal;
  /** Email del administrador responsable de esa botica */
  adminEmail: string;
  /** Fecha de apertura (ISO string) */
  apertura: string;

  // ── Pagos QR directos (sin comisión de pasarela) ──────────────────────
  /** QR/celular de Yape configurado para esta sucursal (texto o URL). */
  qrYape?: string;
  /** QR/celular de Plin configurado para esta sucursal (texto o URL). */
  qrPlin?: string;

  // ── Series de comprobantes por sucursal ───────────────────────────────
  /** Serie de boletas (ej. "B001" para central, "B002" para San Juan) */
  serieBoleta?: string;
  /** Serie de facturas (ej. "F001", "F002") */
  serieFactura?: string;
  /** Serie del ticket interno (ej. "T001"): NO quema correlativos legales */
  serieTicket?: string;
  /** Siguiente correlativo de boleta */
  siguienteBoleta?: number;
  /** Siguiente correlativo de factura */
  siguienteFactura?: number;
  /** Siguiente correlativo de ticket interno */
  siguienteTicket?: number;

  // ── Responsable / encargado de la botica ──────────────────────────────
  /** Id del usuario encargado de la sucursal. */
  responsableId?: string;
  /** Nombre del encargado (para mostrar). */
  responsableNombre?: string;

  // ── Datos operativos (preparados para features futuras) ───────────────
  /** Email de contacto de la botica. */
  email?: string;
  /** Horario de apertura ("08:00"). */
  horarioApertura?: string;
  /** Horario de cierre ("22:00"). */
  horarioCierre?: string;
  /** Meta de venta mensual (S/). */
  metaVentaMensual?: number;

  /** KPIs rápidos para la vista global del SUPER_ADMIN */
  kpi?: SucursalKpi;
}

export interface SucursalKpi {
  ventaHoy: number;
  ticketsHoy: number;
  productosActivos: number;
  alertasStock: number;
  alertasVencimiento: number;
}
