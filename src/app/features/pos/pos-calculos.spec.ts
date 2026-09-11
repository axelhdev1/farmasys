import {
  round2,
  factorVenta,
  factorLinea,
  lineaId,
  precioBaseDesde,
  baseEnCarrito,
  calcularTotales,
} from './pos-calculos';
import { Producto, Presentacion } from '../../core/models/producto.model';
import { ItemCarrito } from '../../core/models/carrito.model';

/** IGV vigente en los tests (mismo valor que el POS). */
const IGV = 0.18;

/** Fábrica mínima de productos para los cálculos (solo campos usados). */
function producto(over: Partial<Producto> = {}): Producto {
  return {
    id: 'p1',
    codigo: 'C001',
    nombre: 'Paracetamol 500mg',
    categoria: 'Analgésicos',
    precioVenta: 10,
    stockTotal: 100,
    unidadStock: 'unidades',
    requiereReceta: false,
    controlado: false,
    ...over,
  } as Producto;
}

function pres(over: Partial<Presentacion> = {}): Presentacion {
  return {
    id: 'pr1',
    nombre: 'Caja x 10',
    factor: 10,
    precioVenta: 10,
    esBase: false,
    ...over,
  } as Presentacion;
}

function item(over: Partial<ItemCarrito> = {}): ItemCarrito {
  return {
    producto: producto(),
    cantidad: 1,
    precioUnitario: 10,
    ...over,
  };
}

describe('pos-calculos', () => {
  describe('round2', () => {
    it('redondea a 2 decimales (centavos)', () => {
      expect(round2(10.005)).toBeCloseTo(10.01, 2);
      expect(round2(3.333333)).toBe(3.33);
      expect(round2(0)).toBe(0);
    });
  });

  describe('calcularTotales', () => {
    it('carrito vacío → todo en cero', () => {
      const t = calcularTotales([], IGV);
      expect(t.total).toBe(0);
      expect(t.subtotal).toBe(0);
      expect(t.igv).toBe(0);
      expect(t.descuento).toBe(0);
      expect(t.cantidadItems).toBe(0);
    });

    it('desagrega el IGV del precio final (precio YA incluye IGV)', () => {
      // 1 ítem de S/. 118.00 → base 100.00 + IGV 18.00
      const t = calcularTotales([item({ precioUnitario: 118, cantidad: 1 })], IGV);
      expect(t.total).toBe(118);
      expect(t.subtotal).toBeCloseTo(100, 2);
      expect(t.igv).toBeCloseTo(18, 2);
    });

    it('subtotal + igv reconstruyen el total (sin perder centavos)', () => {
      const items = [
        item({ precioUnitario: 3.7, cantidad: 3 }),
        item({ precioUnitario: 0.5, cantidad: 7 }),
      ];
      const t = calcularTotales(items, IGV);
      expect(round2(t.subtotal + t.igv)).toBe(t.total);
    });

    it('aplica el descuento antes de desagregar IGV', () => {
      const t = calcularTotales([item({ precioUnitario: 100, cantidad: 1 })], IGV, 20);
      expect(t.descuento).toBe(20);
      expect(t.total).toBe(80);
      expect(round2(t.subtotal + t.igv)).toBe(80);
    });

    it('descuento mayor al total se limita al total (nunca total negativo)', () => {
      const t = calcularTotales([item({ precioUnitario: 10, cantidad: 1 })], IGV, 999);
      expect(t.descuento).toBe(10);
      expect(t.total).toBe(0);
    });

    it('descuento negativo se ignora (queda en 0)', () => {
      const t = calcularTotales([item({ precioUnitario: 10, cantidad: 2 })], IGV, -5);
      expect(t.descuento).toBe(0);
      expect(t.total).toBe(20);
    });

    it('cuenta unidades totales del carrito', () => {
      const t = calcularTotales(
        [item({ cantidad: 2 }), item({ cantidad: 3 })],
        IGV,
      );
      expect(t.cantidadItems).toBe(5);
    });
  });

  describe('factores y líneas', () => {
    it('factorVenta usa la presentación MAYOR; 1 si no hay presentaciones', () => {
      expect(factorVenta(producto())).toBe(1);
      const p = producto({
        presentaciones: [pres({ factor: 10 }), pres({ id: 'pr2', factor: 100 })],
      });
      expect(factorVenta(p)).toBe(100);
    });

    it('factorLinea usa el factor de la presentación de la línea', () => {
      const it = item({ presentacion: pres({ factor: 10 }) });
      expect(factorLinea(it)).toBe(10);
    });

    it('lineaId distingue caja y blíster del mismo producto', () => {
      const caja = item({ presentacion: pres({ id: 'caja' }) });
      const blister = item({ presentacion: pres({ id: 'blister' }) });
      expect(lineaId(caja)).not.toBe(lineaId(blister));
    });

    it('baseEnCarrito suma unidades base de TODAS las líneas del producto', () => {
      const items = [
        item({ presentacion: pres({ id: 'caja', factor: 10 }), cantidad: 2 }), // 20
        item({ presentacion: pres({ id: 'uni', factor: 1 }), cantidad: 5 }),   // 5
      ];
      expect(baseEnCarrito(items, 'p1')).toBe(25);
    });

    it('precioBaseDesde devuelve el precio más bajo entre presentaciones', () => {
      const p = producto({
        precioVenta: 25,
        presentaciones: [
          pres({ precioVenta: 25 }),
          pres({ id: 'pr2', precioVenta: 0.3 }),
        ],
      });
      expect(precioBaseDesde(p)).toBe(0.3);
    });
  });
});
