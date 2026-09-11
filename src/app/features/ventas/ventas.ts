import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EstadoVenta, TipoComprobante } from '../../core/models/venta.model';
import { MetodoPago } from '../../core/models/carrito.model';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { SucursalService } from '../../core/services/sucursal.service';
import { VentaService, VentaBackend } from '../../core/services/venta.service';
import { DevolucionService, DevolucionBackend } from '../../core/services/devolucion.service';
import { ComprobanteService } from '../pos/comprobante.service';

interface ItemDetalle {
  ventaItemId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

interface VentaUI {
  id: string;
  numeroComprobante: string;
  tipoComprobante: TipoComprobante;
  /** Fecha LOCAL (Perú) "2026-05-20" para filtros/KPIs */
  fecha: string;
  /** Texto de visualización ("20/05, 11:45") */
  fechaHora: string;
  clienteNombre: string;
  clienteDoc: string;
  cajeroNombre: string;
  metodoPago: MetodoPago;
  items: ItemDetalle[];
  subtotal: number;
  igv: number;
  total: number;
  estado: EstadoVenta;
  motivoAnulacion?: string;
  /** Fecha/hora en que se anuló (texto legible), si aplica. */
  anuladaEnTexto?: string;
  /** ¿Tiene alguna devolución registrada? */
  tieneDevolucion: boolean;
  /** Monto total devuelto (S/.). */
  totalDevuelto: number;
  /** Total neto tras devoluciones (total − devuelto). */
  totalNeto: number;
}

/** Fecha local (zona del navegador) en formato ISO YYYY-MM-DD, sin pasar por UTC. */
function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Hoy en hora local (Perú). */
function hoyLocal(): string {
  return isoLocal(new Date());
}

@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './ventas.html',
  styleUrl: './ventas.scss',
})
export class VentasComponent implements OnInit {
  private readonly toast       = inject(ToastService);
  private readonly auth        = inject(AuthService);
  /** Sucursal ACTIVA del header: con multi-botica, la del token no basta. */
  private readonly sucursalSvc = inject(SucursalService);
  private readonly ventaSvc     = inject(VentaService);
  private readonly devolucionSvc = inject(DevolucionService);
  private readonly comprobante  = inject(ComprobanteService);

  /** Los del mostrador y admins pueden hacer devoluciones. */
  protected readonly puedeDevolver = computed(() =>
    this.auth.tieneAlgunRol('SUPER_ADMIN', 'ADMIN', 'VENDEDOR', 'FARMACEUTICO'),
  );

  /** Tamaño de página del historial. */
  private readonly TAM = 50;
  private pagina = 0;

  // ── Estado de datos ──────────────────────────────────────────────────
  protected readonly ventas      = signal<VentaUI[]>([]);
  private   readonly ventasHoy   = signal<VentaUI[]>([]);
  /** Anulaciones HECHAS hoy (por fecha de anulación, no de la venta). */
  private   readonly anuladasHoy = signal(0);
  protected readonly cargando    = signal(false);
  protected readonly cargandoMas = signal(false);
  protected readonly hayMas      = signal(false);

  /** Solo ADMIN/SUPER_ADMIN pueden anular (igual que el backend). */
  protected readonly puedeAnular = computed(() =>
    this.auth.tieneAlgunRol('SUPER_ADMIN', 'ADMIN'),
  );

  // ── Filtros ──────────────────────────────────────────────────────────
  // estado / fechas → se aplican en el BACKEND (recargan la lista).
  // búsqueda / método → se aplican en el cliente sobre lo ya cargado.
  protected busqueda     = signal('');
  protected filtroEstado = signal<'todos' | EstadoVenta>('todos');
  protected filtroMetodo = signal<'todos' | MetodoPago>('todos');
  protected fechaDesde   = signal('');
  protected fechaHasta   = signal('');
  protected ventaDetalle = signal<VentaUI | null>(null);

  /** Orden del servidor (columna + dirección). */
  protected orden = signal<'fecha_desc' | 'fecha_asc' | 'total_desc' | 'total_asc'>('fecha_desc');
  /** Total real de la consulta (todas las páginas), para "Mostrando X de N". */
  protected total = signal(0);
  /** Temporizador para el debounce de la búsqueda. */
  private busquedaTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Modal anular ───────────────────────────────────────────────────────
  protected mostrarModalAnular = signal(false);
  protected ventaParaAnular    = signal<VentaUI | null>(null);
  protected motivoAnulacion    = signal('');
  protected anulando           = signal(false);

