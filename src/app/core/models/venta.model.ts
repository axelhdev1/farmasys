import { Cliente } from './cliente.model';
import { MetodoPago } from './carrito.model';

/**
 * Estados posibles de una venta.
 */
export type EstadoVenta = 'COMPLETADA' | 'ANULADA' | 'PENDIENTE';

/**
 * Tipos de comprobante de pago (Perú - SUNAT).
 */
export type TipoComprobante = 'BOLETA' | 'FACTURA' | 'TICKET';

/**
 * Una línea de detalle dentro de la venta.
 * Snapshot del producto al momento de la venta (precio puede cambiar después).
 */
export interface ItemVenta {
  productoId: string;
  codigoProducto: string;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;       // precio con IGV al momento de la venta
  descuentoUnitario: number;    // descuento por unidad (0 si no hay)
  subtotal: number;             // (precioUnitario - descuentoUnitario) * cantidad
}

/**
 * Payload que se envía al backend para registrar una venta.
 * POST /api/v1/ventas
 */
export interface VentaRequest {
  clienteId?: string;           // null → venta a consumidor final
  tipoComprobante: TipoComprobante;
  metodoPago: MetodoPago;
  items: ItemVenta[];
  observaciones?: string;
  sucursalId: string;
  cajeroId: string;
}

/**
 * Respuesta del backend al registrar una venta exitosa.
 */
export interface VentaResponse {
  id: string;
  numeroComprobante: string;    // ej. "B001-00001234"
  fechaHora: string;            // ISO 8601
  estado: EstadoVenta;
  tipoComprobante: TipoComprobante;
  metodoPago: MetodoPago;
  items: ItemVenta[];
  subtotal: number;
  igv: number;
  descuento: number;
  total: number;
  cliente?: Cliente;
  cajeroNombre: string;
  sucursalNombre: string;
}

/**
 * Venta completa tal como se muestra en el historial / reportes.
 * Extiende VentaResponse con datos adicionales de auditoría.
 */
export interface Venta extends VentaResponse {
  creadoEn: string;             // ISO 8601 - fecha de creación en BD
  actualizadoEn?: string;
  motivoAnulacion?: string;     // solo si estado === 'ANULADA'
}

/**
 * Filtros para consultar el historial de ventas.
 * GET /api/v1/ventas?desde=...&hasta=...&cajeroId=...
 */
export interface FiltroVentas {
  desde?: string;               // ISO date "2025-01-01"
  hasta?: string;
  cajeroId?: string;
  sucursalId?: string;
  estado?: EstadoVenta;
  metodoPago?: MetodoPago;
  page?: number;
  size?: number;
}
