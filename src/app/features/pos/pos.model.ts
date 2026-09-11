import { ItemCarrito, MetodoPago } from '../../core/models/carrito.model';
import { Cliente } from '../../core/models/cliente.model';

/** Tipo de comprobante emitido por el POS. */
export type TipoComprobante = 'BOLETA' | 'FACTURA' | 'TICKET';

/**
 * Venta ya cerrada y lista para imprimir / mostrar el comprobante.
 * Es el modelo de presentación del ticket (no el DTO del backend).
 */
export interface VentaCompletada {
  numeroComprobante: string;
  tipoComprobante: TipoComprobante;
  fechaHora: Date;
  items: ItemCarrito[];
  subtotal: number;
  igv: number;
  descuento: number;
  total: number;
  metodoPago: MetodoPago;
  /** Referencia del pago digital (celular o cód. de operación Yape/Plin), si aplica */
  referenciaPago?: string;
  cliente: Cliente | null;
  cajero: string;
  terminal: string;
  /** Desglose real de pagos (del backend) — imprime línea por método en mixto. */
  pagos?: { label: string; monto: number; referencia?: string }[];
  /** Efectivo entregado por el cliente (solo pago en efectivo). */
  recibido?: number;
  /** Vuelto calculado contra el TOTAL REAL del backend. */
  vuelto?: number;
}
