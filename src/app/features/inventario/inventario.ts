import { Component, signal, computed, effect, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { SucursalService } from '../../core/services/sucursal.service';
import { ConfiguracionService } from '../../core/services/configuracion.service';
import { etiquetaForma } from '../../core/models/formas';
import {
  DisponibilidadRow,
  InventarioApiService,
  LoteRow,
} from '../../core/services/inventario-api';

// ── Tipos locales ──────────────────────────────────────────────────────────────
type AlertaVencimiento = 'VENCIDO' | 'POR_VENCER' | 'OK';
type FiltroAlerta = 'todos' | AlertaVencimiento;
type FiltroStock  = 'todos' | 'bajo' | 'normal';

interface LoteUI {
  numero: string;
  fechaVencimiento: string;   // ISO "YYYY-MM-DD"
  cantidad: number;
}

interface ProductoInventario {
  id: string;
  codigo: string;
  nombre: string;
  principioActivo: string;
  /** Tableta, jarabe, ampolla… ('' si el producto aún no la tiene). */
  formaFarmaceutica: string;
  presentacion: string;
  categoria: string;
  laboratorio: string;
  ubicacion: string;
  lote: LoteUI;
  /** Todos los lotes con stock del producto (FEFO asc), para el detalle. */
  lotes: LoteUI[];
  stockActual: number;
  stockMinimo: number;
  precioCompra: number;
  precioVenta: number;
  /**
   * Presentación BASE (la unidad mínima). El precio de venta vive en la
   * presentación, no en el producto: para corregirlo hay que actualizarla.
   */
  presentacionBase?: { id: string; nombre: string; factor: number };
  /** Todas las presentaciones (caja, blíster, unidad) para poder gestionarlas. */
  presentaciones?: Array<{ id: string; nombre: string; factor: number; precioVenta: number; esBase: boolean }>;
  requiereReceta: boolean;
  controlado: boolean;
}

interface FormAjusteStock {
  tipo: 'INGRESO' | 'SALIDA' | 'AJUSTE';
  cantidad: number | null;
  motivo: string;
  loteNumero: string;
  loteFechaVencimiento: string;
}

interface FormEditarProducto {
  nombre: string;
  principioActivo: string;
  presentacion: string;
  categoria: string;
  laboratorio: string;
  ubicacion: string;
  stockMinimo: number | null;
  precioCompra: number | null;
  precioVenta: number | null;
  requiereReceta: boolean;
  controlado: boolean;
}

interface Movimiento {
  fecha: string;
  tipo: 'INGRESO' | 'SALIDA' | 'AJUSTE';
  cantidad: number;
  stockResultante: number;
  motivo: string;
  usuario: string;
}

@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './inventario.html',
  styleUrl: './inventario.scss',
})
export class InventarioComponent implements OnInit {
  protected readonly Math = Math;

  private readonly invApi = inject(InventarioApiService);
  private readonly auth   = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast  = inject(ToastService);
  private readonly sucursalSvc = inject(SucursalService);
  private readonly configSvc   = inject(ConfiguracionService);

  /**
   * Sucursal sobre la que trabaja la pantalla.
   *
   * DEBE ser la ACTIVA (la del selector del header), no la del token. Antes se
   * usaba `auth.usuario()?.sucursalActualId`: el dueño cambiaba a "Norte" en el
   * header, entraba a Inventario y veía —y AJUSTABA— el stock de Central sin
   * enterarse. Para un usuario normal ambas coinciden; el daño era para quien
   * administra varias boticas.
   */
  private sucursalId(): string | undefined {
    return this.sucursalSvc.sucursalActivaId() ?? this.auth.usuario()?.sucursalActualId;
  }

  /** Solo administradores pueden desactivar medicamentos. */
  protected readonly esAdmin = computed(() =>
    this.auth.tieneAlgunRol('SUPER_ADMIN', 'ADMIN'),
  );

