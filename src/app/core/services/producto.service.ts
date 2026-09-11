import { Injectable, signal, inject } from '@angular/core';
import { Producto, GrupoPrincipioActivo } from '../models/producto.model';

/** Ítem del catálogo liviano del POS (GET /productos/pos-catalogo). */
interface PosCatalogoItem {
  id: string;
  codigo: string;
  nombre: string;
  principioActivo?: string | null;
  formaFarmaceutica?: string | null;
  categoria: string;
  laboratorio?: string | null;
  ubicacion?: string | null;
  esGenerico?: boolean | null;
  requiereReceta: boolean;
  controlado: boolean;
  unidadBase: string;
  activo: boolean;
  presentaciones: {
    id: string;
    nombre: string;
    factor: number;
    precioVenta: string | number;
    codigoBarras?: string | null;
    esBase: boolean;
  }[];
  stock: { cantidadBase: number; stockMinimo: number };
  /** Unidades base vendibles (lotes vigentes), agregado en servidor. */
  vendible: number;
  /** Vencimiento (YYYY-MM-DD) del lote que se despacharía (FEFO). */
  fefoVencimiento: string | null;
  /** Unidades bloqueadas en lotes vencidos. */
  vencidas: number;
}
import { ApiService } from './api';
import { ToastService } from './toast.service';
import { StockSucursalService } from './stock-sucursal.service';
import { SucursalService } from './sucursal.service';

/**
 * Catálogo de productos — conectado al backend real.
 *
 * `cargar()` trae el catálogo de la sucursal activa desde
 * GET /productos/pos-catalogo y de paso alimenta el stock por sucursal.
 * El catálogo vive aquí (y no dentro del POS) para que inventario, POS y
 * dashboard compartan exactamente la misma fuente.
 */
@Injectable({ providedIn: 'root' })
export class ProductoService {
  private readonly api   = inject(ApiService);
  private readonly toast = inject(ToastService);

  /**
   * Catálogo en memoria. Nace VACÍO siempre: los datos reales llegan por
   * cargar() → GET /productos/pos-catalogo. Prohibido volver a poblar esto
   * a mano — un sistema real no muestra productos de mentira.
   */
  private readonly _productos = signal<Producto[]>([]);

