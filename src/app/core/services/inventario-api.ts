import { Injectable, inject } from '@angular/core';
import { forkJoin, map, Observable } from 'rxjs';
import { ApiService } from './api';
import { PaginaProductos, ProductoBackend } from '../models/compra.model';

/** Fila de stock de StockSucursal (backend). */
export interface StockRow {
  productoId: string;
  sucursalId: string;
  cantidadBase: number;
  stockMinimo: number;
  costoPromedio: string | null;
}

/** Lote del backend. */
export interface LoteRow {
  id: string;
  productoId: string;
  sucursalId: string;
  lote: string;
  vencimiento: string; // ISO
  cantidadBase: number;
}

export interface InventarioCrudo {
  productos: ProductoBackend[];
  stock: StockRow[];
  lotes: LoteRow[];
}

/**
 * InventarioApiService — trae en paralelo catálogo + stock + lotes de una
 * sucursal y permite ajustar stock. Es la fuente REAL del inventario, en
 * sincronía con lo que Compras ingresa.
 */
@Injectable({ providedIn: 'root' })
export class InventarioApiService {
  private readonly api = inject(ApiService);

  /** Carga catálogo + stock + lotes de la sucursal en una sola operación. */
  cargarInventario(sucursalId: string): Observable<InventarioCrudo> {
    return forkJoin({
      productos: this.api
        .get<PaginaProductos>('/productos', { limit: 200 })
        .pipe(map((p) => p.items)),
      stock: this.api.get<StockRow[]>(`/inventario/sucursal/${sucursalId}/stock`),
      lotes: this.api.get<LoteRow[]>(`/inventario/sucursal/${sucursalId}/lotes`),
    });
  }

  /** Ajuste de stock (cantidadBase con signo). Se guarda en el backend. */
  ajustar(dto: {
    productoId: string;
    sucursalId: string;
    cantidadBase: number;
    motivo: string;
    loteNumero?: string;
    vencimiento?: string;
  }): Observable<unknown> {
    return this.api.post<unknown>('/inventario/ajuste', dto);
  }

  /** Kardex (movimientos) reales de un producto en una sucursal. */
  movimientos(sucursalId: string, productoId: string): Observable<MovimientoRow[]> {
    return this.api.get<MovimientoRow[]>(`/inventario/movimientos/${sucursalId}/${productoId}`);
  }

  /** Disponibilidad del producto en cada botica (para derivar al cliente). */
  disponibilidad(productoId: string): Observable<DisponibilidadRow[]> {
    return this.api.get<DisponibilidadRow[]>(`/inventario/disponibilidad/${productoId}`);
  }

  /** Actualiza el stock mínimo (punto de reposición). */
  setStockMinimo(sucursalId: string, productoId: string, stockMinimo: number): Observable<unknown> {
    return this.api.patch<unknown>(
      `/inventario/sucursal/${sucursalId}/producto/${productoId}/stock-minimo`,
      { stockMinimo },
    );
  }

  /** Edita los datos maestros del medicamento (catálogo). */
  editarProducto(id: string, dto: Record<string, unknown>): Observable<unknown> {
    return this.api.patch<unknown>(`/productos/${id}`, dto);
  }

  /**
   * Actualiza una presentación (donde vive el PRECIO DE VENTA).
   *
   * `PATCH /productos/:id` no toca presentaciones a propósito (para no romper
   * las referencias de ventas históricas), así que el precio se corrige por
   * aquí. Sin esto, un producto cargado a S/ 0 quedaba atrapado: no se podía
   * vender (el sistema lo bloquea) ni arreglar desde la pantalla.
   */
  /** Añade una presentación (caja, blíster…) a un producto que ya existe. */
  crearPresentacion(
    productoId: string,
    dto: { nombre: string; factor: number; precioVenta: number; esBase?: boolean },
  ): Observable<unknown> {
    return this.api.post<unknown>(`/productos/${productoId}/presentaciones`, dto);
  }

  /**
   * Define cuál presentación es la unidad base. El backend lo rechaza si el
   * producto ya tiene stock o ventas: cambiar la base reinterpretaría todas
   * las cantidades guardadas.
   */
  hacerBase(productoId: string, presentacionId: string): Observable<unknown> {
    return this.api.patch<unknown>(
      `/productos/${productoId}/presentaciones/${presentacionId}/base`,
      {},
    );
  }

  /** Borra una presentación. El backend la rechaza si tiene ventas. */
  eliminarPresentacion(productoId: string, presentacionId: string): Observable<unknown> {
    return this.api.delete<unknown>(
      `/productos/${productoId}/presentaciones/${presentacionId}`,
    );
  }

  actualizarPresentacion(
    productoId: string,
    presentacionId: string,
    dto: { nombre: string; factor: number; precioVenta: number; esBase?: boolean },
  ): Observable<unknown> {
    return this.api.patch<unknown>(
      `/productos/${productoId}/presentaciones/${presentacionId}`,
      dto,
    );
  }

  /** Desactiva (baja lógica): lo oculta del catálogo, conserva el historial. */
  desactivarProducto(id: string): Observable<unknown> {
    return this.api.delete<unknown>(`/productos/${id}`);
  }

  /** Elimina definitivamente (solo si el producto nunca se usó). */
  eliminarProducto(id: string): Observable<unknown> {
    return this.api.delete<unknown>(`/productos/${id}/permanente`);
  }
}

/** Movimiento del kardex (backend). */
export interface MovimientoRow {
  id: string;
  tipo: string;
  cantidadBase: number;
  motivo: string | null;
  fecha: string;
  stockResultante: number;
  /** Quién lo hizo. Vacío en movimientos viejos y en las ventas (ver el kardex). */
  usuario?: string;
}

/** Stock de un producto en una botica concreta. Sin datos financieros. */
export interface DisponibilidadRow {
  sucursalId: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  /** Incluye lo vencido. */
  total: number;
  /** Lo que realmente se puede vender (sin lotes vencidos). */
  vendible: number;
}
