/**
 * Producto del catálogo de la botica.
 *
 * Un Producto es un SKU vendible (ej. "Amoxicilina 500mg Genfar").
 * Cada Producto puede venderse en distintas **presentaciones**:
 *   - Caja (10 blísters de 10 = 100 pastillas)
 *   - Blíster (10 pastillas)
 *   - Unidad (1 pastilla)
 *
 * El stock se gestiona SIEMPRE en la unidad base (la más pequeña).
 * Las presentaciones son "vistas" del mismo stock con precios distintos.
 *
 * El stock NO vive en este modelo: vive en StockSucursal porque cada
 * sucursal tiene su propio inventario.
 */
export interface Producto {
  id: string;
  codigo: string;                  // código interno o de barras principal
  nombre: string;                  // nombre comercial
  principioActivo?: string;        // principio activo (clave para búsqueda alternativa)
  /** Tableta, jarabe, ampolla… Distingue productos del mismo principio activo. */
  formaFarmaceutica?: string | null;
  categoria: string;               // ej. "Antibióticos", "Analgésicos"
  laboratorio?: string;
  requiereReceta: boolean;
  controlado: boolean;             // psicotrópico u otro registro especial

  // ── Presentaciones (venta fraccionada) ────────────────────────────────
  /**
   * Lista de presentaciones vendibles. Si está vacío o undefined,
   * el sistema usa el modo "legacy" (precioVenta + stockTotal).
   * Ordenadas de mayor a menor factor (caja → blíster → unidad).
   */
  presentaciones?: Presentacion[];

  /** Nombre de la unidad atómica para descontar stock (ej. "pastilla", "ml") */
  unidadBase?: string;

  /** Ubicación física en la botica (ej. "Estante C-12") para que el cajero lo encuentre */
  ubicacion?: string;
  /** true = genérico (DCI); false/undefined = producto de marca comercial */
  esGenerico?: boolean;

  // ── Campos legacy (siguen usándose hasta migrar todas las pantallas) ──
  presentacion?: string;           // string descriptivo legacy
  precioVenta: number;             // precio de la presentación más vendida
  stockTotal: number;              // suma de stock entre todas las sucursales
  unidadStock: string;             // ej. "cajas", "unidades", "frascos"

  imagenUrl?: string;
  activo: boolean;
}

/**
 * Una presentación vendible de un producto.
 *
 * Ejemplo de Amoxicilina 500mg:
 *   - { id: 'caja',   nombre: 'Caja x 100',  factor: 100, precioVenta: 25.00 }
 *   - { id: 'blister',nombre: 'Blíster x 10', factor: 10,  precioVenta: 4.00  }
 *   - { id: 'unidad', nombre: 'Unidad',       factor: 1,   precioVenta: 0.50, esBase: true }
 *
 * `factor` indica cuántas unidades base contiene esta presentación.
 * `esBase: true` solo en la presentación atómica (factor = 1 normalmente).
 */
export interface Presentacion {
  id: string;
  nombre: string;
  /** Cuántas unidades base contiene esta presentación */
  factor: number;
  precioVenta: number;
  /** Código de barras específico de esta presentación (opcional) */
  codigoBarras?: string;
  /** True si esta es la unidad atómica (la más chica) */
  esBase: boolean;
  /** Descripción legible de cuántas unidades contiene (ej. "5 ampollas") */
  unidadesDescripcion?: string;
}

/**
 * Resultado del cálculo de desglose para una venta fraccionada.
 *
 * Si el cliente pide 23 pastillas de Amoxicilina y existe blíster x 10:
 *   {
 *     items: [
 *       { presentacion: blister, cantidad: 2, subtotal: 8.00 },
 *       { presentacion: unidad,  cantidad: 3, subtotal: 1.50 }
 *     ],
 *     totalUnidadesBase: 23,
 *     totalPrecio: 9.50
 *   }
 */
export interface DesgloseVenta {
  items: ItemDesglose[];
  totalUnidadesBase: number;
  totalPrecio: number;
}

export interface ItemDesglose {
  presentacion: Presentacion;
  cantidad: number;        // cuántas unidades DE ESTA presentación
  subtotal: number;
}

/**
 * Grupo de productos que comparten el mismo principio activo.
 * Alimenta la "Búsqueda por Principio Activo" (mejora 2): cuando un producto
 * está agotado, el cajero ve las alternativas equivalentes agrupadas.
 */
export interface GrupoPrincipioActivo {
  principioActivo: string;     // ej. "Naproxeno"
  productos: Producto[];       // alternativas ordenadas (con stock primero)
  precioDesde: number;         // menor precioVenta del grupo
  hayAlternativas: boolean;    // true si el grupo tiene más de 1 producto
}