  /* ══════ BLOQUE MUERTO: mock antiguo (comentado = fuera del bundle). ══════
     Borrar físicamente cuando quieras: selecciona desde esta línea hasta
     "FIN BLOQUE MUERTO" y elimina.
    {
      id: '1',
      codigo: '7501001',
      nombre: 'Amoxicilina 500mg - Caja x 10 Cápsulas',
      principioActivo: 'Amoxicilina',
      presentacion: 'Caja x 100 cápsulas',
      categoria: 'Antibióticos',
      laboratorio: 'Genfar',
      precioVenta: 25.0,
      requiereReceta: true,
      controlado: false,
      stockTotal: 45,
      unidadStock: 'cajas',
      unidadBase: 'cápsula',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 100', factor: 100, precioVenta: 25.0, esBase: false },
        { id: 'blister', nombre: 'Blíster x 10', factor: 10, precioVenta: 4.0, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,  precioVenta: 0.5, esBase: true  },
      ],
      imagenUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBPstAAUFVaGSwOo8gozx-wdgF1XfA-EkZI1sSd-sKtvW4A28kmMppKPV6GfEY9XAJ9YpyoaMqKHkcqCXpfe7X0Bz_hJgwNl-D_c4W4pytxNXc4G7hkhRl9Xcq4QjAoSLEN061QuNCKDIJ2B4DC73olsuHLpFx10xssJa9isn_YvA37XKap3HF9Ff6TMYXb4t0VBJZb7C6AOZv_U-zHQcOTUsFG_U5LvTlopo5qq09bEB43w7uuWGD0PCwO5NahMwdByf8fkGa33mTN',
      activo: true,
    },
    {
      id: '2',
      codigo: '7501002',
      nombre: 'Ibuprofeno 400mg Forte - Caja x 20',
      principioActivo: 'Ibuprofeno',
      presentacion: 'Caja x 20 tabletas',
      categoria: 'Analgésicos',
      laboratorio: 'Bayer',
      precioVenta: 8.9,
      requiereReceta: false,
      controlado: false,
      stockTotal: 5,
      unidadStock: 'cajas',
      unidadBase: 'tableta',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 20',   factor: 20, precioVenta: 8.9, esBase: false },
        { id: 'blister', nombre: 'Blíster x 10', factor: 10, precioVenta: 4.8, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,  precioVenta: 0.6, esBase: true  },
      ],
      imagenUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDNGembXfUiVZAo5D2i5fv6Lphm5ow3kFh6yy15j0mmF5Tiw0xDiD2_h7khgecz9l55oUU3DNelnoQOUMXENk1yU4usd4dYeVr9TXoUHpoSJ9rxjtl-HOg21qLfqCJRIc6sws8BeRZ8aeshgecasLmA3TYaYwlG6cEzk3JMY4768MuyRIsmnSNFWl-e8TlWB8XhgJ3GgI7mpJdNYPk85XXh4kaftlzHseEuTQFTS9bzeEty51qsjwesfzj_Hmc5HRKBzSeC0KtSyFBC',
      activo: true,
    },
    {
      id: '3',
      codigo: '7501003',
      nombre: 'Multivitamínico Junior Gomitas Sabores Naturales',
      principioActivo: 'Multivitamínico',
      presentacion: 'Frasco x 60 gomitas',
      categoria: 'Infantil',
      laboratorio: 'Bayer',
      precioVenta: 45.0,
      requiereReceta: false,
      controlado: false,
      stockTotal: 12,
      unidadStock: 'frascos',
      imagenUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB6wcyR-IYNcFAP6ldLfeV-yAvw_w6hZ6kFUDYXcErQw_Et8BhB9Rups2yJrfzD6zjY10HFA58jxgvDBpqyAsH8XLR8dv3YlTT5AcL1fJJVvcNPaQNiyYffP8wgyPr7VgJvQs9U96tH_JbydJv_okG2HOBUdEuKBu5_f0V7jLXN6h96GFOqjIT_ib_o1phDpyv1q29qeX6xvswtEngMADtwv3ZEzxE6bICnzQ2TYN9HJFdn0pQqIe2p9-jIyhrjVa7sD710geUlYaUl',
      activo: true,
    },
    {
      id: '4',
      codigo: '7501004',
      nombre: 'Bloqueador Solar FPS 50+ Eucerin Oil Control',
      categoria: 'Cuidado Personal',
      laboratorio: 'Eucerin',
      precioVenta: 112.0,
      requiereReceta: false,
      controlado: false,
      stockTotal: 22,
      unidadStock: 'unidades',
      imagenUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC0oENpYQFPOW-h1GYW5NS9_493bVcTE3V9sPd_laQTItdQZTmMfOm4pcZkDk8GBrFsYuXUnyCYcR69Nxus2knCvRyA9wwoacWn3CpjiFJv7VLdval4IfzUcYeEqU7JHtcrQ8rMGKcBUr3NhiyAwjBDA7vzHhjQBcgFuOBt_1y6YqdoO98EH4BevEzvji8VQocWI3_7LmuLiLoZBNcFEciwRyEofqIH6vOXAJubTkkGsHcdzFjJRtYG70Bx30R0zSShEPjQdsJmBOvM',
      activo: true,
    },
    {
      id: '5',
      codigo: '7501005',
      nombre: 'Paracetamol 500mg - Caja x 100',
      principioActivo: 'Paracetamol',
      presentacion: 'Caja x 100 tabletas',
      categoria: 'Analgésicos',
      laboratorio: 'Genfar',
      precioVenta: 18.0,
      requiereReceta: false,
      controlado: false,
      stockTotal: 80,
      unidadStock: 'cajas',
      unidadBase: 'tableta',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 100',  factor: 100, precioVenta: 18.0, esBase: false },
        { id: 'blister', nombre: 'Blíster x 10', factor: 10,  precioVenta: 2.5, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,   precioVenta: 0.3, esBase: true  },
      ],
      activo: true,
    },
    {
      id: '6',
      codigo: '7501006',
      nombre: 'Suero Oral Hidratante Sabor Naranja',
      categoria: 'Infantil',
      laboratorio: 'ElectroSol',
      precioVenta: 6.5,
      requiereReceta: false,
      controlado: false,
      stockTotal: 30,
      unidadStock: 'unidades',
      activo: true,
    },
    {
      id: '7',
      codigo: '7501007',
      nombre: 'Cefalexina 500mg - Caja x 12 Cápsulas',
      principioActivo: 'Cefalexina',
      categoria: 'Antibióticos',
      laboratorio: 'Genfar',
      precioVenta: 22.0,
      requiereReceta: true,
      controlado: false,
      stockTotal: 18,
      unidadStock: 'cajas',
      activo: true,
    },
    {
      id: '8',
      codigo: '7501008',
      nombre: 'Crema Hidratante Cetaphil 250ml',
      categoria: 'Cuidado Personal',
      laboratorio: 'Cetaphil',
      precioVenta: 56.0,
      requiereReceta: false,
      controlado: false,
      stockTotal: 14,
      unidadStock: 'unidades',
      activo: true,
    },
    {
      id: '9',
      codigo: '7501009',
      nombre: 'Loratadina 10mg - Caja x 10',
      principioActivo: 'Loratadina',
      categoria: 'Antihistamínicos',
      laboratorio: 'Genfar',
      precioVenta: 9.5,
      requiereReceta: false,
      controlado: false,
      stockTotal: 65,
      unidadStock: 'cajas',
      activo: true,
    },
    {
      id: '10',
      codigo: '7501010',
      nombre: 'Naproxeno 550mg - Caja x 10',
      principioActivo: 'Naproxeno',
      categoria: 'Analgésicos',
      laboratorio: 'Roche',
      precioVenta: 14.0,
      requiereReceta: false,
      controlado: false,
      stockTotal: 0,
      unidadStock: 'cajas',
      unidadBase: 'tableta',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 10',   factor: 10, precioVenta: 14.0, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,  precioVenta: 1.6, esBase: true  },
      ],
      activo: true,
    },
    {
      id: '11',
      codigo: '7501011',
      nombre: 'Apronax 250mg - Caja x 20',
      principioActivo: 'Naproxeno',
      presentacion: 'Caja x 20 tabletas',
      categoria: 'Analgésicos',
      laboratorio: 'Bayer',
      precioVenta: 16.0,
      requiereReceta: false,
      controlado: false,
      stockTotal: 24,
      unidadStock: 'cajas',
      unidadBase: 'tableta',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 20',   factor: 20, precioVenta: 16.0, esBase: false },
        { id: 'blister', nombre: 'Blíster x 10', factor: 10, precioVenta: 8.5, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,  precioVenta: 0.9, esBase: true  },
      ],
      activo: true,
    },
    {
      id: '12',
      codigo: '7501012',
      nombre: 'Naproxeno Genfar 550mg - Caja x 20',
      principioActivo: 'Naproxeno',
      presentacion: 'Caja x 20 tabletas',
      categoria: 'Analgésicos',
      laboratorio: 'Genfar',
      precioVenta: 13.0,
      requiereReceta: false,
      controlado: false,
      stockTotal: 24,
      unidadStock: 'cajas',
      unidadBase: 'tableta',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 20',   factor: 20, precioVenta: 13.0, esBase: false },
        { id: 'blister', nombre: 'Blíster x 10', factor: 10, precioVenta: 7.0, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,  precioVenta: 0.75, esBase: true },
      ],
      activo: true,
    },
    {
      id: '13',
      codigo: '7501013',
      nombre: 'Naproxeno Bayer 500mg - Caja x 10',
      principioActivo: 'Naproxeno',
      presentacion: 'Caja x 10 tabletas',
      categoria: 'Analgésicos',
      laboratorio: 'Bayer',
      precioVenta: 15.0,
      requiereReceta: false,
      controlado: false,
      stockTotal: 21,
      unidadStock: 'cajas',
      unidadBase: 'tableta',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 10',   factor: 10, precioVenta: 15.0, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,  precioVenta: 1.7, esBase: true  },
      ],
      activo: true,
    },

    // ════════ PARES GENÉRICO / MARCA (búsqueda por principio activo) ════════
    // ── Paracetamol: genérico (#14) vs marca Panadol Antigripal (#15) ──────
    {
      id: '14',
      codigo: '7501014',
      nombre: 'Paracetamol 500mg',
      principioActivo: 'Paracetamol',
      presentacion: 'Caja x 100 tabletas',
      categoria: 'Analgésicos',
      laboratorio: 'IQ Farma',
      ubicacion: 'Estante A-02',
      esGenerico: true,
      precioVenta: 12.0,
      requiereReceta: false,
      controlado: false,
      stockTotal: 60,
      unidadStock: 'cajas',
      unidadBase: 'tableta',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 100',  factor: 100, precioVenta: 12.0, esBase: false },
        { id: 'blister', nombre: 'Blíster x 10', factor: 10,  precioVenta: 1.8, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,   precioVenta: 0.2, esBase: true  },
      ],
      activo: true,
    },
    {
      id: '15',
      codigo: '7501015',
      nombre: 'Panadol Antigripal',
      principioActivo: 'Paracetamol',
      presentacion: 'Caja x 24 tabletas',
      categoria: 'Analgésicos',
      laboratorio: 'GSK',
      ubicacion: 'Estante A-03',
      esGenerico: false,
      precioVenta: 28.0,
      requiereReceta: false,
      controlado: false,
      stockTotal: 40,
      unidadStock: 'cajas',
      unidadBase: 'tableta',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 24',   factor: 24, precioVenta: 28.0, esBase: false },
        { id: 'blister', nombre: 'Blíster x 4',  factor: 4,  precioVenta: 5.5, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,  precioVenta: 1.5, esBase: true  },
      ],
      activo: true,
    },

    // ── Amoxicilina: genérico (#16) vs marca Amoxil (#17) — REQUIERE RECETA ─
    {
      id: '16',
      codigo: '7501016',
      nombre: 'Amoxicilina 500mg',
      principioActivo: 'Amoxicilina',
      presentacion: 'Caja x 100 cápsulas',
      categoria: 'Antibióticos',
      laboratorio: 'Genfar',
      ubicacion: 'Estante B-01',
      esGenerico: true,
      precioVenta: 24.0,
      requiereReceta: true,
      controlado: false,
      stockTotal: 35,
      unidadStock: 'cajas',
      unidadBase: 'cápsula',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 100',  factor: 100, precioVenta: 24.0, esBase: false },
        { id: 'blister', nombre: 'Blíster x 10', factor: 10,  precioVenta: 3.5, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,   precioVenta: 0.4, esBase: true  },
      ],
      activo: true,
    },
    {
      id: '17',
      codigo: '7501017',
      nombre: 'Amoxil 500mg',
      principioActivo: 'Amoxicilina',
      presentacion: 'Caja x 12 cápsulas',
      categoria: 'Antibióticos',
      laboratorio: 'GSK',
      ubicacion: 'Estante B-02',
      esGenerico: false,
      precioVenta: 18.0,
      requiereReceta: true,
      controlado: false,
      stockTotal: 20,
      unidadStock: 'cajas',
      unidadBase: 'cápsula',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 12',   factor: 12, precioVenta: 18.0, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,  precioVenta: 1.6, esBase: true  },
      ],
      activo: true,
    },

    // ── Ibuprofeno: genérico (#18) vs marca Doloral (#19) ──────────────────
    {
      id: '18',
      codigo: '7501018',
      nombre: 'Ibuprofeno 400mg',
      principioActivo: 'Ibuprofeno',
      presentacion: 'Caja x 100 tabletas',
      categoria: 'Analgésicos',
      laboratorio: 'Medifarma',
      ubicacion: 'Estante C-01',
      esGenerico: true,
      precioVenta: 16.0,
      requiereReceta: false,
      controlado: false,
      stockTotal: 50,
      unidadStock: 'cajas',
      unidadBase: 'tableta',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 100',  factor: 100, precioVenta: 16.0, esBase: false },
        { id: 'blister', nombre: 'Blíster x 10', factor: 10,  precioVenta: 2.0, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,   precioVenta: 0.25, esBase: true },
      ],
      activo: true,
    },
    {
      id: '19',
      codigo: '7501019',
      nombre: 'Doloral 400mg',
      principioActivo: 'Ibuprofeno',
      presentacion: 'Caja x 20 tabletas',
      categoria: 'Analgésicos',
      laboratorio: 'Hersil',
      ubicacion: 'Estante C-02',
      esGenerico: false,
      precioVenta: 12.5,
      requiereReceta: false,
      controlado: false,
      stockTotal: 30,
      unidadStock: 'cajas',
      unidadBase: 'tableta',
      presentaciones: [
        { id: 'caja',    nombre: 'Caja x 20',   factor: 20, precioVenta: 12.5, esBase: false },
        { id: 'blister', nombre: 'Blíster x 10', factor: 10, precioVenta: 7.0, esBase: false },
        { id: 'unidad',  nombre: 'Unidad',       factor: 1,  precioVenta: 0.8, esBase: true  },
      ],
      activo: true,
    },

    // ════════ AMPOLLA INYECTABLE (id = '20') — solo Caja y Unidad ══════════
    // Las ampollas líquidas no se fraccionan en blíster: unidad base = ampolla.
    {
      id: '20',
      codigo: '7501020',
      nombre: 'Dexametasona 4mg/1mL - Ampolla',
      principioActivo: 'Dexametasona',
      presentacion: 'Caja x 5 ampollas',
      categoria: 'Inyectables',
      laboratorio: 'Medifarma',
      ubicacion: 'Estante E-01',
      esGenerico: true,
      precioVenta: 12.5,
      requiereReceta: true,
      controlado: false,
      stockTotal: 10,
      unidadStock: 'cajas',
      unidadBase: 'ampolla',
      presentaciones: [
        { id: 'caja',   nombre: 'Caja x 5 Ampollas', factor: 5, precioVenta: 12.5, esBase: false, unidadesDescripcion: '5 ampollas' },
        { id: 'unidad', nombre: 'Unidad',            factor: 1, precioVenta: 3.0,  esBase: true,  unidadesDescripcion: '1 ampolla' },
      ],
      activo: true,
    },
  ] ══════ FIN BLOQUE MUERTO ══════ */

