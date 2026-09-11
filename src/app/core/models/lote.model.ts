/**
 * Lote de un producto en una sucursal.
 *
 * En una botica real el stock no es un número suelto: son lotes con su propia
 * fecha de vencimiento. La regla de despacho es FEFO (First Expired, First Out):
 * se vende primero el lote que vence antes.
 *
 * El stock total de un producto en una sucursal = suma de cantidadBase de sus lotes.
 */
export interface Lote {
  productoId: string;
  sucursalId: string;
  /** Código de lote impreso en el empaque (ej. "L-A2451") */
  lote: string;
  /** Fecha de vencimiento en formato ISO (YYYY-MM-DD) */
  vencimiento: string;
  /** Unidades base disponibles de ESTE lote */
  cantidadBase: number;
}