  constructor() {
    // Recarga sola al cambiar de botica en el header. Sin esto, el dueño
    // cambiaba de sucursal y seguía viendo el inventario de la anterior.
    effect(() => {
      const sid = this.sucursalSvc.sucursalActivaId();
      if (sid) this.cargar();
    });
  }

  ngOnInit(): void {
    this.cargar();
  }

  /** Carga el inventario REAL (catálogo + stock + lotes) de la sucursal activa. */
  cargar(): void {
    const sucursalId = this.sucursalId();
    if (!sucursalId) return;
    this.cargando.set(true);
    this.invApi.cargarInventario(sucursalId).subscribe({
      next: ({ productos, stock, lotes }) => {
        const stockMap = new Map(stock.map((s) => [s.productoId, s]));
        const lotesMap = new Map<string, LoteRow[]>();
        for (const l of lotes) {
          const arr = lotesMap.get(l.productoId) ?? [];
          arr.push(l);
          lotesMap.set(l.productoId, arr);
        }
        const filas: ProductoInventario[] = productos.map((p) => {
          const s = stockMap.get(p.id);
          const ls = (lotesMap.get(p.id) ?? []).sort((a, b) =>
            a.vencimiento.localeCompare(b.vencimiento),
          );
          const fefo = ls[0];
          const base = p.presentaciones.find((x) => x.esBase) ?? p.presentaciones[0];
          const noBase = p.presentaciones.find((x) => !x.esBase);
          return {
            id: p.id,
            codigo: p.codigo,
            nombre: p.nombre,
            principioActivo: p.principioActivo ?? '',
            formaFarmaceutica: p.formaFarmaceutica ?? '',
            presentacion: (noBase ?? base)?.nombre ?? p.unidadBase,
            presentacionBase: base
              ? { id: base.id, nombre: base.nombre, factor: base.factor }
              : undefined,
            presentaciones: [...p.presentaciones]
              .sort((a, b) => a.factor - b.factor)
              .map((x) => ({
                id: x.id,
                nombre: x.nombre,
                factor: x.factor,
                precioVenta: Number(x.precioVenta),
                esBase: !!x.esBase,
              })),
            categoria: p.categoria,
            laboratorio: p.laboratorio ?? '',
            ubicacion: p.ubicacion ?? '',
            lote: {
              numero: fefo?.lote ?? '—',
              fechaVencimiento: fefo ? fefo.vencimiento.slice(0, 10) : '',
              cantidad: fefo?.cantidadBase ?? 0,
            },
            lotes: ls.map((l) => ({
              numero: l.lote,
              fechaVencimiento: l.vencimiento.slice(0, 10),
              cantidad: l.cantidadBase,
            })),
            stockActual: s?.cantidadBase ?? 0,
            stockMinimo: s?.stockMinimo ?? 0,
            precioCompra: s?.costoPromedio ? Number(s.costoPromedio) : 0,
            precioVenta: base ? Number(base.precioVenta) : 0,
            requiereReceta: p.requiereReceta,
            controlado: p.controlado,
          };
        });
        this.productos.set(filas);
        this.cargando.set(false);
      },
      error: (e) => {
        this.cargando.set(false);
        this.toast.error('No se pudo cargar el inventario: ' + e.message);
      },
    });
  }

  /**
   * Días de anticipación con que se avisa un vencimiento, según Ajustes.
   *
   * Estaban fijos en 30 y repetidos en cuatro sitios de este archivo, así que
   * cambiar el valor en Configuración no hacía nada aquí y arreglar una copia
   * no arreglaba las otras. Ahora todo el archivo pasa por este punto.
   */
  protected readonly diasAlerta = computed(() => {
    const d = Number(this.configSvc.config()?.alertaVencimientoDias);
    return Number.isFinite(d) && d > 0 ? d : 30;
  });

  /** Fecha límite "por vencer": hoy + los días configurados. */
  private limiteAlerta(): { hoy: Date; limite: Date } {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const limite = new Date(hoy);
    limite.setDate(limite.getDate() + this.diasAlerta());
    return { hoy, limite };
  }