  /** Catálogo completo en modo solo lectura para el resto de la app. */
  readonly productos = this._productos.asReadonly();

  /** True mientras se trae el catálogo del backend (para skeletons de carga). */
  private readonly _cargando = signal(false);
  readonly cargando = this._cargando.asReadonly();

  // ════════════════════════════════════════════════════════════════════════
  private readonly stockSvc  = inject(StockSucursalService);
  // Fuente única de la sucursal activa: respeta el switch del SUPER_ADMIN.
  // (SucursalService solo depende de Auth+Api → sin ciclo de DI.)
  private readonly sucursalSvc = inject(SucursalService);

  /**
   * Carga el catálogo REAL del backend + el stock/lotes de la sucursal activa.
   * Mapea cada producto del backend al modelo del front (precio base + stock de
   * la sucursal) y alimenta StockSucursalService para que el POS use stock real.
   */
  cargar(): void {
    const sucursalId = this.sucursalSvc.sucursalActivaId();
    if (!sucursalId) return;
    this._cargando.set(true);
    this.api.get<PosCatalogoItem[]>('/productos/pos-catalogo', { sucursalId }).subscribe({
      next: (items) => {
        this._productos.set(items.map((p) => this.mapProductoPos(p)));
        // Alimenta el stock por sucursal con LOTES SINTÉTICOS: un lote FEFO
        // (vendible + su vencimiento) y uno vencido (bloqueado). El POS
        // conserva su lógica (stockVendibleEn/loteDespacho/lotesVencidosEn)
        // sin recibir miles de filas de lotes reales.
        this.stockSvc.cargar(
          items.map((p) => ({
            productoId: p.id,
            sucursalId,
            cantidadBase: p.stock.cantidadBase,
            stockMinimo: p.stock.stockMinimo ?? 0,
          })),
          this.lotesSinteticos(items, sucursalId),
        );
        this._cargando.set(false);
      },
      error: (err) => {
        // Nunca mostrar datos falsos: si la carga real falla, el catálogo
        // queda VACÍO. Mejor una pantalla sin productos que precios inventados.
        this._productos.set([]);
        this.stockSvc.cargar([], []);
        this._cargando.set(false);
        this.toast.error('No se pudo cargar el catálogo: ' + err.message);
      },
    });
  }

