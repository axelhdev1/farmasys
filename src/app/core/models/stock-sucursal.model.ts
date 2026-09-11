/**
 * Stock independiente por sucursal.
 *
 * Cada par (productoId, sucursalId) tiene su propia cantidad.
 * La cantidad está SIEMPRE en unidad base (pastillas, ml, unidades atómicas).
 *
 * En backend será una tabla:
 *   stock_sucursal (producto_id, sucursal_id, cantidad_base, actualizado_en)
 *   PK = (producto_id, sucursal_id)
 *
 * En frontend lo mantenemos como una colección plana en StockSucursalService
 * y lo consultamos por sucursal activa.
 */
export interface StockSucursal {
  productoId: string;
  sucursalId: string;
  /** Cantidad en unidad base (pastillas, no cajas) */
  cantidadBase: number;
  /** Stock mínimo deseado para esta sucursal (alerta de reposición) */
  stockMinimo?: number;
  /** ISO timestamp de la última actualización */
  actualizadoEn?: string;
}

/**
 * Movimiento de stock — auditoría de cada cambio en cantidad.
 * Cuando se conecte backend, cada venta / ingreso / ajuste genera uno de estos.
 */
export interface MovimientoStock {
  id: string;
  productoId: string;
  sucursalId: string;
  tipo: TipoMovimiento;
  cantidadBase: number;       // positivo = entrada, negativo = salida
  motivo?: string;
  referenciaId?: string;      // id de venta, compra, traslado, etc.
  usuarioId?: string;
  fecha: string;              // ISO timestamp
}

export type TipoMovimiento =
  | 'VENTA'
  | 'COMPRA'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO'
  | 'TRASLADO_SALIDA'
  | 'TRASLADO_INGRESO'
  | 'DEVOLUCION'
  | 'MERMA';
