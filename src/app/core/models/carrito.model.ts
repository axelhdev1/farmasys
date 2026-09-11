import { Producto, Presentacion } from './producto.model';

/**
 * Línea del carrito de venta.
 * Cada item referencia un producto y mantiene cantidad y precio unitario al momento.
 *
 * `presentacion` (venta fraccionada): si está definida, la línea se vende en
 * esa presentación (caja/blíster/unidad) y su `factor` indica cuántas unidades
 * base descuenta cada unidad. Si es undefined → modo legacy (presentación caja).
 */
export interface ItemCarrito {
  producto: Producto;
  presentacion?: Presentacion;
  cantidad: number;
  precioUnitario: number;          // snapshot del precio al agregar (incluye IGV)
  descuentoUnitario?: number;
}

export interface TotalesCarrito {
  subtotal: number;                // suma sin IGV
  igv: number;                     // 18% calculado sobre subtotal
  descuento: number;
  total: number;                   // total final a cobrar
  cantidadItems: number;
}

export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'YAPE_PLIN' | 'TRANSFERENCIA' | 'MIXTO';