  /**
   * Refresh PARCIAL post-venta: actualiza SOLO los productos vendidos
   * (stock + lotes sintéticos) sin re-descargar el catálogo completo.
   * Si falla, cae a la recarga completa como red de seguridad.
   */
  refrescarStock(productoIds: string[]): void {
    const sucursalId = this.sucursalSvc.sucursalActivaId();
    if (!sucursalId || productoIds.length === 0) return;
    this.api
      .get<PosCatalogoItem[]>('/productos/pos-catalogo', {
        sucursalId,
        productoIds: productoIds.join(','),
      })
      .subscribe({
        next: (items) => {
          const porId = new Map(items.map((i) => [i.id, i]));
          this._productos.update((lista) =>
            lista.map((p) => {
              const n = porId.get(p.id);
              return n ? { ...p, stockTotal: n.stock.cantidadBase } : p;
            }),
          );
          this.stockSvc.actualizarParcial(
            sucursalId,
            items.map((p) => ({
              productoId: p.id,
              sucursalId,
              cantidadBase: p.stock.cantidadBase,
              stockMinimo: p.stock.stockMinimo ?? 0,
            })),
            this.lotesSinteticos(items, sucursalId),
          );
        },
        error: () => this.cargar(),
      });
  }

  /** Mapea un ítem del pos-catálogo al modelo Producto del front. */
  private mapProductoPos(p: PosCatalogoItem): Producto {
    const base = p.presentaciones.find((x) => x.esBase) ?? p.presentaciones[0];
    return {
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      principioActivo: p.principioActivo ?? undefined,
      formaFarmaceutica: p.formaFarmaceutica ?? null,
      categoria: p.categoria,
      laboratorio: p.laboratorio ?? undefined,
      requiereReceta: p.requiereReceta,
      controlado: p.controlado,
      esGenerico: p.esGenerico ?? undefined,
      ubicacion: p.ubicacion ?? undefined,
      unidadBase: p.unidadBase,
      presentaciones: [...p.presentaciones]
        .map((pr) => ({
          id: pr.id,
          nombre: pr.nombre,
          factor: pr.factor,
          precioVenta: Number(pr.precioVenta),
          codigoBarras: pr.codigoBarras ?? undefined,
          esBase: pr.esBase,
        }))
        .sort((a, b) => b.factor - a.factor),
      precioVenta: base ? Number(base.precioVenta) : 0,
      stockTotal: p.stock.cantidadBase,
      unidadStock: 'unidades',
      activo: p.activo,
    };
  }

