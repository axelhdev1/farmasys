/**
 * Modelos del módulo Compras / Medicamentos.
 * Reflejan EXACTAMENTE las formas que devuelve/espera el backend NestJS,
 * para que el front no tenga que adivinar. El dinero llega como string
 * (Decimal) y se convierte a number solo para mostrar.
 */

// ─────────────────────────── Proveedores ───────────────────────────

export interface ProveedorBackend {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  activo: boolean;
}

export interface CrearProveedor {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
}

// ─────────────────────────── Productos (catálogo) ───────────────────────────

export interface PresentacionBackend {
  id: string;
  nombre: string;
  factor: number;
  precioVenta: string; // Decimal como string, p.ej. "0.50"
  codigoBarras?: string | null;
  esBase: boolean;
}

export interface ProductoBackend {
  id: string;
  codigo: string;
  nombre: string;
  principioActivo?: string | null;
  concentracion?: string | null;
  formaFarmaceutica?: string | null;
  categoria: string;
  laboratorio?: string | null;
  ubicacion?: string | null;
  esGenerico?: boolean | null;
  requiereReceta: boolean;
  controlado: boolean;
  afectacionIgv: 'GRAVADO' | 'EXONERADO' | 'INAFECTO';
  unidadBase: string;
  activo: boolean;
  presentaciones: PresentacionBackend[];
}

export interface PaginaProductos {
  items: ProductoBackend[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Presentación al crear un medicamento (precio como number). */
export interface CrearPresentacion {
  nombre: string;
  factor: number;
  precioVenta: number;
  esBase?: boolean;
  codigoBarras?: string;
}

export interface CrearProducto {
  codigo: string;
  nombre: string;
  categoria: string;
  principioActivo?: string;
  concentracion?: string;
  /** Tableta, jarabe, ampolla… (ver core/models/formas.ts). */
  formaFarmaceutica?: string;
  laboratorio?: string;
  ubicacion?: string;
  registroSanitario?: string;
  requiereReceta?: boolean;
  controlado?: boolean;
  esGenerico?: boolean;
  afectacionIgv?: 'GRAVADO' | 'EXONERADO' | 'INAFECTO';
  unidadBase?: string;
  /** Mínimo para alertas. Si se omite, se usa el default de Configuración. */
  stockMinimo?: number;
  presentaciones: CrearPresentacion[];
}

// ─────────────────────────── Compras (ingreso de stock) ───────────────────────────

/** Compra registrada, como la devuelve GET /compras. */
export interface CompraBackend {
  id: string;
  numeroDocumento: string;
  tipoDocumento: string;
  sucursalId: string;
  proveedorId: string;
  proveedor?: { razonSocial: string; ruc: string } | null;
  subtotal: string;
  igv: string;
  total: string;
  fecha: string;
  estado: string;              // REGISTRADA | ANULADA
  motivoAnulacion?: string | null;
  anuladaEn?: string | null;
}

/** Detalle de una compra (GET /compras/:id) con sus líneas. */
export interface CompraDetalle extends CompraBackend {
  items: Array<{
    id: string;
    productoId: string;
    lote: string;
    vencimiento: string;
    cantidadBase: number;
    precioCompra: string;
    subtotal: string;
  }>;
}

export interface CompraItemInput {
  productoId: string;
  lote: string;
  vencimiento: string; // ISO yyyy-mm-dd
  cantidadBase: number;
  precioCompra: number;
}

export interface CrearCompra {
  proveedorId: string;
  sucursalId: string;
  numeroDocumento: string;
  tipoDocumento?: string;
  items: CompraItemInput[];
}

export interface SucursalBackend {
  id: string;
  nombre: string;
}