  /** Estado de vencimiento de una fecha cualquiera. Único criterio del módulo. */
  private clasificarVencimiento(fecha: string): AlertaVencimiento {
    const { hoy, limite } = this.limiteAlerta();
    const f = new Date(fecha);
    if (isNaN(f.getTime())) return 'OK';
    if (f < hoy) return 'VENCIDO';
    if (f <= limite) return 'POR_VENCER';
    return 'OK';
  }

  /** Estado de vencimiento de un lote suelto (para la vista por-lote). */
  estadoLote(fechaVencimiento: string): AlertaVencimiento {
    return this.clasificarVencimiento(fechaVencimiento);
  }

  /** Unidades vencidas de un producto (sumando sus lotes vencidos). */
  unidadesVencidas(p: ProductoInventario): number {
    return p.lotes
      .filter((l) => this.estadoLote(l.fechaVencimiento) === 'VENCIDO')
      .reduce((s, l) => s + l.cantidad, 0);
  }

  irAMermas(): void { this.router.navigate(['/mermas']); }
  irAReposicion(): void { this.router.navigate(['/reposicion']); }

  // ── Filtros ──────────────────────────────────────────────────────────────────
  protected busqueda        = signal('');
  protected filtroCategoria = signal('todas');
  protected filtroLab       = signal('todos');
  protected filtroAlerta    = signal<FiltroAlerta>('todos');
  protected filtroStock     = signal<FiltroStock>('todos');

  // ── UI state ─────────────────────────────────────────────────────────────────
  protected productoSeleccionado = signal<ProductoInventario | null>(null);
  protected mostrarFormAjuste    = signal(false);
  protected productoAjuste       = signal<ProductoInventario | null>(null);
  protected mostrarFormEditar    = signal(false);
  protected productoEditando     = signal<ProductoInventario | null>(null);
  protected vistaActiva          = signal<'inventario' | 'alertas'>('inventario');
  protected mostrarHistorial     = signal(false);

  abrirNotaIngreso(): void {
    // Opción 1: el ingreso de mercadería vive en Compras (crea lote y stock real).
    this.router.navigate(['/compras']);
  }

  // ── Estado de datos (real, del backend) ──────────────────────────────────────
  protected readonly productos = signal<ProductoInventario[]>([]);
  protected readonly cargando  = signal(true);

  // ── Listas únicas para filtros ────────────────────────────────────────────────
  protected readonly categorias = computed(() =>
    [...new Set(this.productos().map(p => p.categoria))].sort()
  );
  protected readonly laboratorios = computed(() =>
    [...new Set(this.productos().map(p => p.laboratorio))].sort()
  );

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  protected readonly kpis = computed(() => {
    const lista = this.productos();
    return {
      totalSkus:       lista.length,
      valorInventario: lista.reduce((s, p) => s + p.precioCompra * p.stockActual, 0),
      stockBajo:       lista.filter(p => p.stockActual <= p.stockMinimo && p.stockActual > 0).length,
      sinStock:        lista.filter(p => p.stockActual === 0).length,
      // Mismo criterio que las filas de la tabla: si no, la tarjeta decía una
      // cosa y la lista de abajo mostraba otra.
      vencidos:        lista.filter(p => this.alertaVencimiento(p) === 'VENCIDO').length,
      porVencer:       lista.filter(p => this.alertaVencimiento(p) === 'POR_VENCER').length,
    };
  });

  // ── Alerta de vencimiento ─────────────────────────────────────────────────────
  alertaVencimiento(p: ProductoInventario): AlertaVencimiento {
    return this.clasificarVencimiento(p.lote.fechaVencimiento);
  }

