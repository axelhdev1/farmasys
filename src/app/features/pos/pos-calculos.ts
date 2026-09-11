import { Producto, Presentacion } from '../../core/models/producto.model';
import { ItemCarrito } from '../../core/models/carrito.model';

/**
 * Cálculos puros del POS (sin estado, sin Angular).
 *
 * Viven fuera del componente para poder testearse de forma aislada y para que
 * el PosComponent no cargue con lógica de dominio. Todas son funciones puras:
 * mismas entradas → misma salida, sin efectos secundarios.
 */

/** Redondeo a 2 decimales (centavos). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Factor de la presentación de venta por defecto (la mayor, p. ej. caja). 1 si no es fraccionable. */
export function factorVenta(p: Producto): number {
  if (!p.presentaciones?.length) return 1;
  return Math.max(...p.presentaciones.map((x) => x.factor));
}

/** Factor (unidades base) de una línea concreta del carrito. */
export function factorLinea(item: ItemCarrito): number {
  return item.presentacion?.factor ?? factorVenta(item.producto);
}

/** Clave estable de línea: producto + presentación. Caja y blíster = líneas distintas. */
export function lineaId(item: ItemCarrito): string {
  return `${item.producto.id}::${item.presentacion?.id ?? 'base'}`;
}

/** Precio más bajo del producto (para el "Desde S/." de la fila). */
export function precioBaseDesde(p: Producto): number {
  if (!p.presentaciones?.length) return p.precioVenta;
  return Math.min(...p.presentaciones.map((x) => x.precioVenta));
}

/** Unidades base ya comprometidas en el carrito para un producto (todas sus líneas). */
export function baseEnCarrito(items: ItemCarrito[], productoId: string): number {
  return items
    .filter((i) => i.producto.id === productoId)
    .reduce((acc, i) => acc + i.cantidad * factorLinea(i), 0);
}

export interface TotalesVenta {
  subtotal: number;
  igv: number;
  descuento: number;
  total: number;
  cantidadItems: number;
}

/**
 * Totales de la venta. Los precios del carrito YA incluyen IGV (precio final),
 * por lo que el subtotal se obtiene desagregando el IGV del total.
 */
export function calcularTotales(
  items: ItemCarrito[],
  igvRate: number,
  descuento = 0,
): TotalesVenta {
  const totalBruto = items.reduce((acc, it) => acc + it.precioUnitario * it.cantidad, 0);
  // El descuento nunca puede ser negativo ni superar el total.
  const desc = Math.min(Math.max(descuento, 0), totalBruto);
  const total = totalBruto - desc;
  const subtotal = total / (1 + igvRate);
  const igv = total - subtotal;
  const cantidadItems = items.reduce((acc, it) => acc + it.cantidad, 0);
  return {
    subtotal: round2(subtotal),
    igv: round2(igv),
    descuento: round2(desc),
    total: round2(total),
    cantidadItems,
  };
}

/** Etiqueta corta de presentación para los chips de la tabla (Caja/Blís/Uni). */
export function chipPresentacion(pres: Presentacion): string {
  switch (pres.id) {
    case 'caja':
      return 'Caja';
    case 'blister':
      return 'Blís';
    case 'unidad':
      return 'Uni';
    default:
      return pres.nombre;
  }
}