  /** Lote FEFO (vendible) + lote vencido (bloqueado) por producto. */
  private lotesSinteticos(items: PosCatalogoItem[], sucursalId: string) {
    const lotes: {
      productoId: string; sucursalId: string; lote: string;
      vencimiento: string; cantidadBase: number;
    }[] = [];
    for (const p of items) {
      if (p.vendible > 0 && p.fefoVencimiento) {
        lotes.push({
          productoId: p.id, sucursalId, lote: 'FEFO',
          vencimiento: p.fefoVencimiento, cantidadBase: p.vendible,
        });
      }
      if (p.vencidas > 0) {
        lotes.push({
          productoId: p.id, sucursalId, lote: 'VENCIDO',
          vencimiento: '2000-01-01', cantidadBase: p.vencidas,
        });
      }
    }
    return lotes;
  }

  /** Lista de categorías presentes en el catálogo (derivada del catálogo). */
  categoriasDisponibles(): string[] {
    const set = new Set<string>();
    for (const p of this._productos()) {
      set.add(p.categoria);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  /**
   * Filtra productos por categoría y término de búsqueda.
   * Hoy es local; cuando haya API se reemplaza por un GET con query params.
   */
  buscar(opciones: { query?: string; categoria?: string }): Producto[] {
    const cat = opciones.categoria ?? 'Todos';
    const q = (opciones.query ?? '').toLowerCase().trim();
    return this._productos().filter((p) => {
      if (!p.activo) {
        return false;
      }
      if (cat !== 'Todos' && p.categoria !== cat) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        p.nombre.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        (p.principioActivo?.toLowerCase().includes(q) ?? false)
      );
    });
  }

  /**
   * Búsqueda agrupada por principio activo (mejora 2).
   * Aplica el mismo filtro que buscar(), pero colapsa los resultados en
   * grupos: todas las alternativas con el mismo principioActivo van juntas.
   *
   * Dentro de cada grupo los productos se ordenan por stockTotal desc
   * (los que SÍ hay primero) y luego por precio asc. Los productos sin
   * principioActivo forman grupos de un solo elemento (clave = su nombre).
   *
   * Los grupos se ordenan: primero los que tienen alternativas reales,
   * luego alfabéticamente por principio activo.
   */
  buscarAgrupado(opciones: { query?: string; categoria?: string }): GrupoPrincipioActivo[] {
    const resultados = this.buscar(opciones);
    const mapa = new Map<string, Producto[]>();

    // Clave NORMALIZADA (trim + minúsculas): "Paracetamol" y "paracetamol"
    // deben caer en el MISMO grupo aunque el catálogo tenga inconsistencias.
    for (const p of resultados) {
      const pa = p.principioActivo?.trim();
      const clave = pa ? pa.toLowerCase() : `__${p.id}`;
      const lista = mapa.get(clave);
      if (lista) {
        lista.push(p);
      } else {
        mapa.set(clave, [p]);
      }
    }

    const grupos: GrupoPrincipioActivo[] = [];
    for (const [clave, productos] of mapa) {
      productos.sort(
        (a, b) => b.stockTotal - a.stockTotal || a.precioVenta - b.precioVenta
      );
      // Etiqueta visible: la forma mejor escrita del grupo (prefiere la que
      // empieza en mayúscula); si no hay principio activo, el nombre del producto.
      const etiqueta = clave.startsWith('__')
        ? productos[0].nombre
        : (productos.map((p) => p.principioActivo?.trim()).find((s) => s && /^[A-ZÁÉÍÓÚÑ]/.test(s))
            ?? productos[0].principioActivo?.trim()
            ?? clave);
      grupos.push({
        principioActivo: etiqueta,
        productos,
        precioDesde: Math.min(...productos.map((p) => p.precioVenta)),
        hayAlternativas: productos.length > 1,
      });
    }

    return grupos.sort(
      (a, b) =>
        Number(b.hayAlternativas) - Number(a.hayAlternativas) ||
        a.principioActivo.localeCompare(b.principioActivo)
    );
  }

  porId(id: string): Producto | undefined {
    return this._productos().find((p) => p.id === id);
  }

  /** Búsqueda exacta por código de barras (para pistola scanner). */
  porCodigo(codigo: string): Producto | undefined {
    return this._productos().find(
      (p) => p.activo && p.codigo.toLowerCase() === codigo.toLowerCase()
    );
  }
}
