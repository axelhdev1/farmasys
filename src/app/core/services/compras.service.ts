import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';
import {
  CompraBackend,
  CompraDetalle,
  CrearCompra,
  CrearProducto,
  CrearProveedor,
  PaginaProductos,
  ProductoBackend,
  ProveedorBackend,
  SucursalBackend,
} from '../models/compra.model';

/**
 * ComprasService — gestión de medicamentos (catálogo) y compras a proveedores.
 * Habla DIRECTO con el backend NestJS (no usa mocks). Es el módulo de
 * administración que permite dar de alta medicamentos e ingresar stock.
 */
@Injectable({ providedIn: 'root' })
export class ComprasService {
  private readonly api = inject(ApiService);

  // ── Proveedores ──────────────────────────────────────────────────────────
  listarProveedores(): Observable<ProveedorBackend[]> {
    return this.api.get<ProveedorBackend[]>('/compras/proveedores');
  }

  crearProveedor(dto: CrearProveedor): Observable<ProveedorBackend> {
    return this.api.post<ProveedorBackend>('/compras/proveedores', dto);
  }

  /** Corrige datos de un proveedor (RUC mal tecleado, teléfono nuevo). */
  actualizarProveedor(id: string, dto: Partial<CrearProveedor>): Observable<ProveedorBackend> {
    return this.api.patch<ProveedorBackend>(`/compras/proveedores/${id}`, dto);
  }

  // NOTA: dar de BAJA un proveedor existe en el servicio del backend
  // (`desactivarProveedor`) pero NO tiene ruta en el controller, así que no hay
  // endpoint que llamar. Si hace falta, primero se expone allá.

  // ── Medicamentos (catálogo) ──────────────────────────────────────────────
  listarProductos(): Observable<PaginaProductos> {
    return this.api.get<PaginaProductos>('/productos', { limit: 100 });
  }

  buscarProductos(q: string): Observable<ProductoBackend[]> {
    return this.api.get<ProductoBackend[]>('/productos/buscar', { q });
  }

  crearProducto(dto: CrearProducto): Observable<ProductoBackend> {
    return this.api.post<ProductoBackend>('/productos', dto);
  }

  // ── Compras (ingreso de mercadería) ──────────────────────────────────────
  registrarCompra(dto: CrearCompra): Observable<unknown> {
    return this.api.post<unknown>('/compras', dto);
  }

  /** Historial de compras (últimas 100). Sin esto no había forma de revisarlas. */
  listarCompras(sucursalId?: string): Observable<CompraBackend[]> {
    return this.api.get<CompraBackend[]>('/compras', sucursalId ? { sucursalId } : undefined);
  }

  /** Detalle con las líneas, para cotejar contra la factura física. */
  obtenerCompra(id: string): Observable<CompraDetalle> {
    return this.api.get<CompraDetalle>(`/compras/${id}`);
  }

  /**
   * Anula una compra mal registrada: revierte stock, lote y costo promedio.
   * El backend solo lo permite si nada de esa mercadería se vendió aún.
   */
  anularCompra(id: string, motivo: string): Observable<unknown> {
    return this.api.patch<unknown>(`/compras/${id}/anular`, { motivo });
  }

  // ── Apoyo ────────────────────────────────────────────────────────────────
  listarSucursales(): Observable<SucursalBackend[]> {
    return this.api.get<SucursalBackend[]>('/sucursales');
  }
}