  // ── Productos filtrados ───────────────────────────────────────────────────────
  protected readonly productosFiltrados = computed(() => {
    const q   = this.busqueda().toLowerCase().trim();
    const cat = this.filtroCategoria();
    const lab = this.filtroLab();
    const al  = this.filtroAlerta();
    const st  = this.filtroStock();

    return this.productos().filter(p => {
      if (cat !== 'todas' && p.categoria !== cat) return false;
      if (lab !== 'todos' && p.laboratorio !== lab) return false;
      if (al  !== 'todos' && this.alertaVencimiento(p) !== al) return false;
      if (st  === 'bajo'  && p.stockActual > p.stockMinimo) return false;
      if (st  === 'normal' && p.stockActual <= p.stockMinimo) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        p.principioActivo.toLowerCase().includes(q) ||
        p.codigo.includes(q) ||
        p.lote.numero.toLowerCase().includes(q)
      );
    });
  });

  // ── Formulario ajuste de stock ────────────────────────────────────────────────
  protected formAjuste: FormAjusteStock = this.formAjusteVacio();

  private formAjusteVacio(): FormAjusteStock {
    return { tipo: 'INGRESO', cantidad: null, motivo: '', loteNumero: '', loteFechaVencimiento: '' };
  }

  // ── Acciones ─────────────────────────────────────────────────────────────────
  /** Movimientos REALES (kardex) del producto seleccionado. */
  protected readonly movimientos = signal<Movimiento[]>([]);

  /** Stock del producto en las demás boticas (para derivar al cliente). */
  protected readonly disponibilidad = signal<DisponibilidadRow[]>([]);
  protected readonly cargandoDisponibilidad = signal(false);

  /** Otras sedes que SÍ tienen el producto vendible. */
  protected readonly otrasConStock = computed(() => {
    const mia = this.sucursalId();
    return this.disponibilidad().filter((d) => d.sucursalId !== mia && d.vendible > 0);
  });

  verDetalle(p: ProductoInventario): void {
    const abrir = this.productoSeleccionado()?.id !== p.id;
    this.productoSeleccionado.set(abrir ? p : null);
    this.movimientos.set([]);
    this.disponibilidad.set([]);
    if (!abrir) return;
    const sucursalId = this.sucursalId();
    if (!sucursalId) return;

    this.cargandoDisponibilidad.set(true);
    this.invApi.disponibilidad(p.id).subscribe({
      next: (rows) => { this.disponibilidad.set(rows); this.cargandoDisponibilidad.set(false); },
      error: () => { this.disponibilidad.set([]); this.cargandoDisponibilidad.set(false); },
    });

    this.invApi.movimientos(sucursalId, p.id).subscribe({
      next: (rows) =>
        this.movimientos.set(
          rows.map((m) => ({
            fecha: m.fecha.replace('T', ' ').slice(0, 16),
            tipo: m.tipo === 'AJUSTE' ? 'AJUSTE' : m.cantidadBase >= 0 ? 'INGRESO' : 'SALIDA',
            cantidad: Math.abs(m.cantidadBase),
            stockResultante: m.stockResultante,
            motivo: m.motivo ?? '',
            // Los movimientos anteriores a la columna de autor y los de venta
            // no lo traen; el kardex lo dice en vez de dejar un hueco mudo.
            usuario: m.usuario || 'Sin registrar',
          })),
        ),
      error: () => this.movimientos.set([]),
    });
  }

  cerrarDetalle(): void { this.productoSeleccionado.set(null); }

  abrirFormNuevo(): void {
    // Opción 1: el alta de medicamentos vive en Compras (datos reales).
    this.router.navigate(['/compras']);
  }

  abrirAjuste(p: ProductoInventario, event: Event): void {
    event.stopPropagation();
    this.formAjuste = this.formAjusteVacio();
    this.productoAjuste.set(p);
    this.mostrarFormAjuste.set(true);
  }

  cerrarAjuste(): void {
    this.mostrarFormAjuste.set(false);
    this.productoAjuste.set(null);
  }

  aplicarAjuste(): void {
    const f = this.formAjuste;
    const p = this.productoAjuste();
    const sucursalId = this.sucursalId();
    if (!p || !f.cantidad || !sucursalId) return;

    // Calcula el delta con signo según el tipo de ajuste.
    let delta = f.cantidad;
    if (f.tipo === 'SALIDA') delta = -f.cantidad;
    else if (f.tipo === 'AJUSTE') delta = f.cantidad - p.stockActual; // fijar valor absoluto
    if (delta === 0) {
      this.cerrarAjuste();
      return;
    }

    // Los ingresos (+) exigen lote y vencimiento para no crear stock sin
    // trazabilidad; el backend lo aplica al lote (o crea uno) y mantiene todo cuadrado.
    if (delta > 0 && (!f.loteNumero || !f.loteFechaVencimiento)) {
      this.toast.aviso('Para sumar stock indica el N° de lote y su vencimiento');
      return;
    }

    this.invApi
      .ajustar({
        productoId: p.id,
        sucursalId,
        cantidadBase: delta,
        motivo: f.motivo?.trim() || 'Ajuste manual de inventario',
        loteNumero: delta > 0 ? f.loteNumero : undefined,
        vencimiento: delta > 0 ? f.loteFechaVencimiento : undefined,
      })
      .subscribe({
        next: () => {
          this.toast.exito('Stock ajustado');
          this.cerrarAjuste();
          this.cargar(); // recargar para reflejar el cambio real
        },
        error: (e) => this.toast.error('No se pudo ajustar: ' + e.message),
      });
  }

  limpiarFiltros(): void {
    this.busqueda.set('');
    this.filtroCategoria.set('todas');
    this.filtroLab.set('todos');
    this.filtroAlerta.set('todos');
    this.filtroStock.set('todos');
  }

  // ── Helpers de presentación ───────────────────────────────────────────────────
  badgeAlerta(p: ProductoInventario): { clase: string; label: string } {
    switch (this.alertaVencimiento(p)) {
      case 'VENCIDO':    return { clase: 'bg-red-100 text-red-700',    label: 'Vencido' };
      case 'POR_VENCER': return { clase: 'bg-amber-100 text-amber-700', label: 'Vence pronto' };
      default:           return { clase: 'bg-emerald-100 text-emerald-700', label: 'Vigente' };
    }
  }

  colorStock(p: ProductoInventario): string {
    if (p.stockActual === 0)                      return 'text-red-600 font-bold';
    if (p.stockActual <= p.stockMinimo)           return 'text-amber-600 font-bold';
    return 'text-text-main font-bold';
  }

  iconoStock(p: ProductoInventario): string {
    if (p.stockActual === 0)            return 'remove_shopping_cart';
    if (p.stockActual <= p.stockMinimo) return 'warning';
    return 'check_circle';
  }

  colorIconoStock(p: ProductoInventario): string {
    if (p.stockActual === 0)            return 'text-red-500';
    if (p.stockActual <= p.stockMinimo) return 'text-amber-500';
    return 'text-emerald-500';
  }

  formatSol(n: number): string {
    return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatFecha(iso: string): string {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  margen(p: ProductoInventario): number {
    if (!p.precioVenta) return 0;
    return Math.round(((p.precioVenta - p.precioCompra) / p.precioVenta) * 100);
  }

  // ── EDITAR PRODUCTO ───────────────────────────────────────────────────────────
  protected formEditar: FormEditarProducto = this.formEditarVacio();

  private formEditarVacio(): FormEditarProducto {
    return {
      nombre: '', principioActivo: '', presentacion: '',
      categoria: '', laboratorio: '', ubicacion: '',
      stockMinimo: null, precioCompra: null, precioVenta: null,
      requiereReceta: false, controlado: false,
    };
  }

  abrirEditar(p: ProductoInventario, event: Event): void {
    event.stopPropagation();
    this.formEditar = {
      nombre: p.nombre, principioActivo: p.principioActivo,
      presentacion: p.presentacion, categoria: p.categoria,
      laboratorio: p.laboratorio, ubicacion: p.ubicacion,
      stockMinimo: p.stockMinimo, precioCompra: p.precioCompra,
      precioVenta: p.precioVenta, requiereReceta: p.requiereReceta,
      controlado: p.controlado,
    };
    this.productoEditando.set(p);
    this.presentaciones.set([...(p.presentaciones ?? [])]);
    this.limpiarNuevaPres();
    this.mostrarFormEditar.set(true);
  }

  // ── Presentaciones: caja / blíster / unidad ─────────────────────────────────
  //
  // Antes solo se podía editar el nombre y el precio de la presentación BASE.
  // Un producto creado con una sola presentación quedaba atrapado así para
  // siempre: en el POS el modal "Elegir presentación" mostraba una única
  // opción y no había forma de añadir el blíster sin recrear el producto,
  // perdiendo su historial de ventas. Los endpoints existían en la API; faltaba
  // la pantalla.

  protected readonly presentaciones = signal<
    Array<{ id: string; nombre: string; factor: number; precioVenta: number; esBase: boolean }>
  >([]);
  protected readonly guardandoPres = signal(false);

  protected presNombre = signal('');
  protected presFactor = signal<number | null>(null);
  protected presPrecio = signal<number | null>(null);

  private limpiarNuevaPres(): void {
    this.presNombre.set('');
    this.presFactor.set(null);
    this.presPrecio.set(null);
  }

  /** Cuántas unidades base contiene la presentación base (para explicar el factor). */
  protected readonly unidadBase = computed(
    () => this.presentaciones().find((x) => x.esBase)?.nombre || 'unidad',
  );

  agregarPresentacion(): void {
    const p = this.productoEditando();
    if (!p) return;
    const nombre = this.presNombre().trim();
    const factor = Number(this.presFactor());
    const precio = Number(this.presPrecio());

    if (!nombre) { this.toast.aviso('Ponle un nombre: Caja, Blíster, Unidad…'); return; }
    if (!Number.isInteger(factor) || factor < 1) {
      this.toast.aviso(`Cuántas ${this.unidadBase()}(s) contiene: un número entero, mínimo 1`);
      return;
    }
    if (!precio || precio <= 0) { this.toast.aviso('El precio debe ser mayor a 0'); return; }
    if (this.presentaciones().some((x) => x.factor === factor)) {
      this.toast.aviso(`Ya existe una presentación de ${factor} unidad(es)`);
      return;
    }

    this.guardandoPres.set(true);
    this.invApi
      .crearPresentacion(p.id, { nombre, factor, precioVenta: precio })
      .subscribe({
        next: () => {
          this.guardandoPres.set(false);
          this.toast.exito(`"${nombre}" añadida`);
          this.limpiarNuevaPres();
          // Recarga el catálogo y refresca la lista del modal sin cerrarlo.
          this.cargar();
          setTimeout(() => this.refrescarPresentaciones(p.id), 400);
        },
        error: (e) => {
          this.guardandoPres.set(false);
          this.toast.error(e.error?.message ?? e.message ?? 'No se pudo añadir');
        },
      });
  }

  quitarPresentacion(pres: { id: string; nombre: string; esBase: boolean }): void {
    const p = this.productoEditando();
    if (!p) return;
    if (pres.esBase) {
      this.toast.aviso('No se puede borrar la presentación base: es la unidad del stock');
      return;
    }
    this.invApi.eliminarPresentacion(p.id, pres.id).subscribe({
      next: () => {
        this.toast.aviso(`"${pres.nombre}" eliminada`);
        this.cargar();
        setTimeout(() => this.refrescarPresentaciones(p.id), 400);
      },
      error: (e) =>
        this.toast.error(
          e.error?.message ?? 'No se pudo eliminar (puede tener ventas registradas)',
        ),
    });
  }

  /**
   * Convierte una presentación en la unidad base.
   *
   * El backend solo lo permite si el producto no tiene stock ni ventas: la base
   * define la unidad en que está contado todo el inventario, y cambiarla con
   * mercadería encima reinterpretaría las cantidades (30 cajas pasarían a
   * leerse como 30 unidades).
   */
  hacerBase(pres: { id: string; nombre: string; esBase: boolean }): void {
    const p = this.productoEditando();
    if (!p || pres.esBase) return;
    this.invApi.hacerBase(p.id, pres.id).subscribe({
      next: () => {
        this.toast.exito(`"${pres.nombre}" es ahora la unidad base (factor 1)`);
        this.cargar();
        setTimeout(() => this.refrescarPresentaciones(p.id), 400);
      },
      error: (e) =>
        this.toast.error(e.error?.message ?? 'No se pudo cambiar la unidad base'),
    });
  }

  /** Vuelve a leer las presentaciones del producto desde la lista ya recargada. */
  private refrescarPresentaciones(productoId: string): void {
    const actualizado = this.productos().find((x) => x.id === productoId);
    if (actualizado) {
      this.presentaciones.set([...(actualizado.presentaciones ?? [])]);
      this.productoEditando.set(actualizado);
    }
  }

  cerrarEditar(): void {
    this.mostrarFormEditar.set(false);
    this.productoEditando.set(null);
  }

  guardarEdicion(): void {
    const p = this.productoEditando();
    const f = this.formEditar;
    const sucursalId = this.sucursalId();
    if (!p || !f.nombre || !sucursalId) return;

    // 1) Datos maestros del medicamento (catálogo).
    const datos: Record<string, unknown> = {
      nombre: f.nombre.trim(),
      categoria: f.categoria.trim(),
      principioActivo: f.principioActivo?.trim() || undefined,
      laboratorio: f.laboratorio?.trim() || undefined,
      ubicacion: f.ubicacion?.trim() || undefined,
      requiereReceta: f.requiereReceta,
      controlado: f.controlado,
    };

    // El precio de venta y el nombre de la presentación viven en la
    // PRESENTACIÓN, no en el producto. El formulario los recogía pero nunca los
    // enviaba: eran campos fantasma que se descartaban al guardar (y un
    // producto cargado a S/ 0 quedaba atrapado, sin poder venderse ni
    // corregirse).
    const base = p.presentacionBase;
    const precio = Number(f.precioVenta);
    const nombrePres = (f.presentacion ?? '').trim() || base?.nombre || 'Unidad';
    const cambioPresentacion =
      !!base && ((precio > 0 && precio !== p.precioVenta) || nombrePres !== base.nombre);

    const min = f.stockMinimo ?? p.stockMinimo;
    const cambioMinimo = min !== p.stockMinimo;

    this.invApi.editarProducto(p.id, datos).subscribe({
      next: () => {
        // 2) y 3) son opcionales: solo se llaman si algo cambió. Se lanzan
        // juntas y se cierra cuando ambas respondan (forkJoin necesita al menos
        // un observable, por eso el `of(null)` de relleno).
        const precioOp = cambioPresentacion && base
          ? this.invApi.actualizarPresentacion(p.id, base.id, {
              nombre: nombrePres,
              factor: base.factor,
              // Si el usuario no tocó el precio, se reenvía el actual: el
              // backend exige > 0 y no admite dejarlo sin valor.
              precioVenta: precio > 0 ? precio : p.precioVenta,
              esBase: true,
            })
          : of(null);

        const minimoOp = cambioMinimo
          ? this.invApi.setStockMinimo(sucursalId, p.id, min)
          : of(null);

        forkJoin([precioOp, minimoOp]).subscribe({
          next: () => this.finalizarEdicion(),
          error: (e) =>
            this.toast.error(
              'Datos guardados, pero falló precio o stock mínimo: ' +
                (e.error?.message ?? e.message),
            ),
        });
      },
      error: (e) => this.toast.error('No se pudo guardar: ' + (e.error?.message ?? e.message)),
    });
  }

  private finalizarEdicion(): void {
    this.toast.exito('Medicamento actualizado');
    this.cerrarEditar();
    this.cerrarDetalle();
    this.cargar();
  }

  // ── Confirmaciones ────────────────────────────────────────────────────────────
  // Antes eran `confirm()` del navegador: un cuadro gris del sistema, con la
  // URL encima, en medio de una pantalla con la marca de la botica. El resto
  // del sistema usa modales propios; esto desentonaba.
  protected readonly confirmarAccion = signal<'desactivar' | 'eliminar' | null>(null);
  protected readonly productoAccion  = signal<ProductoInventario | null>(null);
  protected readonly procesandoAccion = signal(false);

  pedirDesactivar(p: ProductoInventario): void {
    this.productoAccion.set(p);
    this.confirmarAccion.set('desactivar');
  }
  pedirEliminar(p: ProductoInventario): void {
    this.productoAccion.set(p);
    this.confirmarAccion.set('eliminar');
  }
  cancelarAccion(): void {
    this.confirmarAccion.set(null);
    this.productoAccion.set(null);
  }

  ejecutarAccion(): void {
    const p = this.productoAccion();
    const accion = this.confirmarAccion();
    if (!p || !accion) return;
    this.procesandoAccion.set(true);

    const cerrarTodo = () => {
      this.procesandoAccion.set(false);
      this.cancelarAccion();
      this.cerrarEditar();
      this.cerrarDetalle();
      this.cargar();
    };

    if (accion === 'desactivar') {
      this.invApi.desactivarProducto(p.id).subscribe({
        next: () => { this.toast.exito('Medicamento desactivado'); cerrarTodo(); },
        error: (e) => {
          this.procesandoAccion.set(false);
          this.toast.error('No se pudo desactivar: ' + e.message);
        },
      });
      return;
    }

    this.invApi.eliminarProducto(p.id).subscribe({
      next: () => { this.toast.exito('Medicamento eliminado'); cerrarTodo(); },
      error: (e) => {
        this.procesandoAccion.set(false);
        this.toast.error(
          e.message?.includes('historial')
            ? 'Tiene historial: no se puede eliminar. Usa "Desactivar".'
            : 'No se pudo eliminar: ' + e.message,
        );
      },
    });
  }

  // ── VISTA DE ALERTAS ──────────────────────────────────────────────────────────
  protected readonly productosConAlerta = computed(() => {
    return {
      vencidos:   this.productos().filter(p => this.alertaVencimiento(p) === 'VENCIDO'),
      porVencer:  this.productos().filter(p => this.alertaVencimiento(p) === 'POR_VENCER'),
      sinStock:   this.productos().filter(p => p.stockActual === 0),
      stockBajo:  this.productos().filter(p => p.stockActual > 0 && p.stockActual <= p.stockMinimo),
    };
  });

  // Aquí vivía `movimientosMock`: cinco movimientos inventados con nombres
  // falsos ("Ana Silva", "Carlos Soto") y números de factura de mentira.
  // No se usaba, pero estaba a un descuido de aparecer en pantalla del cliente.
  // El kardex real llega por `movimientos()` desde /inventario/movimientos.

  iconoMovimiento(tipo: Movimiento['tipo']): string {
    switch (tipo) {
      case 'INGRESO': return 'arrow_downward';
      case 'SALIDA':  return 'arrow_upward';
      case 'AJUSTE':  return 'sync';
    }
  }

  colorMovimiento(tipo: Movimiento['tipo']): string {
    switch (tipo) {
      case 'INGRESO': return 'text-emerald-600 bg-emerald-50';
      case 'SALIDA':  return 'text-red-600 bg-red-50';
      case 'AJUSTE':  return 'text-primary-600 bg-primary-50';
    }
  }

  /** Forma farmacéutica legible ('' si el producto no la tiene definida). */
  etiquetaFormaDe(p: ProductoInventario): string {
    return etiquetaForma(p.formaFarmaceutica);
  }
}