  // ── Modal devolución ──────────────────────────────────────────────────
  protected mostrarDevolucion = signal(false);
  protected ventaDevolver     = signal<VentaUI | null>(null);
  protected motivoDevolucion  = signal('');
  protected devolviendo       = signal(false);
  /** Cantidad a devolver por ventaItemId. */
  protected cantDevolver      = signal<Record<string, number>>({});

  // ── Devoluciones ya registradas de la venta abierta en el detalle ──────
  protected devolucionesDetalle = signal<DevolucionBackend[]>([]);
  protected cargandoDev         = signal(false);

  /** Unidades ya devueltas por ventaItemId (de las devoluciones registradas). */
  protected readonly devueltoPorItem = computed<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    for (const d of this.devolucionesDetalle()) {
      for (const it of d.items) {
        acc[it.ventaItemId] = (acc[it.ventaItemId] ?? 0) + it.cantidad;
      }
    }
    return acc;
  });

  /** Total devuelto (S/.) de la venta abierta. */
  protected readonly totalDevuelto = computed(() =>
    this.devolucionesDetalle().reduce((s, d) => s + Number(d.monto), 0),
  );

  protected readonly totalDevolver = computed(() => {
    const v = this.ventaDevolver();
    if (!v) return 0;
    const cants = this.cantDevolver();
    return v.items.reduce((s, it) => s + (cants[it.ventaItemId] ?? 0) * it.precioUnitario, 0);
  });

  ngOnInit(): void {
    this.cargar(true);
    this.cargarKpis();
  }

  // ── Carga ────────────────────────────────────────────────────────────
  /** Carga el historial real con TODOS los filtros aplicados en el servidor. */
  cargar(reset: boolean): void {
    if (reset) {
      this.pagina = 0;
      this.cargando.set(true);
    } else {
      this.cargandoMas.set(true);
    }
    const sid = this.sucursalSvc.sucursalActivaId() ?? this.auth.usuario()?.sucursalActualId;
    this.ventaSvc.listarPaginado(sid, this.filtrosServidor(this.pagina)).subscribe({
      next: (res) => {
        const mapped = res.items.map((r) => this.mapVenta(r));
        this.ventas.update((prev) => (reset ? mapped : [...prev, ...mapped]));
        this.total.set(res.total);
        this.hayMas.set(this.ventas().length < res.total);
        this.cargando.set(false);
        this.cargandoMas.set(false);
      },
      error: (e) => {
        this.cargando.set(false);
        this.cargandoMas.set(false);
        if (reset) { this.ventas.set([]); this.total.set(0); } // nunca dejar datos viejos
        this.toast.error('No se pudo cargar el historial: ' + e.message);
      },
    });
  }

  /** Búsqueda con debounce: consulta al servidor 350 ms después de teclear. */
  onBusqueda(valor: string): void {
    this.busqueda.set(valor);
    if (this.busquedaTimer) clearTimeout(this.busquedaTimer);
    this.busquedaTimer = setTimeout(() => this.cargar(true), 350);
  }

  /** Cambia el método de pago (filtro de servidor) y recarga. */
  cambiarMetodo(m: string): void {
    this.filtroMetodo.set(m as 'todos' | MetodoPago);
    this.cargar(true);
  }

  /** Ordena por una columna, alternando asc/desc, y recarga desde el servidor. */
  ordenarPor(col: 'fecha' | 'total'): void {
    const actual = this.orden();
    if (col === 'fecha') {
      this.orden.set(actual === 'fecha_desc' ? 'fecha_asc' : 'fecha_desc');
    } else {
      this.orden.set(actual === 'total_desc' ? 'total_asc' : 'total_desc');
    }
    this.cargar(true);
  }

  /** KPIs del día: se consultan aparte para no depender de los filtros de la tabla. */
  private cargarKpis(): void {
    const sid = this.sucursalSvc.sucursalActivaId() ?? this.auth.usuario()?.sucursalActualId;
    const hoy = hoyLocal();
    const desde = `${hoy}T00:00:00-05:00`;
    const hasta = `${hoy}T23:59:59-05:00`;

    // Ventas / recaudado / ticket → por fecha de CREACIÓN de hoy.
    this.ventaSvc
      .listarBackend(sid, { desde, hasta, size: 200 })
      .subscribe({
        next: (rows) => this.ventasHoy.set(rows.map((r) => this.mapVenta(r))),
        error: () => this.ventasHoy.set([]),
      });

    // Anuladas → por fecha de ANULACIÓN de hoy (semántica correcta).
    this.ventaSvc.contarAnuladas(sid, desde, hasta).subscribe({
      next: (r) => this.anuladasHoy.set(r.count),
      error: () => this.anuladasHoy.set(0),
    });
  }

  /** Construye los query params de servidor a partir de los filtros actuales. */
  private filtrosServidor(page: number) {
    return {
      q: this.busqueda().trim() || undefined,
      metodoPago: this.filtroMetodo() !== 'todos' ? this.filtroMetodo() : undefined,
      estado: this.filtroEstado() !== 'todos' ? this.filtroEstado() : undefined,
      orden: this.orden(),
      desde: this.fechaDesde() ? `${this.fechaDesde()}T00:00:00-05:00` : undefined,
      hasta: this.fechaHasta() ? `${this.fechaHasta()}T23:59:59-05:00` : undefined,
      page,
      size: this.TAM,
    };
  }

  /** Carga la siguiente página y la agrega al final. */
  cargarMas(): void {
    if (this.cargandoMas() || !this.hayMas()) return;
    this.pagina++;
    this.cargar(false);
  }

  /** Re-consulta el backend cuando cambia un filtro de servidor (estado/fechas). */
  aplicarFiltroServidor(): void {
    this.cargar(true);
  }

  private mapVenta(v: VentaBackend): VentaUI {
    const cli = v.cliente;
    const caj = v.cajero;
    const metodo = v.pagos.length > 1 ? 'MIXTO' : (v.pagos[0]?.metodo ?? 'EFECTIVO');
    const d = new Date(v.fecha);
    const devs = v.devoluciones ?? [];
    const totalDevuelto = devs.reduce((s, x) => s + Number(x.monto), 0);
    const total = Number(v.total);
    return {
      id: v.id,
      numeroComprobante: v.numeroComprobante,
      tipoComprobante: v.tipoComprobante,
      fecha: isoLocal(d),
      fechaHora: d.toLocaleString('es-PE', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      }),
      clienteNombre: cli
        ? (cli.razonSocial || `${cli.nombres} ${cli.apellidos ?? ''}`.trim())
        : 'Consumidor Final',
      clienteDoc: cli ? `${cli.tipoDocumento} ${cli.numeroDocumento}` : '',
      cajeroNombre: caj ? `${caj.nombres} ${caj.apellidos ?? ''}`.trim() : '—',
      metodoPago: metodo as MetodoPago,
      items: v.items.map((i) => ({
        ventaItemId: i.id,
        nombre: i.producto?.nombre ?? i.productoId,
        cantidad: i.cantidad,
        precioUnitario: Number(i.precioUnitario),
        subtotal: Number(i.subtotal),
      })),
      subtotal: Number(v.subtotal),
      igv: Number(v.igv),
      total,
      estado: v.estado as EstadoVenta,
      motivoAnulacion: v.motivoAnulacion ?? undefined,
      anuladaEnTexto: v.anuladaEn
        ? new Date(v.anuladaEn).toLocaleString('es-PE', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })
        : undefined,
      tieneDevolucion: devs.length > 0,
      totalDevuelto,
      totalNeto: Math.max(0, total - totalDevuelto),
    };
  }

  // El filtrado (búsqueda, método, estado, fechas) se hace en el SERVIDOR;
  // aquí solo exponemos las ventas ya cargadas de la página actual.
  protected ventasFiltradas = computed(() => this.ventas());

  // ── KPIs del día (desacoplados de los filtros) ───────────────────────
  protected kpis = computed(() => {
    const ventasHoy = this.ventasHoy();
    const completadas = ventasHoy.filter((v) => v.estado === 'COMPLETADA');
    const recaudado = completadas.reduce((s, v) => s + v.total, 0);
    return {
      totalVentas: completadas.length,
      totalHoy:    recaudado,
      ticketProm:  completadas.length ? recaudado / completadas.length : 0,
      anuladas:    this.anuladasHoy(),
    };
  });

  // ── Acciones de panel ─────────────────────────────────────────────────
  verDetalle(v: VentaUI): void {
    const abrir = this.ventaDetalle()?.id !== v.id;
    this.ventaDetalle.set(abrir ? v : null);
    this.devolucionesDetalle.set([]);
    if (abrir) this.cargarDevoluciones(v.id);
  }

  /** Trae las devoluciones ya registradas de una venta (para mostrarlas). */
  private cargarDevoluciones(ventaId: string): void {
    this.cargandoDev.set(true);
    this.devolucionSvc.listar(ventaId).subscribe({
      next: (d) => { this.devolucionesDetalle.set(d ?? []); this.cargandoDev.set(false); },
      error: () => { this.devolucionesDetalle.set([]); this.cargandoDev.set(false); },
    });
  }

  cerrarDetalle(): void { this.ventaDetalle.set(null); }

  limpiarFiltros(): void {
    if (this.busquedaTimer) { clearTimeout(this.busquedaTimer); this.busquedaTimer = null; }
    this.busqueda.set('');
    this.filtroEstado.set('todos');
    this.filtroMetodo.set('todos');
    this.fechaDesde.set('');
    this.fechaHasta.set('');
    this.orden.set('fecha_desc');
    this.cargar(true);
    this.toast.aviso('Filtros limpiados');
  }

  /** ¿Hay algún filtro activo? (para mostrar el botón "Limpiar" resaltado). */
  protected readonly hayFiltros = computed(() =>
    !!this.busqueda().trim() ||
    this.filtroEstado() !== 'todos' ||
    this.filtroMetodo() !== 'todos' ||
    !!this.fechaDesde() ||
    !!this.fechaHasta(),
  );

  // ── Anular venta ──────────────────────────────────────────────────────
  abrirAnular(v: VentaUI): void {
    if (!this.puedeAnular()) {
      this.toast.aviso('Solo un administrador puede anular ventas');
      return;
    }
    if (v.estado !== 'COMPLETADA') {
      this.toast.aviso('Solo se pueden anular ventas completadas');
      return;
    }
    this.ventaParaAnular.set(v);
    this.motivoAnulacion.set('');
    this.mostrarModalAnular.set(true);
  }

  cancelarAnular(): void {
    this.mostrarModalAnular.set(false);
    this.ventaParaAnular.set(null);
    this.motivoAnulacion.set('');
  }

  confirmarAnular(): void {
    const v = this.ventaParaAnular();
    const motivo = this.motivoAnulacion().trim();
    if (!v) return;
    if (motivo.length < 10) {
      this.toast.aviso('El motivo debe tener al menos 10 caracteres');
      return;
    }
    this.anulando.set(true);
    this.ventaSvc.anular(v.id, motivo).subscribe({
      next: () => {
        this.anulando.set(false);
        this.toast.exito(`Venta ${v.numeroComprobante} anulada`);
        this.cancelarAnular();
        this.cerrarDetalle();
        this.cargar(true);   // el backend devolvió el stock y marcó ANULADA
        this.cargarKpis();
      },
      error: (e) => {
        this.anulando.set(false);
        this.toast.error('No se pudo anular: ' + e.message);
      },
    });
  }

  // ── Devolución (parcial o total) ──────────────────────────────────────
  abrirDevolucion(v: VentaUI): void {
    if (!this.puedeDevolver()) { this.toast.aviso('No tienes permiso para devolver'); return; }
    if (v.estado !== 'COMPLETADA') { this.toast.aviso('Solo se pueden devolver ventas completadas'); return; }
    this.ventaDevolver.set(v);
    this.motivoDevolucion.set('');
    const init: Record<string, number> = {};
    for (const it of v.items) init[it.ventaItemId] = 0;
    this.cantDevolver.set(init);
    this.mostrarDevolucion.set(true);
  }

  cerrarDevolucion(): void {
    this.mostrarDevolucion.set(false);
    this.ventaDevolver.set(null);
  }

  /** Unidades que todavía se pueden devolver de un ítem (vendido − ya devuelto). */
  disponibleDevolver(ventaItemId: string, cantidadVendida: number): number {
    return Math.max(0, cantidadVendida - (this.devueltoPorItem()[ventaItemId] ?? 0));
  }

  setCantDevolver(itemId: string, valor: number, max: number): void {
    const v = Math.max(0, Math.min(Math.floor(valor || 0), max));
    this.cantDevolver.update((c) => ({ ...c, [itemId]: v }));
  }

  confirmarDevolucion(): void {
    const v = this.ventaDevolver();
    if (!v) return;
    const motivo = this.motivoDevolucion().trim();
    if (motivo.length < 4) { this.toast.aviso('Indica un motivo (mín. 4 caracteres)'); return; }
    const cants = this.cantDevolver();
    const items = v.items
      .filter((it) => (cants[it.ventaItemId] ?? 0) > 0)
      .map((it) => ({ ventaItemId: it.ventaItemId, cantidad: cants[it.ventaItemId] }));
    if (items.length === 0) { this.toast.aviso('Selecciona al menos un producto a devolver'); return; }
    this.devolviendo.set(true);
    this.devolucionSvc.crear({ ventaId: v.id, motivo, items }).subscribe({
      next: () => {
        this.devolviendo.set(false);
        this.toast.exito('Devolución registrada · stock reingresado');
        this.cerrarDevolucion();
        this.cargarDevoluciones(v.id);   // refresca lo devuelto en el detalle
        this.cargar(true);
      },
      error: (e) => {
        this.devolviendo.set(false);
        this.toast.error(e.error?.message ?? e.message ?? 'No se pudo registrar la devolución');
      },
    });
  }

  // ── Reimprimir (usa la MISMA fuente del ticket que el POS) ────────────
  reimprimir(v: VentaUI): void {
    // Por iframe oculto, igual que el POS: con window.open, cualquier
    // bloqueador de ventanas emergentes impedía reimprimir un comprobante —
    // y eso se pide a diario en el mostrador.
    const html = this.comprobante.generarDesde({
      numeroComprobante: v.numeroComprobante,
      tipoComprobante: v.tipoComprobante,
      fechaHoraTexto: v.fechaHora,
      cajero: v.cajeroNombre,
      clienteNombre: v.clienteNombre,
      clienteDoc: v.clienteDoc,
      metodoLabel: this.labelMetodo(v.metodoPago),
      items: v.items.map((it) => ({
        nombre: it.nombre,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        total: it.subtotal,
      })),
      subtotal: v.subtotal,
      igv: v.igv,
      total: v.total,
      anuladaMotivo: v.estado === 'ANULADA' ? (v.motivoAnulacion ?? '') : undefined,
    });
    this.comprobante.imprimir(html);
    this.toast.exito(`Reimprimiendo ${v.numeroComprobante}`);
  }

  // ── Exportar CSV ──────────────────────────────────────────────────────
  exportarCSV(): void {
    const filas = this.ventasFiltradas();
    if (filas.length === 0) {
      this.toast.aviso('No hay ventas para exportar');
      return;
    }
    const cab = [
      'Comprobante', 'Tipo', 'Fecha', 'Cliente', 'Documento',
      'Cajero', 'Método pago', 'Ítems', 'Subtotal', 'IGV', 'Total', 'Estado',
    ];
    const escapar = (v: string | number | undefined | null): string => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lineas = filas.map((v) => [
      v.numeroComprobante, v.tipoComprobante, v.fecha,
      v.clienteNombre, v.clienteDoc, v.cajeroNombre,
      this.labelMetodo(v.metodoPago), v.items.length,
      v.subtotal.toFixed(2), v.igv.toFixed(2), v.total.toFixed(2),
      this.labelEstado(v.estado),
    ].map(escapar).join(','));
    const contenido = '﻿' + [cab.join(','), ...lineas].join('\n');
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ventas_${hoyLocal()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.exito(`Exportadas ${filas.length} ventas a CSV`);
  }

  // ── Helpers de presentación ───────────────────────────────────────────
  badgeEstado(estado: EstadoVenta): string {
    switch (estado) {
      case 'COMPLETADA': return 'bg-emerald-100 text-emerald-700';
      case 'ANULADA':    return 'bg-red-100 text-red-700';
      case 'PENDIENTE':  return 'bg-amber-100 text-amber-700';
    }
  }

  labelEstado(estado: EstadoVenta): string {
    switch (estado) {
      case 'COMPLETADA': return 'Completada';
      case 'ANULADA':    return 'Anulada';
      case 'PENDIENTE':  return 'Pendiente';
    }
  }

  iconoMetodo(m: MetodoPago): string {
    switch (m) {
      case 'EFECTIVO':     return 'payments';
      case 'TARJETA':      return 'credit_card';
      case 'YAPE_PLIN':    return 'qr_code_2';
      case 'TRANSFERENCIA':return 'account_balance';
      default:             return 'attach_money';
    }
  }

  labelMetodo(m: MetodoPago): string {
    switch (m) {
      case 'EFECTIVO':     return 'Efectivo';
      case 'TARJETA':      return 'Tarjeta';
      case 'YAPE_PLIN':    return 'Yape/Plin';
      case 'TRANSFERENCIA':return 'Transferencia';
      case 'MIXTO':        return 'Mixto';
    }
  }

  iconoComprobante(t: TipoComprobante): string {
    switch (t) {
      case 'FACTURA': return 'receipt_long';
      case 'BOLETA':  return 'receipt';
      case 'TICKET':  return 'confirmation_number';
    }
  }

  formatSol(n: number): string {
    return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /** Fecha + hora legible (Perú) a partir de un ISO del backend. */
  formatFechaHora(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-PE', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  /** Nombre del producto de un ítem de la venta, dado su ventaItemId. */
  nombreItem(v: VentaUI, ventaItemId: string): string {
    return v.items.find((i) => i.ventaItemId === ventaItemId)?.nombre ?? 'Producto';
  }
}
