/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
import {
  Component,
  signal,
  computed,
  effect,
  HostListener,
  viewChild,
  ElementRef,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Producto, Presentacion, GrupoPrincipioActivo } from '../../core/models/producto.model';
import { ItemCarrito, MetodoPago } from '../../core/models/carrito.model';
import { Cliente } from '../../core/models/cliente.model';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ProductoService } from '../../core/services/producto.service';
import { StockSucursalService } from '../../core/services/stock-sucursal.service';
import { SucursalService } from '../../core/services/sucursal.service';
import { CajaService } from '../../core/services/caja.service';
import { VentaService } from '../../core/services/venta.service';
import { ClienteService } from '../../core/services/cliente.service';
import { ToastService } from '../../core/services/toast.service';
import { TipoComprobante, VentaCompletada } from './pos.model';
import { ComprobanteService } from './comprobante.service';
import { FocusTrapDirective } from '../../shared/focus-trap.directive';
import {
  round2 as _round2,
  factorVenta as _factorVenta,
  factorLinea as _factorLinea,
  lineaId as _lineaId,
  precioBaseDesde as _precioBaseDesde,
  baseEnCarrito as _baseEnCarrito,
  calcularTotales as _calcularTotales,
  chipPresentacion as _chipPresentacion,
} from './pos-calculos';

const IGV_RATE = 0.18;
const DEBOUNCE_MS = 200;
/** Tiempo máximo entre caracteres para considerar que viene de un scanner (ms) */
const SCAN_CHAR_SPEED_MS = 40;

interface Categoria {
  id: string;
  label: string;
  icono: string;
}

/**
 * Último método de pago usado en la sesión. Vive a nivel de módulo para
 * sobrevivir a la destrucción del componente (navegar a Caja y volver)
 * sin tocar localStorage. En botica peruana el default es EFECTIVO.
 */
let ultimoMetodoPago: MetodoPago = 'EFECTIVO';

/** Venta puesta en espera (cliente que olvidó la billetera, va por más, etc.). */
interface VentaEnEspera {
  id: number;
  items: ItemCarrito[];
  cliente: Cliente | null;
  dni: string;
  creadaEn: Date;
}

/** Ranuras de espera a nivel de módulo: sobreviven a salir/volver al POS. */
let ventasEnEsperaStore: VentaEnEspera[] = [];
const MAX_EN_ESPERA = 3;

/** Última venta completada de la sesión (para reimprimir sin ir al Historial). */
let ultimaVentaSesion: VentaCompletada | null = null;

/** Preferencia local: imprimir automáticamente el ticket al cobrar. */
const PREF_AUTO_IMPRIMIR = 'pos.autoImprimir';

/**
 * Punto de Venta (POS).
 *
 * Atajos:
 *  F1   - enfocar buscador
 *  F5   - método de pago Tarjeta
 *  F6   - método de pago Efectivo
 *  F7   - método de pago Yape/Plin
 *  F12  - procesar venta
 *  ESC  - limpiar buscador / cerrar modal
 *
 * Scanner:
 *  La pistola envía caracteres a < 40ms de intervalo.
 *  Si el foco NO está en un input, se acumula el buffer y al llegar Enter
 *  se busca el producto por código exacto.
 *  Si el foco SÍ está en el buscador y se presiona Enter, se intenta
 *  primero una búsqueda exacta por código; si no coincide, actúa como búsqueda normal.
 */
@Component({
  selector: 'app-pos',
  imports: [FormsModule, DecimalPipe, NgTemplateOutlet, FocusTrapDirective],
  templateUrl: './pos.html',
  styleUrl: './pos.scss',
})
export class PosComponent implements OnInit, OnDestroy {
  private readonly productoService = inject(ProductoService);
  private readonly stockService    = inject(StockSucursalService);
  private readonly sucursalService = inject(SucursalService);
  private readonly cajaService     = inject(CajaService);
  private readonly ventaService    = inject(VentaService);
  private readonly clienteService  = inject(ClienteService);
  private readonly auth            = inject(AuthService);
  private readonly router          = inject(Router);
  private readonly toastService    = inject(ToastService);
  private readonly comprobante     = inject(ComprobanteService);

  /**
   * Manejador ÚNICO de teclado global, registrado a mano en window.
   * (Los @HostListener('window:keydown') dejaron de engancharse en este
   * entorno tras ciclos de HMR; el registro manual es a prueba de todo.)
   */
  private readonly manejadorTecladoGlobal = (e: KeyboardEvent): void => {
    this.onKeyDown(e);
    this.onScannerKey(e);
  };

  ngOnInit(): void {
    window.addEventListener('keydown', this.manejadorTecladoGlobal);
    // NOTA: la carga inicial del catálogo la hace el effect de sucursal activa
    // en el constructor (evita disparar dos peticiones al entrar al POS).
    // Multi-terminal: refresca el catálogo cada 90s (otro cajero pudo vender).
    // Solo con red, sin cobro en curso y con la pestaña visible.
    this.refrescoTimer = setInterval(() => {
      if (this.online() && !this.procesandoVenta() && document.visibilityState === 'visible') {
        this.productoService.cargar();
      }
    }, 90_000);
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.manejadorTecladoGlobal);
    if (this.refrescoTimer) clearInterval(this.refrescoTimer);
  }

  /** Timer del refresco periódico de stock (multi-terminal). */
  private refrescoTimer: ReturnType<typeof setInterval> | null = null;

  /** Evita doble venta si se hace doble clic en Cobrar. */
  protected readonly procesandoVenta = signal(false);

  /**
   * Idempotencia del cobro: si un intento falla (timeout/red), se conserva la
   * clave junto con la "huella" del pedido. Si el cajero reintenta EXACTAMENTE
   * la misma venta, se reenvía la MISMA clave y el backend no la duplica.
   * Si cambió algo (carrito, descuento, pago), se genera una clave nueva.
   */
  private ventaPendiente: { key: string; huella: string } | null = null;

  /** Estado de la conexión: bloquea el cobro y muestra banner al caerse la red. */
  protected readonly online = signal<boolean>(navigator.onLine);

  @HostListener('window:online')
  protected alVolverConexion(): void { this.online.set(true); }

  @HostListener('window:offline')
  protected alPerderConexion(): void { this.online.set(false); }

  /** Caja abierta del cajero en la sucursal activa (gating del POS). */
  protected readonly cajaAbierta = computed(() =>
    this.cajaService.cajaAbiertaDe(this.auth.usuario()?.id ?? '', this.sucursalService.sucursalActivaId())
  );
  protected readonly hayCaja = computed(() => !!this.cajaAbierta());

  /** Sucursal activa (para mostrar su QR/nombre en el panel de cobro Yape). */
  protected readonly sucursalActiva = this.sucursalService.sucursalActiva;

  irACaja(): void { this.router.navigateByUrl('/caja'); }

  // ── Terminal y operador REALES (nada hardcodeado en pantalla ni en ticket) ──
  /** Terminal de la caja abierta (se define al abrir caja). */
  protected readonly terminal = computed(() => this.cajaAbierta()?.terminal ?? '—');

  /** Nombre del cajero logueado (badge del header + ticket impreso). */
  protected readonly operador = computed(() => {
    const u = this.auth.usuario();
    return u ? `${u.nombres} ${u.apellidos ?? ''}`.trim() : '—';
  });

  // ── Categorías (derivadas del catálogo REAL, no hardcodeadas) ───────────────
  /** Iconos para categorías conocidas; cualquier otra usa el genérico. */
  private static readonly ICONOS_CATEGORIA: Record<string, string> = {
    'Analgésicos':       'pill',
    'Antibióticos':      'medication',
    'Antiinflamatorios': 'healing',
    'Antihistamínicos':  'masks',
    'Infantil':          'child_care',
    'Cuidado Personal':  'face',
    'Inyectables':       'vaccines',
    'Vitaminas':         'nutrition',
    'Dermatológicos':    'dermatology',
    'Gastrointestinal':  'gastroenterology',
    'Respiratorio':      'pulmonology',
  };

  /** "Todos" + las categorías presentes en el catálogo de la sucursal. */
  protected readonly categorias = computed<Categoria[]>(() => [
    { id: 'Todos', label: 'Todos', icono: 'grid_view' },
    ...this.productoService.categoriasDisponibles().map((c) => ({
      id: c,
      label: c,
      icono: PosComponent.ICONOS_CATEGORIA[c] ?? 'category',
    })),
  ]);

  // ── Búsqueda ────────────────────────────────────────────────────────────────
  protected busquedaInput    = signal<string>('');
  private  busquedaDebounced = signal<string>('');
  protected categoriaActiva  = signal<string>('Todos');

  protected productosFiltrados = computed<Producto[]>(() =>
    this.productoService.buscar({
      query:     this.busquedaDebounced(),
      categoria: this.categoriaActiva(),
    })
  );

  /** True mientras el catálogo se trae del backend (para skeletons de carga). */
  protected cargandoCatalogo = this.productoService.cargando;

  /** Placeholder para repetir tarjetas-esqueleto en el template. */
  protected readonly skeletons = Array.from({ length: 8 });

  /** Mismos resultados que `productosFiltrados`, pero agrupados por principio activo. */
  protected gruposFiltrados = computed<GrupoPrincipioActivo[]>(() =>
    this.productoService.buscarAgrupado({
      query:     this.busquedaDebounced(),
      categoria: this.categoriaActiva(),
    })
  );

  /**
   * Decide si la grilla se muestra AGRUPADA por principio activo:
   *  - cuando el cajero busca algo (probable búsqueda por componente), o
   *  - cuando hay un producto agotado que tiene alternativas equivalentes.
   * En navegación normal sin agotados se usa la grilla plana de siempre.
   */
  protected vistaAgrupada = computed<boolean>(() => {
    // Vista tabla agrupada por principio activo SIEMPRE (vista insignia del POS,
    // alta densidad). Antes solo salía al buscar o con agotados; ahora es la
    // predeterminada también navegando por categoría.
    return true;
  });

  /** Solo las familias que tienen 2+ alternativas equivalentes (se muestran como sección). */
  protected gruposAlternativas = computed<GrupoPrincipioActivo[]>(() =>
    this.gruposFiltrados().filter(g => g.hayAlternativas)
  );

  /** Productos sin alternativas: se renderizan juntos en una grilla normal. */
  protected productosSueltos = computed<Producto[]>(() =>
    this.gruposFiltrados().filter(g => !g.hayAlternativas).flatMap(g => g.productos)
  );

  // ── Navegación por teclado en resultados (↑↓ + Enter, venta sin mouse) ──────
  /** Lista plana de productos en el MISMO orden visual de la tabla. */
  protected readonly listaNavegable = computed<Producto[]>(() => [
    ...this.gruposFiltrados().filter(g => g.hayAlternativas).flatMap(g => g.productos),
    ...this.productosSueltos(),
  ]);

  /** Índice de la fila resaltada (-1 = ninguna). */
  protected readonly filaActivaIdx = signal(-1);

  /** Id del producto resaltado (pinta la fila en el template). */
  protected readonly filaActivaId = computed(() => {
    const lista = this.listaNavegable();
    const i = this.filaActivaIdx();
    return i >= 0 && i < lista.length ? lista[i].id : null;
  });

  /** Producto de la fila resaltada, o null. */
  private filaActivaProducto(): Producto | null {
    const lista = this.listaNavegable();
    const i = this.filaActivaIdx();
    return i >= 0 && i < lista.length ? lista[i] : null;
  }

  /** Mueve el resaltado y lo mantiene visible dentro del scroll. */
  private moverFila(delta: number): void {
    const lista = this.listaNavegable();
    if (!lista.length) return;
    const idx = Math.min(Math.max(this.filaActivaIdx() + delta, 0), lista.length - 1);
    this.filaActivaIdx.set(idx);
    setTimeout(
      () => document.getElementById('fila-' + lista[idx].id)?.scrollIntoView({ block: 'nearest' }),
      0,
    );
  }

  /** ¿Hay algún modal abierto? (la navegación de grilla se desactiva). */
  private hayModalAbierto(): boolean {
    return !!(
      this.productoFraccionPendiente() ||
      this.productoRecetaPendiente() ||
      this.mostrarBoleta() ||
      this.mostrarNuevoCliente() ||
      this.mostrarConfirmacionVaciar()
    );
  }

  // ── Carrito ──────────────────────────────────────────────────────────────────
  protected carrito = signal<ItemCarrito[]>([]);

  // ── Descuento total (opcional, retrocompatible: 0 = sin descuento) ────
  protected descuentoTipo  = signal<'monto' | 'pct'>('monto');
  protected descuentoValor = signal<number>(0);

  /** Tope de descuento por rol (evita abusos). Admin/Super sin tope. */
  protected readonly maxDescuentoPct = computed(() => {
    if (this.auth.tieneAlgunRol('SUPER_ADMIN', 'ADMIN')) return 100;
    if (this.auth.tieneAlgunRol('FARMACEUTICO')) return 15;
    return 10; // vendedor u otros
  });

  private readonly totalBruto = computed(() =>
    this.carrito().reduce((s, it) => s + it.precioUnitario * it.cantidad, 0),
  );

  /** Monto de descuento efectivo (convierte %/S/ y aplica el tope por rol). */
  protected readonly descuentoMonto = computed(() => {
    const bruto = this.totalBruto();
    if (bruto <= 0) return 0;
    const raw = this.descuentoTipo() === 'pct'
      ? bruto * ((this.descuentoValor() || 0) / 100)
      : (this.descuentoValor() || 0);
    const tope = bruto * (this.maxDescuentoPct() / 100);
    return Math.max(0, Math.min(raw, tope));
  });

  /** True si el descuento pedido excede el tope del rol (para avisar en UI). */
  protected readonly descuentoTopeExcedido = computed(() => {
    const bruto = this.totalBruto();
    if (bruto <= 0) return false;
    const raw = this.descuentoTipo() === 'pct'
      ? bruto * ((this.descuentoValor() || 0) / 100)
      : (this.descuentoValor() || 0);
    return raw > bruto * (this.maxDescuentoPct() / 100) + 0.001;
  });

  protected totales = computed(() =>
    _calcularTotales(this.carrito(), IGV_RATE, this.descuentoMonto()),
  );

  // ── Cliente ──────────────────────────────────────────────────────────────────
  /** Sin cliente = venta a "Consumidor Final". Se llena con una búsqueda real. */
  protected cliente = signal<Cliente | null>(null);
  protected dniInput = signal<string>('');

  // ── Pago ─────────────────────────────────────────────────────────────────────
  /** Arranca con el último método usado (default EFECTIVO, el más común). */
  protected metodoPagoSeleccionado = signal<MetodoPago>(ultimoMetodoPago);

  /** Monto entregado por el cliente (solo efectivo) */
  protected montoRecibido = signal<number | null>(null);

  /** Celular o código de operación Yape/Plin (opcional, para el cuadre de caja) */
  protected referenciaYapePlin = signal<string>('');

  /**
   * Nº de operación del voucher de tarjeta (y de la transferencia).
   *
   * El sistema NO se conecta al datáfono: el cajero pasa la tarjeta en la
   * maquinita y aquí solo registra el cobro. Sin este dato, al cierre del día
   * el total de tarjeta del sistema y el del datáfono pueden no coincidir y no
   * hay forma de saber qué venta falta. Con Yape se podía rastrear por la
   * referencia; con tarjeta, no.
   */
  protected referenciaTarjeta = signal<string>('');

  /** Últimos 4 dígitos de la tarjeta (opcional): ayuda a ubicar el voucher. */
  protected ultimos4 = signal<string>('');

  /** Referencia a guardar, según el método activo. */
  private referenciaDelMetodo(metodo: MetodoPago): string | undefined {
    if (metodo === 'YAPE_PLIN') return this.referenciaYapePlin().trim() || undefined;
    if (metodo === 'TARJETA' || metodo === 'TRANSFERENCIA') {
      const op = this.referenciaTarjeta().trim();
      const fin = this.ultimos4().trim();
      if (!op && !fin) return undefined;
      // "00123456 ****4021" — un solo campo en base, legible en el ticket.
      return [op, fin ? `****${fin}` : ''].filter(Boolean).join(' ');
    }
    return undefined;
  }

  // ── Pago mixto (efectivo + tarjeta + Yape en una misma venta) ──────────
  protected pagoMixto   = signal(false);
  protected mixEfectivo = signal<number | null>(null);
  protected mixTarjeta  = signal<number | null>(null);
  protected mixYape     = signal<number | null>(null);

  protected readonly mixTotal = computed(() =>
    Math.round(((this.mixEfectivo() ?? 0) + (this.mixTarjeta() ?? 0) + (this.mixYape() ?? 0)) * 100) / 100,
  );
  protected readonly mixRestante = computed(() =>
    Math.round((this.totales().total - this.mixTotal()) * 100) / 100,
  );

  togglePagoMixto(): void {
    const activo = !this.pagoMixto();
    this.pagoMixto.set(activo);
    this.mixEfectivo.set(null);
    this.mixTarjeta.set(null);
    this.mixYape.set(null);
  }

  /** Vuelto calculado automáticamente */
  protected readonly vuelto = computed(() => {
    const recibido = this.montoRecibido();
    const total    = this.totales().total;
    if (recibido === null || recibido < total) return null;
    return Math.round((recibido - total) * 100) / 100;
  });

  // ── Preferencia: auto-imprimir al cobrar ─────────────────────────────────────
  protected readonly autoImprimir = signal<boolean>(
    localStorage.getItem(PREF_AUTO_IMPRIMIR) === '1',
  );

  toggleAutoImprimir(): void {
    const nuevo = !this.autoImprimir();
    this.autoImprimir.set(nuevo);
    localStorage.setItem(PREF_AUTO_IMPRIMIR, nuevo ? '1' : '0');
  }

  // ── Reimpresión de la última venta de la sesión ──────────────────────────────
  protected readonly hayUltimaVenta = signal<boolean>(ultimaVentaSesion !== null);

  reimprimirUltima(): void {
    if (!ultimaVentaSesion) return;
    this.comprobante.imprimir(this.comprobante.generarHTML(ultimaVentaSesion));
    this.mostrarToast(`Reimprimiendo ${ultimaVentaSesion.numeroComprobante}`, 'exito');
  }

  /** Montos rápidos de billetes para efectivo */
  protected readonly montosRapidos = computed(() => {
    const total = this.totales().total;
    const billetes = [10, 20, 50, 100, 200];
    return billetes.filter(b => b >= total).slice(0, 4);
  });

  // ── Tipo de comprobante ───────────────────────────────────────────────────────
  protected tipoComprobante = signal<TipoComprobante>('BOLETA');

  // ── UI ───────────────────────────────────────────────────────────────────────
  protected mostrarConfirmacionVaciar  = signal<boolean>(false);
  protected mostrarBoleta              = signal<boolean>(false);
  protected ventaCompletada            = signal<VentaCompletada | null>(null);
  /** Producto pendiente de confirmación de receta */
  protected productoRecetaPendiente    = signal<Producto | null>(null);
  /** Producto fraccionable pendiente de elegir presentación (caja/blíster/unidad) */
  protected productoFraccionPendiente  = signal<Producto | null>(null);
  /** Presentación a agregar tras confirmar la receta (flujo inline de la tabla) */
  private presentacionPendiente        = signal<Presentacion | null>(null);
  /** ID del item cuya cantidad se está editando inline */
  protected editandoCantidadId         = signal<string | null>(null);
  protected cantidadEditandoValor      = signal<number>(1);

  protected busquedaInputEl = viewChild<ElementRef<HTMLInputElement>>('busquedaInputEl');

  // ── Scanner ──────────────────────────────────────────────────────────────────
  private scanBuffer   = '';
  private lastKeyTime  = 0;

  constructor() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    effect(() => {
      const val = this.busquedaInput();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => this.busquedaDebounced.set(val), DEBOUNCE_MS);
    });
    // Al cambiar búsqueda o categoría, el resaltado de teclado se reinicia.
    effect(() => {
      this.busquedaDebounced();
      this.categoriaActiva();
      this.filaActivaIdx.set(-1);
    });
    // Recarga el catálogo/stock cuando cambia la sucursal activa (switch del
    // SUPER_ADMIN). Cubre también la carga inicial: cargar() sale solo si el id
    // aún está vacío, así que no hace falta llamarlo en ngOnInit.
    effect(() => {
      this.sucursalService.sucursalActivaId();
      this.productoService.cargar();
    });
  }

  // ── Carrito: acciones ────────────────────────────────────────────────────────

  agregarProducto(producto: Producto): void {
    if (this.stockBaseEn(producto) <= 0) {
      this.mostrarToast(`Sin stock: ${producto.nombre}`, 'error');
      return;
    }
    // Si requiere receta y aún no está en el carrito, pedir confirmación
    if (producto.requiereReceta && !this.carrito().some(i => i.producto.id === producto.id)) {
      this.productoRecetaPendiente.set(producto);
      return;
    }
    this.iniciarAgregado(producto);
  }

  /** Decide: producto fraccionable → abrir selector; resto → agregar directo (legacy). */
  private iniciarAgregado(producto: Producto): void {
    if (producto.presentaciones?.length) {
      this.productoFraccionPendiente.set(producto);
      return;
    }
    this.agregarLinea(producto, undefined, producto.precioVenta);
  }

  /** Llamado desde el selector de presentación (caja/blíster/unidad). */
  elegirPresentacion(pres: Presentacion): void {
    const p = this.productoFraccionPendiente();
    if (!p) return;
    this.productoFraccionPendiente.set(null);
    this.agregarLinea(p, pres, pres.precioVenta);
    // UX alta velocidad: limpiar buscador y devolver el foco para el siguiente fármaco
    this.busquedaInput.set('');
    setTimeout(() => this.busquedaInputEl()?.nativeElement.focus(), 0);
  }

  cancelarFraccion(): void {
    this.productoFraccionPendiente.set(null);
  }

  /**
   * Alta directa desde la VISTA TABLA (chips inline): agrega una presentación
   * concreta sin abrir el modal selector. Si el producto requiere receta y aún
   * no está en el carrito, primero pide la confirmación de receta (obligatoria
   * por DIGEMID) y recuerda la presentación para agregarla al confirmar.
   */
  agregarPresentacionDirecta(producto: Producto, pres: Presentacion): void {
    if (this.stockBaseEn(producto) - this.baseEnCarrito(producto.id) < pres.factor) {
      this.mostrarToast(`Stock insuficiente: ${producto.nombre}`, 'aviso');
      return;
    }
    if (producto.requiereReceta && !this.carrito().some(i => i.producto.id === producto.id)) {
      this.presentacionPendiente.set(pres);
      this.productoRecetaPendiente.set(producto);
      return;
    }
    this.agregarLinea(producto, pres, pres.precioVenta);
    // UX alta velocidad: limpiar buscador y devolver el foco para el siguiente fármaco
    this.busquedaInput.set('');
    setTimeout(() => this.busquedaInputEl()?.nativeElement.focus(), 0);
  }

  /** ¿Hay stock en la sucursal activa para una unidad más de esta presentación? */
  presDisponible(p: Producto, pres: Presentacion): boolean {
    return (this.stockBaseEn(p) - this.baseEnCarrito(p.id)) >= pres.factor;
  }

  /**
   * Agrega/incrementa una línea. La identidad de la línea es producto+presentación,
   * por lo que la misma medicina en caja y en blíster son dos líneas distintas.
   * El tope se valida SIEMPRE en unidades base contra el stock de la sucursal.
   */
  private agregarLinea(producto: Producto, presentacion: Presentacion | undefined, precioUnitario: number): void {
    const factor       = presentacion?.factor ?? this.factorVenta(producto);
    const disponibleBase = this.stockBaseEn(producto) - this.baseEnCarrito(producto.id);
    if (disponibleBase < factor) {
      this.mostrarToast(`Stock insuficiente: ${producto.nombre}`, 'aviso');
      return;
    }
    const clave = `${producto.id}::${presentacion?.id ?? 'base'}`;
    this.carrito.update((items) => {
      const existe = items.find((i) => this.lineaId(i) === clave);
      if (existe) {
        return items.map((i) =>
          this.lineaId(i) === clave ? { ...i, cantidad: i.cantidad + 1 } : i
        );
      }
      return [...items, { producto, presentacion, cantidad: 1, precioUnitario }];
    });
    this.mostrarToast(`${producto.nombre}${presentacion ? ' · ' + presentacion.nombre : ''}`, 'exito');
  }

  confirmarReceta(): void {
    const p = this.productoRecetaPendiente();
    if (!p) return;
    this.productoRecetaPendiente.set(null);
    const pres = this.presentacionPendiente();
    if (pres) {
      // Vino de la vista tabla (chip inline): agregar esa presentación directo
      this.presentacionPendiente.set(null);
      this.agregarLinea(p, pres, pres.precioVenta);
    } else {
      this.iniciarAgregado(p);
    }
  }

  cancelarReceta(): void {
    this.productoRecetaPendiente.set(null);
    this.presentacionPendiente.set(null);
  }

  incrementarItem(lineaId: string): void {
    const item = this.carrito().find((i) => this.lineaId(i) === lineaId);
    if (!item) return;
    const factor = this.factorLinea(item);
    const disponibleBase = this.stockBaseEn(item.producto) - this.baseEnCarrito(item.producto.id);
    if (disponibleBase < factor) {
      this.mostrarToast('Stock máximo alcanzado', 'aviso');
      return;
    }
    this.carrito.update((items) =>
      items.map((i) => this.lineaId(i) === lineaId ? { ...i, cantidad: i.cantidad + 1 } : i)
    );
  }

  decrementarItem(lineaId: string): void {
    this.carrito.update((items) =>
      items.map((i) => this.lineaId(i) === lineaId ? { ...i, cantidad: i.cantidad - 1 } : i)
            .filter((i) => i.cantidad > 0)
    );
  }

  eliminarItem(lineaId: string): void {
    this.carrito.update((items) => items.filter((i) => this.lineaId(i) !== lineaId));
  }

  // ── Ventas en espera (3 ranuras locales, sin backend) ───────────────────────
  protected readonly enEspera = signal<VentaEnEspera[]>([...ventasEnEsperaStore]);

  /** Guarda el carrito actual en una ranura y lo limpia para el siguiente cliente. */
  ponerEnEspera(): void {
    if (this.carrito().length === 0) {
      this.mostrarToast('El carrito está vacío', 'aviso');
      return;
    }
    if (this.enEspera().length >= MAX_EN_ESPERA) {
      this.mostrarToast(`Máximo ${MAX_EN_ESPERA} ventas en espera`, 'aviso');
      return;
    }
    ventasEnEsperaStore = [
      ...ventasEnEsperaStore,
      {
        id: Date.now(),
        items: [...this.carrito()],
        cliente: this.cliente(),
        dni: this.dniInput(),
        creadaEn: new Date(),
      },
    ];
    this.enEspera.set([...ventasEnEsperaStore]);
    this.carrito.set([]);
    this.cliente.set(null);
    this.dniInput.set('');
    this.descuentoValor.set(0);
    this.mostrarToast('Venta puesta en espera', 'exito');
    setTimeout(() => this.busquedaInputEl()?.nativeElement.focus(), 0);
  }

  /** Recupera una espera al carrito (solo si el carrito actual está vacío). */
  recuperarEspera(id: number): void {
    const v = ventasEnEsperaStore.find((x) => x.id === id);
    if (!v) return;
    if (this.carrito().length > 0) {
      this.mostrarToast('Cobra o pon en espera el carrito actual primero', 'aviso');
      return;
    }
    ventasEnEsperaStore = ventasEnEsperaStore.filter((x) => x.id !== id);
    this.enEspera.set([...ventasEnEsperaStore]);
    this.carrito.set([...v.items]);
    this.cliente.set(v.cliente);
    this.dniInput.set(v.dni);
    this.mostrarToast('Venta recuperada', 'exito');
  }

  /** Descarta una espera sin recuperarla. */
  eliminarEspera(id: number): void {
    ventasEnEsperaStore = ventasEnEsperaStore.filter((x) => x.id !== id);
    this.enEspera.set([...ventasEnEsperaStore]);
    this.mostrarToast('Venta en espera descartada', 'aviso');
  }

  /** Etiqueta corta de la ranura: cliente (o nº ítems) + total. */
  esperaLabel(v: VentaEnEspera): string {
    const total = v.items.reduce((s, it) => s + it.precioUnitario * it.cantidad, 0);
    const quien = v.cliente?.nombres ?? `${v.items.length} ítem${v.items.length > 1 ? 's' : ''}`;
    return `${quien} · S/ ${total.toFixed(2)}`;
  }

  solicitarVaciar(): void {
    if (this.carrito().length === 0) return;
    this.mostrarConfirmacionVaciar.set(true);
  }

  confirmarVaciar(): void {
    this.carrito.set([]);
    this.descuentoValor.set(0);
    this.mostrarConfirmacionVaciar.set(false);
    this.mostrarToast('Carrito vaciado', 'aviso');
  }

  cancelarVaciar(): void {
    this.mostrarConfirmacionVaciar.set(false);
  }

  // ── Acciones generales ────────────────────────────────────────────────────────

  seleccionarCategoria(categoriaId: string): void { this.categoriaActiva.set(categoriaId); }
  seleccionarMetodoPago(metodo: MetodoPago): void  { this.metodoPagoSeleccionado.set(metodo); }

  buscarCliente(): void {
    const dni = this.dniInput().trim();
    if (!dni) { this.cliente.set(null); return; }
    this.clienteService.buscarPorDocumento(dni).subscribe({
      next: (cli) => {
        this.cliente.set(cli);
        this.mostrarToast(cli ? 'Cliente identificado' : 'Cliente no encontrado', cli ? 'exito' : 'aviso');
      },
      error: () => {
        this.cliente.set(null);
        this.mostrarToast('No se pudo buscar el cliente', 'error');
      },
    });
  }

  // ── Alta rápida de cliente nuevo (en plena venta) ──────────────────────
  protected mostrarNuevoCliente = signal(false);
  protected nClienteTipo      = signal<'DNI' | 'RUC' | 'CE'>('DNI');
  protected nClienteDoc       = signal('');
  protected nClienteNombres   = signal('');
  protected nClienteApellidos = signal('');

  abrirNuevoCliente(): void {
    const doc = this.dniInput().trim();
    this.nClienteTipo.set(doc.length === 11 ? 'RUC' : 'DNI');
    this.nClienteDoc.set(doc);
    this.nClienteNombres.set('');
    this.nClienteApellidos.set('');
    this.mostrarNuevoCliente.set(true);
  }

  cancelarNuevoCliente(): void { this.mostrarNuevoCliente.set(false); }

  guardarNuevoCliente(): void {
    const doc = this.nClienteDoc().trim();
    const nombre = this.nClienteNombres().trim();
    if (!doc || !nombre) { this.mostrarToast('Documento y nombre son obligatorios', 'aviso'); return; }
    const esRuc = this.nClienteTipo() === 'RUC';
    this.clienteService.registrar({
      tipoDocumento: this.nClienteTipo(),
      numeroDocumento: doc,
      nombres: nombre,
      apellidos: esRuc ? undefined : (this.nClienteApellidos().trim() || undefined),
      razonSocial: esRuc ? nombre : undefined,
    }).subscribe({
      next: (cli) => {
        this.cliente.set(cli);
        this.dniInput.set(doc);
        this.mostrarNuevoCliente.set(false);
        this.mostrarToast('Cliente registrado', 'exito');
      },
      error: (e) => this.mostrarToast(e.message ?? 'No se pudo registrar el cliente', 'error'),
    });
  }

  procesarVenta(): void {
    if (this.procesandoVenta()) return; // ya hay una venta en curso
    if (!this.online()) {
      this.mostrarToast('Sin conexión a internet — no se puede cobrar', 'error');
      return;
    }
    const caja = this.cajaAbierta();
    if (!caja) {
      this.mostrarToast('Abre tu caja para poder vender', 'error');
      return;
    }
    if (this.carrito().length === 0) {
      this.mostrarToast('Carrito vacío', 'aviso');
      return;
    }
    const t    = this.totales();
    const c    = this.cliente();
    const tipo = this.tipoComprobante();

    // Validar: FACTURA requiere RUC
    if (tipo === 'FACTURA' && c?.tipoDocumento !== 'RUC') {
      this.mostrarToast('La factura requiere un cliente con RUC', 'error');
      return;
    }
    // Validar: efectivo debe cubrir el total
    if (this.metodoPagoSeleccionado() === 'EFECTIVO') {
      const recibido = this.montoRecibido();
      if (recibido !== null && recibido < t.total) {
        this.mostrarToast('El monto recibido es menor al total', 'error');
        return;
      }
    }

    const metodo = this.metodoPagoSeleccionado();
    const venta: VentaCompletada = {
      // El número real lo emite el backend; se reemplaza al confirmar la venta.
      numeroComprobante: '',
      tipoComprobante:   tipo,
      fechaHora:         new Date(),
      items:             [...this.carrito()],
      subtotal:          t.subtotal,
      igv:               t.igv,
      descuento:         t.descuento,
      total:             t.total,
      metodoPago:        metodo,
      // Referencia del cobro (Yape, voucher de tarjeta o nº de transferencia):
      // es lo que permite cuadrar contra el datáfono o el app al cierre del día.
      referenciaPago:    this.referenciaDelMetodo(metodo),
      cliente:           c,
      cajero:            this.operador(),
      terminal:          this.terminal(),
    };

    // Registrar la venta REAL en el backend: TX atómica que descuenta stock
    // (FEFO), genera el comprobante y la asocia a la caja abierta.
    const sid = this.sucursalService.sucursalActivaId();
    const itemsBackend = this.carrito().map((it) => ({
      productoId: it.producto.id,
      presentacionId: it.presentacion?.id,
      cantidad: it.cantidad,
    }));
    // Pago mixto: arma los pagos y valida que sumen el total exacto.
    let pagosMix: { metodo: string; monto: number; referencia?: string }[] | undefined;
    if (this.pagoMixto()) {
      pagosMix = [];
      if ((this.mixEfectivo() ?? 0) > 0) pagosMix.push({ metodo: 'EFECTIVO', monto: this.mixEfectivo()! });
      // Cada pata del mixto lleva SU propia referencia: el voucher de la tarjeta
      // y el código de Yape son documentos distintos y se cuadran por separado.
      if ((this.mixTarjeta() ?? 0) > 0)
        pagosMix.push({
          metodo: 'TARJETA',
          monto: this.mixTarjeta()!,
          referencia: this.referenciaDelMetodo('TARJETA'),
        });
      if ((this.mixYape() ?? 0) > 0)
        pagosMix.push({
          metodo: 'YAPE_PLIN',
          monto: this.mixYape()!,
          referencia: this.referenciaDelMetodo('YAPE_PLIN'),
        });
      const suma = pagosMix.reduce((s, p) => s + p.monto, 0);
      if (pagosMix.length === 0 || Math.abs(suma - t.total) > 0.01) {
        this.mostrarToast(`El pago mixto debe sumar exacto S/ ${t.total.toFixed(2)}`, 'error');
        return;
      }
      venta.metodoPago = 'MIXTO';
    }

    // ── Idempotencia: misma venta reintentada = misma clave ──────────────
    const solicitud = {
      sucursalId: sid,
      cajaSesionId: caja.id,
      clienteId: c?.id,
      tipoComprobante: tipo,
      items: itemsBackend,
      metodoPago: metodo,
      total: t.total,
      descuento: t.descuento,
      referencia: venta.referenciaPago,
      pagos: pagosMix,
    };
    const huella = JSON.stringify(solicitud);
    const idempotencyKey =
      this.ventaPendiente?.huella === huella
        ? this.ventaPendiente.key
        : crypto.randomUUID();
    this.ventaPendiente = { key: idempotencyKey, huella };

    this.procesandoVenta.set(true);
    this.ventaService
      .registrarPOS({ ...solicitud, idempotencyKey })
      .subscribe({
        next: (resp) => {
          this.procesandoVenta.set(false);
          // Cobro confirmado: la clave de idempotencia ya cumplió su ciclo.
          this.ventaPendiente = null;
          // Recuerda el método para la siguiente venta de la sesión.
          ultimoMetodoPago = metodo;

          // ── La boleta se construye desde la RESPUESTA del backend ──────
          // (fuente legal): número, fecha, totales e IGV del servidor.
          // Los nombres de producto/presentación se cruzan con el carrito.
          const porLinea = new Map(
            venta.items.map((it) => [`${it.producto.id}::${it.presentacion?.id ?? 'base'}`, it]),
          );
          venta.numeroComprobante = resp.numeroComprobante;
          venta.fechaHora = new Date(resp.fecha);
          venta.subtotal  = Number(resp.subtotal);
          venta.igv       = Number(resp.igv);
          venta.descuento = Number(resp.descuento ?? venta.descuento);
          venta.total     = Number(resp.total);
          venta.items     = resp.items.map((ri) => {
            const local =
              porLinea.get(`${ri.productoId}::${ri.presentacionId ?? 'base'}`) ??
              venta.items.find((it) => it.producto.id === ri.productoId);
            return {
              producto:       local?.producto ?? ({ id: ri.productoId, nombre: ri.producto?.nombre ?? 'Producto' } as ItemCarrito['producto']),
              presentacion:   local?.presentacion,
              cantidad:       ri.cantidad,
              precioUnitario: Number(ri.precioUnitario),
            };
          });
          venta.pagos = resp.pagos.map((p) => ({
            label: this.comprobante.labelMetodo(p.metodo as MetodoPago),
            monto: Number(p.monto),
            referencia: p.referencia ?? undefined,
          }));
          // Vuelto contra el TOTAL REAL (efectivo simple, si se digitó el recibido).
          const recibido = !this.pagoMixto() && metodo === 'EFECTIVO' ? this.montoRecibido() : null;
          if (recibido !== null && recibido >= venta.total) {
            venta.recibido = recibido;
            venta.vuelto = Math.round((recibido - venta.total) * 100) / 100;
          }
          // Aviso si el servidor recalculó distinto (precio cambiado en BD).
          if (Math.abs(venta.total - t.total) > 0.005) {
            this.mostrarToast('Montos recalculados por el servidor (precio actualizado)', 'aviso');
          }
          // Guarda para "reimprimir última" y respeta la preferencia de impresión.
          ultimaVentaSesion = venta;
          this.hayUltimaVenta.set(true);
          this.ventaCompletada.set(venta);
          this.mostrarBoleta.set(true);
          if (this.autoImprimir()) {
            this.comprobante.imprimir(this.comprobante.generarHTML(venta));
          }
          this.carrito.set([]);
          this.descuentoValor.set(0);
          this.montoRecibido.set(null);
          this.referenciaYapePlin.set('');
          this.referenciaTarjeta.set('');
          this.ultimos4.set('');
          this.pagoMixto.set(false);
          this.mixEfectivo.set(null);
          this.mixTarjeta.set(null);
          this.mixYape.set(null);
          // Refresca SOLO el stock de los productos vendidos (no todo el catálogo).
          this.productoService.refrescarStock([...new Set(resp.items.map((i) => i.productoId))]);
          this.cajaService.registrarVenta(caja.id, {
            comprobante: resp.numeroComprobante,
            metodo,
            total: t.total,
          });
          setTimeout(() => this.busquedaInputEl()?.nativeElement.focus(), 0);
        },
        error: (e) => {
          this.procesandoVenta.set(false);
          // Timeout o red caída: la venta PUDO haberse registrado en el
          // servidor sin que llegara la respuesta. La clave de idempotencia
          // se conserva: reintentar con COBRAR es seguro (no se duplica).
          const esTimeout = e?.name === 'TimeoutError';
          const esRed = e?.status === 0 || !navigator.onLine;
          if (esTimeout || esRed) {
            this.toastService.error(
              'Sin respuesta del servidor. Revisa la conexión y vuelve a presionar COBRAR: la venta NO se duplicará.',
            );
          } else {
            this.toastService.error(e.message ?? 'No se pudo registrar la venta');
          }
        },
      });
  }

  // ── Edición de cantidad inline ─────────────────────────────────────────────
  iniciarEditarCantidad(item: ItemCarrito): void {
    this.editandoCantidadId.set(this.lineaId(item));
    this.cantidadEditandoValor.set(item.cantidad);
  }

  confirmarCantidad(lineaId: string): void {
    const nueva = this.cantidadEditandoValor();
    if (nueva <= 0) {
      this.eliminarItem(lineaId);
    } else {
      const item = this.carrito().find(i => this.lineaId(i) === lineaId);
      let val = nueva;
      if (item) {
        const factor = this.factorLinea(item);
        // Base disponible para esta línea = stock − lo comprometido por las OTRAS líneas
        const otrasBase = this.baseEnCarrito(item.producto.id) - item.cantidad * factor;
        const maxEsta   = Math.floor((this.stockBaseEn(item.producto) - otrasBase) / factor);
        val = Math.min(nueva, Math.max(0, maxEsta));
      }
      this.carrito.update(items =>
        items.map(i => this.lineaId(i) === lineaId ? { ...i, cantidad: val } : i)
      );
    }
    this.editandoCantidadId.set(null);
  }

  cancelarEditarCantidad(): void { this.editandoCantidadId.set(null); }

  cerrarBoleta(): void {
    this.mostrarBoleta.set(false);
    this.ventaCompletada.set(null);
    // Reenfoca el buscador para la siguiente venta
    setTimeout(() => this.busquedaInputEl()?.nativeElement.focus(), 100);
  }

  imprimirBoleta(): void {
    const v = this.ventaCompletada();
    if (!v) return;
    // Iframe oculto: sin popups que el navegador pueda bloquear.
    this.comprobante.imprimir(this.comprobante.generarHTML(v));
  }

  // ── Scanner: lógica ───────────────────────────────────────────────────────────

  /** Llamado desde el template cuando el usuario presiona Enter en el buscador */
  onEnterBuscador(): void {
    // 1) Fila resaltada con ↑↓ → agrega esa (venta 100% por teclado).
    const activa = this.filaActivaProducto();
    if (activa) {
      this.agregarProducto(activa);
      return;
    }
    const q = this.busquedaInput().trim();
    if (!q) return;
    // 2) Match exacto por código (pistola scanner escribiendo en el input).
    const exacto = this.productoService.porCodigo(q);
    if (exacto) {
      this.agregarProducto(exacto);
      this.busquedaInput.set('');
      // Selecciona el texto del input para facilitar el siguiente escaneo
      setTimeout(() => this.busquedaInputEl()?.nativeElement.select(), 50);
    }
    // Si no hay match exacto, la búsqueda normal ya muestra resultados en el grid
  }

  // ── Atajos de teclado ─────────────────────────────────────────────────────────

  protected onKeyDown(event: KeyboardEvent): void {
    // ── ↑↓ navegan la grilla de resultados (venta sin mouse). Solo cuando
    // no hay modal abierto y el foco está en el buscador o fuera de inputs
    // (los inputs numéricos usan ↑↓ para cambiar su valor: no interferir).
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const target = event.target as HTMLElement | null;
      const enBuscador = target === this.busquedaInputEl()?.nativeElement;
      const enOtroInput =
        !enBuscador &&
        (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT');
      if (!this.hayModalAbierto() && !enOtroInput) {
        event.preventDefault();
        this.moverFila(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
    }
    // Enter fuera de inputs: agrega la fila resaltada (si el scanner no está
    // a mitad de una lectura).
    if (event.key === 'Enter') {
      const target = event.target as HTMLElement | null;
      const enInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (!enInput && !this.hayModalAbierto() && this.scanBuffer.length === 0) {
        const activa = this.filaActivaProducto();
        if (activa) {
          event.preventDefault();
          this.agregarProducto(activa);
          return;
        }
      }
    }

    // ── Modal "Elegir presentación" abierto: navegación 100% por teclado ──
    const frac = this.productoFraccionPendiente();
    if (frac) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.cancelarFraccion();
        return;
      }
      const idx = ['1', '2', '3'].indexOf(event.key);
      if (idx >= 0) {
        event.preventDefault();
        const pres = frac.presentaciones?.[idx];
        if (pres) this.elegirPresentacion(pres);
        return;
      }
    }

    switch (event.key) {
      case 'F1':
        event.preventDefault();
        this.busquedaInputEl()?.nativeElement.focus();
        break;
      case 'F5':
        event.preventDefault();
        this.seleccionarMetodoPago('TARJETA');
        break;
      case 'F6':
        event.preventDefault();
        this.seleccionarMetodoPago('EFECTIVO');
        break;
      case 'F7':
        event.preventDefault();
        this.seleccionarMetodoPago('YAPE_PLIN');
        break;
      case 'F12':
        event.preventDefault();
        this.procesarVenta();
        break;
      case 'Escape':
        if (this.productoRecetaPendiente()) {
          this.cancelarReceta();
        } else if (this.mostrarBoleta()) {
          this.cerrarBoleta();
        } else if (this.mostrarConfirmacionVaciar()) {
          this.cancelarVaciar();
        } else if (this.busquedaInput()) {
          this.busquedaInput.set('');
        }
        break;
    }
  }

  /**
   * Listener global para capturar input de pistola scanner.
   * Un scanner envía caracteres a < 40ms de intervalo; el teclado humano es más lento.
   * Si el foco está en un input, no interferimos (el scanner escribe ahí directamente).
   * (keydown, no keypress: keypress está deprecado y algunos scanners no lo emiten.)
   */
  protected onScannerKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const target   = event.target as HTMLElement;
    const enInput  = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    if (enInput) return; // El scanner está escribiendo en el input; no interferir
    if (this.productoFraccionPendiente()) return; // Modal abierto: los dígitos son atajos, no scanner

    const now      = Date.now();
    const timeDiff = now - this.lastKeyTime;
    this.lastKeyTime = now;

    // Si hubo más de 300ms desde la última tecla, reiniciamos el buffer
    if (timeDiff > 300 && this.scanBuffer) this.scanBuffer = '';

    if (event.key === 'Enter') {
      if (this.scanBuffer.length >= 4) {
        this.procesarCodigoEscaneado(this.scanBuffer.trim());
      }
      this.scanBuffer = '';
    } else if (event.key.length === 1) {
      this.scanBuffer += event.key;
    }
  }

  private procesarCodigoEscaneado(codigo: string): void {
    const producto = this.productoService.porCodigo(codigo);
    if (producto) {
      this.agregarProducto(producto);
    } else {
      this.mostrarToast(`Código no encontrado: ${codigo}`, 'error');
    }
  }

  // ── Helpers de plantilla ─────────────────────────────────────────────────────

  /** Factor de la presentación de venta por defecto (caja). 1 si no es fraccionable. */
  private factorVenta(p: Producto): number { return _factorVenta(p); }

  /** Factor (unidades base) de una línea concreta del carrito. */
  private factorLinea(item: ItemCarrito): number { return _factorLinea(item); }

  /** Clave estable de línea: producto + presentación. Caja y blíster = líneas distintas. */
  lineaId(item: ItemCarrito): string { return _lineaId(item); }

  /** Stock VENDIBLE de la sucursal activa en UNIDADES BASE (excluye lotes vencidos). */
  private stockBaseEn(p: Producto): number {
    return this.stockService.stockVendibleEn(p.id, this.sucursalService.sucursalActivaId());
  }

  /** Días para vencer del lote que se despacharía (FEFO), o null si no aplica. */
  diasVenceLote(p: Producto): number | null {
    const l = this.stockService.loteDespacho(p.id, this.sucursalService.sucursalActivaId());
    return l ? this.stockService.diasParaVencer(l.vencimiento) : null;
  }

  /** Fecha de vencimiento legible (dd/mm/yyyy) del lote que se despacharía (FEFO). */
  fechaVenceLote(p: Producto): string | null {
    const l = this.stockService.loteDespacho(p.id, this.sucursalService.sucursalActivaId());
    if (!l) return null;
    const [y, m, d] = l.vencimiento.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  /** Unidades base vencidas (bloqueadas) de este producto en la sucursal activa. */
  unidadesVencidas(p: Producto): number {
    return this.stockService.lotesVencidosEn(p.id, this.sucursalService.sucursalActivaId())
      .reduce((s, l) => s + l.cantidadBase, 0);
  }

  /** Unidades base ya comprometidas en el carrito para un producto (todas sus líneas). */
  private baseEnCarrito(productoId: string): number {
    return _baseEnCarrito(this.carrito(), productoId);
  }

  /**
   * Stock disponible en la unidad de venta legacy (cajas/frascos/unidades),
   * para el BADGE de la tarjeta. Para fraccionables convierte base → cajas.
   */
  stockDisponible(p: Producto): number {
    return Math.floor(this.stockBaseEn(p) / this.factorVenta(p));
  }

  /**
   * ¿El producto se puede vender? Basta con que haya UNA unidad base vendible
   * (lotes vigentes). No se exige un paquete completo de la presentación por
   * defecto: el selector de presentación permite vender la unidad más pequeña.
   */
  hayStock(p: Producto): boolean {
    return this.stockBaseEn(p) > 0;
  }

  /** Color del badge según el stock REAL (unidades base) vs el mínimo. */
  stockBadgeColor(p: Producto): string {
    const base = this.stockBaseEn(p);
    if (base <= 0) return 'bg-slate-400';
    const min = this.stockService.stockMinimoEn(p.id, this.sucursalService.sucursalActivaId());
    if (min > 0 && base <= min) return 'bg-accent-red';
    if (min > 0 && base <= min * 2) return 'bg-accent-orange';
    return 'bg-emerald-500';
  }

  /**
   * Punto de color del stock (vista tabla). El ROJO queda reservado para
   * vencimientos y receta; stock bajo se señala en ÁMBAR.
   */
  stockDotClass(p: Producto): string {
    const base = this.stockBaseEn(p);
    if (base <= 0) return 'bg-slate-300';
    const min = this.stockService.stockMinimoEn(p.id, this.sucursalService.sucursalActivaId());
    if (min > 0 && base <= min) return 'bg-amber-500';
    return 'bg-emerald-500';
  }

  /** Color del texto del stock (acompaña al punto). */
  stockTextClass(p: Producto): string {
    const base = this.stockBaseEn(p);
    if (base <= 0) return 'text-slate-400';
    const min = this.stockService.stockMinimoEn(p.id, this.sucursalService.sucursalActivaId());
    if (min > 0 && base <= min) return 'text-amber-600';
    return 'text-text-main';
  }

  /**
   * Ahorro del genérico más barato vs el de marca más barato del grupo
   * (solo si ambos existen y hay ahorro real). El argumento que el
   * farmacéutico repite 50 veces al día, ahora en pantalla.
   */
  ahorroGenerico(g: GrupoPrincipioActivo): number | null {
    const genericos = g.productos.filter((p) => p.esGenerico);
    const marcas    = g.productos.filter((p) => !p.esGenerico);
    if (!genericos.length || !marcas.length) return null;
    const minGen   = Math.min(...genericos.map((p) => this.precioBaseDesde(p)));
    const minMarca = Math.min(...marcas.map((p) => this.precioBaseDesde(p)));
    const ahorro = Math.round((minMarca - minGen) * 100) / 100;
    return ahorro > 0 ? ahorro : null;
  }

  /** Etiqueta del stock en UNIDADES reales vendibles (igual que Inventario). */
  stockLabel(p: Producto): string {
    const base = this.stockBaseEn(p);
    if (base <= 0) return 'Sin stock';
    return `${base} und.`;
  }

  /** Texto del badge genérico/marca. */
  tipoLabel(p: Producto): string {
    return p.esGenerico ? 'Genérico' : 'De Marca';
  }

  /** Clases del badge genérico (verde suave) vs marca (morado premium). */
  tipoBadgeClass(p: Producto): string {
    return p.esGenerico
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : 'bg-violet-50 text-violet-700 border border-violet-200';
  }

  /** True si el grupo tiene al menos un producto con stock en la sucursal activa. */
  grupoConStock(g: GrupoPrincipioActivo): boolean {
    return g.productos.some(p => this.stockBaseEn(p) > 0);
  }

  /** Precio más bajo del producto (para el "Desde S/." de la fila). */
  precioBaseDesde(p: Producto): number { return _precioBaseDesde(p); }

  /** Etiqueta corta de presentación para los chips de la tabla (Caja/Blís/Uni). */
  chipPresentacion(pres: Presentacion): string { return _chipPresentacion(pres); }

  esMetodoActivo(m: MetodoPago): boolean { return this.metodoPagoSeleccionado() === m; }

  labelMetodo(m: MetodoPago): string { return this.comprobante.labelMetodo(m); }

  onImgError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  formatFechaHora(d: Date): string { return this.comprobante.formatFechaHora(d); }

  /** Datos reales del negocio (Configuración) para el preview de la boleta. */
  negocioInfo() { return this.comprobante.negocio(); }

  // ── Privados ──────────────────────────────────────────────────────────────────

  /**
   * Helper interno de notificaciones. Delega en el ToastService global
   * (renderizado por <app-toast> en el MainLayout). Se mantiene este wrapper
   * para no tocar las ~12 llamadas existentes en el componente.
   */
  private mostrarToast(mensaje: string, tipo: 'exito' | 'error' | 'aviso'): void {
    this.toastService[tipo](mensaje);
  }
}
