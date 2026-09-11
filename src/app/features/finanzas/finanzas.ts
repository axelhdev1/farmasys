import {
  Component, computed, inject, signal, OnInit, AfterViewInit, OnDestroy,
  viewChild, ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import ApexCharts from 'apexcharts';
import {
  FinanzasService, EstadoResultados, FlujoCaja, MetodoPagoRow, CategoriaRow,
  VentaDiaRow, GastoRow, CategoriaGasto, RangoFinanzas, TopProductoRow,
  IgvPeriodo, MargenCategoriaRow, TopUtilidadRow, DiasInventario,
  GastoRecurrente, PendientesRecurrentes,
} from '../../core/services/finanzas.service';
import { SucursalService } from '../../core/services/sucursal.service';
import { ToastService } from '../../core/services/toast.service';

type Periodo = 'hoy' | 'semana' | 'mes' | 'anio';

const COLOR = {
  primary: '#0055FF', emerald: '#10B981', violet: '#8B5CF6',
  amber: '#F59E0B', red: '#EF4444', sky: '#38BDF8', slate: '#94A3B8',
};

const PALETA = [COLOR.primary, COLOR.violet, COLOR.emerald, COLOR.amber, COLOR.sky, COLOR.red, COLOR.slate];

@Component({
  selector: 'app-finanzas',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './finanzas.html',
  styleUrl: './finanzas.scss',
})
export class FinanzasComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly fin       = inject(FinanzasService);
  private readonly sucursal  = inject(SucursalService);
  private readonly toast     = inject(ToastService);

  // ── Contenedores de gráficos ──────────────────────────────────────────
  private readonly elVentas    = viewChild<ElementRef<HTMLElement>>('chartVentas');
  private readonly elMetodos   = viewChild<ElementRef<HTMLElement>>('chartMetodos');
  private readonly elCategorias = viewChild<ElementRef<HTMLElement>>('chartCategorias');
  private readonly elGastos    = viewChild<ElementRef<HTMLElement>>('chartGastos');
  private chartVentas?: ApexCharts;
  private chartMetodos?: ApexCharts;
  private chartCategorias?: ApexCharts;
  private chartGastos?: ApexCharts;
  private viewReady = false;

  // ── Estado ────────────────────────────────────────────────────────────
  protected readonly periodo  = signal<Periodo>('mes');
  protected readonly cargando = signal(false);

  protected readonly pyl         = signal<EstadoResultados | null>(null);
  protected readonly pylAnterior = signal<EstadoResultados | null>(null);
  protected readonly flujo       = signal<FlujoCaja | null>(null);
  protected readonly metodos     = signal<MetodoPagoRow[]>([]);
  protected readonly categorias  = signal<CategoriaRow[]>([]);
  protected readonly ventasDia   = signal<VentaDiaRow[]>([]);
  protected readonly gastos      = signal<GastoRow[]>([]);
  protected readonly topProductos = signal<TopProductoRow[]>([]);
  /** E8: mismo período del año pasado (estacionalidad). */
  protected readonly pylAnioAnterior = signal<EstadoResultados | null>(null);
  protected readonly igv          = signal<IgvPeriodo | null>(null);
  protected readonly margenCats   = signal<MargenCategoriaRow[]>([]);
  protected readonly topUtilidad  = signal<TopUtilidadRow[]>([]);
  protected readonly inventario   = signal<DiasInventario | null>(null);

  /** E10: la tabla de rentabilidad se ve por venta o por utilidad. */
  protected readonly vistaRanking = signal<'venta' | 'utilidad'>('utilidad');

  // ── Modal de gasto ────────────────────────────────────────────────────
  protected readonly mostrarGasto  = signal(false);
  protected readonly guardandoGasto = signal(false);
  protected fCategoria   = signal<CategoriaGasto>('SERVICIOS');
  protected fDescripcion = signal('');
  protected fMonto       = signal<number | null>(null);
  /** Fecha real del gasto (yyyy-mm-dd). Por defecto hoy, editable hacia atrás. */
  protected fFecha       = signal('');

  // ── Confirmación de borrado ───────────────────────────────────────────
  protected readonly gastoAEliminar  = signal<GastoRow | null>(null);
  protected readonly eliminandoGasto = signal(false);

  /** Gasto que se está corrigiendo (null = el modal crea uno nuevo). */
  protected readonly gastoEditando = signal<GastoRow | null>(null);

  // ── Gastos fijos mensuales ────────────────────────────────────────────
  protected readonly recurrentes  = signal<GastoRecurrente[]>([]);
  protected readonly pendientes   = signal<PendientesRecurrentes | null>(null);
  protected readonly aplicando    = signal(false);
  protected readonly mostrarFijos = signal(false);
  protected readonly guardandoFijo = signal(false);
  protected readonly fijoEditando = signal<GastoRecurrente | null>(null);
  protected rCategoria   = signal<CategoriaGasto>('ALQUILER');
  protected rDescripcion = signal('');
  protected rMonto       = signal<number | null>(null);
  protected rDia         = signal(1);

  /** Cuántos meses de gastos fijos están sin registrar. */
  protected readonly hayPendientes = computed(
    () => (this.pendientes()?.pendientes.length ?? 0) > 0,
  );

  /**
   * MERCADERIA no está: la compra de stock entra por Compras y sale como costo
   * de ventas. Cargarla también como gasto la descuenta dos veces de la
   * utilidad. El backend además la rechaza.
   */
  protected readonly categoriasGasto: CategoriaGasto[] = [
    'ALQUILER', 'SUELDOS', 'SERVICIOS', 'MARKETING',
    'MANTENIMIENTO', 'IMPUESTOS', 'TRANSPORTE', 'OTROS',
  ];

  /** Filas antiguas mal cargadas como MERCADERIA (doble conteo vivo). */
  protected readonly dobleConteo = computed(() => this.num(this.pyl()?.gastosMercaderia));

  protected readonly labelPeriodo = computed(() => (
    { hoy: 'Hoy', semana: 'Últimos 7 días', mes: 'Este mes', anio: 'Este año' }[this.periodo()]
  ));

  /** Meta de venta de la sucursal vs lo vendido (solo tiene sentido por mes). */
  protected readonly metaInfo = computed(() => {
    const sid = this.sucursal.sucursalActivaId();
    const suc = this.sucursal.sucursales().find((s) => s.id === sid);
    const meta = suc?.metaVentaMensual ?? 0;
    const venta = Number(this.pyl()?.ventasTotales ?? 0);
    const pct = meta > 0 ? Math.min(Math.round((venta / meta) * 100), 100) : 0;
    return { meta, venta, pct, hay: meta > 0 && this.periodo() === 'mes' };
  });

  /** Variación % vs período anterior (null si no hay base de comparación). */
  private delta(actual: number, anterior: number): number | null {
    if (anterior <= 0) return actual > 0 ? 100 : null;
    return ((actual - anterior) / anterior) * 100;
  }
  protected readonly crecimientoVentas = computed(() =>
    this.delta(Number(this.pyl()?.ventasTotales ?? 0), Number(this.pylAnterior()?.ventasTotales ?? 0)),
  );
  protected readonly crecimientoUtilidad = computed(() =>
    this.delta(Number(this.pyl()?.utilidadNeta ?? 0), Number(this.pylAnterior()?.utilidadNeta ?? 0)),
  );

  /**
   * E8 · Deltas de cada línea del P&L contra el período anterior y contra el
   * mismo período del año pasado. Lo segundo importa en una botica: enero no
   * se parece a diciembre, pero sí al enero anterior.
   */
  private deltaDe(campo: keyof EstadoResultados, base: EstadoResultados | null): number | null {
    const p = this.pyl();
    if (!p || !base) return null;
    return this.delta(Number(p[campo] ?? 0), Number(base[campo] ?? 0));
  }
  protected deltaPeriodo(campo: keyof EstadoResultados): number | null {
    return this.deltaDe(campo, this.pylAnterior());
  }
  protected deltaAnio(campo: keyof EstadoResultados): number | null {
    return this.deltaDe(campo, this.pylAnioAnterior());
  }

  /**
   * E9 · Cuánto hay que vender POR DÍA para no perder plata.
   *
   *   costos fijos del período ÷ margen bruto ÷ días del período
   *
   * Los costos fijos incluyen las mermas: si se vence mercadería todos los
   * meses, es un costo real del negocio y hay que venderlo igual.
   */
  protected readonly equilibrioDiario = computed(() => {
    const p = this.pyl();
    if (!p) return null;
    const margen = Number(p.margenBruto) / 100;
    if (margen <= 0) return null;

    const costosFijos = Number(p.gastos) + Number(p.perdidaMermas ?? 0);
    // Sin costos fijos no existe punto de equilibrio: cualquier venta ya deja
    // ganancia. Devolver 0 mostraba "S/ 0.00/día · vas S/ 1,715 por encima",
    // que suena a que el negocio va sobrado cuando en realidad falta cargar
    // los gastos. Es más honesto no dar la cifra y decir por qué.
    if (costosFijos <= 0) return null;
    const dias = this.diasDelPeriodo();
    const ventaNecesariaTotal = costosFijos / margen;
    const porDia = ventaNecesariaTotal / dias;

    // Promedio diario REAL del período, para comparar contra el objetivo.
    const promedioReal = Number(p.ventasNetas) / dias;

    return {
      porDia,
      total: ventaNecesariaTotal,
      promedioReal,
      cubierto: promedioReal >= porDia,
      // Cuánto falta (o sobra) por día.
      brecha: promedioReal - porDia,
      dias,
    };
  });

  /** Días que abarca el período seleccionado (mínimo 1). */
  private diasDelPeriodo(): number {
    const hoy = new Date();
    const y = hoy.getFullYear(), m = hoy.getMonth(), d = hoy.getDate();
    switch (this.periodo()) {
      case 'hoy':    return 1;
      case 'semana': return 7;
      // Días TRANSCURRIDOS del mes/año, no los totales: comparar contra un mes
      // completo el día 3 daría un objetivo diario absurdamente bajo.
      case 'mes':    return d;
      case 'anio':   return Math.max(1, Math.ceil((hoy.getTime() - new Date(y, 0, 1).getTime()) / 86_400_000));
    }
    return 1;
  }

  /** E10 · Ranking según el toggle: por facturación o por utilidad. */
  protected readonly rankingProductos = computed(() => {
    if (this.vistaRanking() === 'utilidad') {
      return this.topUtilidad().slice(0, 10).map((p) => ({
        nombre: p.nombre,
        codigo: p.codigo,
        unidades: p.unidades,
        principal: Number(p.utilidad),
        secundario: Number(p.ingreso),
        margenPct: Number(p.margenPct),
      }));
    }
    return this.topProductos().slice(0, 10).map((p) => ({
      nombre: p.producto?.nombre ?? '—',
      codigo: p.producto?.codigo ?? '—',
      unidades: p.unidades,
      principal: Number(p.vendido),
      secundario: 0,
      margenPct: null as number | null,
    }));
  });

  /** E11 · Categorías con más de 60 días de stock. */
  protected readonly capitalDormido = computed(() =>
    (this.inventario()?.categorias ?? []).filter((c) => c.capitalDormido),
  );

  /**
   * Delta anual de ventas, ya resuelto a texto.
   *
   * Se precalcula aquí en vez de usar `@if (deltaAnio(...); as d)` en la
   * plantilla: con `as`, un crecimiento de exactamente 0 % es falsy y la línea
   * desaparecía justo cuando el dato es interesante ("vendiste igual que el año
   * pasado").
   */
  protected readonly deltaAnioVentas = computed(() => {
    const d = this.deltaAnio('ventasTotales');
    if (d === null) return null;
    return {
      valor: d,
      positivo: d >= 0,
      texto: `${d >= 0 ? '+' : ''}${d.toFixed(1)}% vs. mismo período del año pasado`,
    };
  });

  /** Margen de una fila del ranking ('' cuando no aplica). */
  protected margenTexto(m: number | null): string {
    return m === null ? '' : ` · margen ${m.toFixed(0)}%`;
  }

  /** Gastos agrupados por categoría (para el donut). */
  protected readonly gastosPorCategoria = computed(() => {
    const mapa = new Map<string, number>();
    for (const g of this.gastos()) {
      mapa.set(g.categoria, (mapa.get(g.categoria) ?? 0) + Number(g.monto));
    }
    return Array.from(mapa.entries())
      .map(([categoria, monto]) => ({ categoria, monto }))
      .sort((a, b) => b.monto - a.monto);
  });

  // `puntoEquilibrio` vivía aquí: lo reemplazó `equilibrioDiario`, que además
  // incluye las mermas y lo divide por día. Nadie lo usaba en la plantilla.

  ngOnInit(): void { this.cargar(); this.cargarFijos(); }
  ngAfterViewInit(): void { this.viewReady = true; this.renderCharts(); }
  ngOnDestroy(): void {
    this.chartVentas?.destroy();
    this.chartMetodos?.destroy();
    this.chartCategorias?.destroy();
    this.chartGastos?.destroy();
  }

  // ── Rango de fechas del período (horario Perú) ────────────────────────
  private iso(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  private rango(): RangoFinanzas {
    const hoy = new Date();
    const y = hoy.getFullYear(), m = hoy.getMonth(), d = hoy.getDate();
    let inicio: Date;
    switch (this.periodo()) {
      case 'hoy':    inicio = new Date(y, m, d); break;
      case 'semana': inicio = new Date(y, m, d - 6); break;
      case 'mes':    inicio = new Date(y, m, 1); break;
      case 'anio':   inicio = new Date(y, 0, 1); break;
    }
    return {
      desde: `${this.iso(inicio)}T00:00:00-05:00`,
      hasta: `${this.iso(hoy)}T23:59:59-05:00`,
    };
  }

  /**
   * Rango equivalente del período ANTERIOR, con los MISMOS días transcurridos.
   *
   * Antes comparaba el mes en curso contra el mes anterior COMPLETO: el día 3
   * de septiembre enfrentaba 3 días de venta contra los 31 de agosto y la
   * tarjeta anunciaba "−85 %" en rojo, como si el negocio se hubiera hundido.
   * Lo mismo en "Año": enero contra los 12 meses del año pasado.
   *
   * Ahora se recorta al mismo número de días: 1–3 de septiembre contra
   * 1–3 de agosto. Es la única comparación que significa algo.
   */
  private rangoAnterior(): RangoFinanzas {
    const hoy = new Date();
    const y = hoy.getFullYear(), m = hoy.getMonth(), d = hoy.getDate();
    let ini: Date, fin: Date;
    switch (this.periodo()) {
      case 'hoy':    ini = new Date(y, m, d - 1); fin = new Date(y, m, d - 1); break;
      case 'semana': ini = new Date(y, m, d - 13); fin = new Date(y, m, d - 7); break;
      case 'mes':
        ini = new Date(y, m - 1, 1);
        // Mismo día del mes anterior; si no existe (31 → febrero), su último día.
        fin = new Date(y, m - 1, d);
        if (fin.getMonth() !== ((m - 1) + 12) % 12) fin = new Date(y, m, 0);
        break;
      case 'anio':
        ini = new Date(y - 1, 0, 1);
        fin = new Date(y - 1, m, d);
        break;
    }
    return {
      desde: `${this.iso(ini)}T00:00:00-05:00`,
      hasta: `${this.iso(fin)}T23:59:59-05:00`,
    };
  }

  /**
   * E8 · Mismo rango, un año atrás. Compara contra la estacionalidad real del
   * negocio en lugar del mes anterior, que en una botica puede no parecerse.
   */
  private rangoAnioAnterior(): RangoFinanzas {
    const r = this.rango();
    const retroceder = (iso?: string): string | undefined => {
      if (!iso) return undefined;
      const d = new Date(iso);
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString();
    };
    return { desde: retroceder(r.desde), hasta: retroceder(r.hasta) };
  }

  // ── Carga de datos ────────────────────────────────────────────────────
  cargar(): void {
    const sid = this.sucursal.sucursalActivaId();
    if (!sid) return;
    const r = this.rango();
    this.cargando.set(true);
    forkJoin({
      pyl:        this.fin.estadoResultados(sid, r),
      pylAnt:     this.fin.estadoResultados(sid, this.rangoAnterior()),
      pylAnio:    this.fin.estadoResultados(sid, this.rangoAnioAnterior()),
      flujo:      this.fin.flujoCaja(sid, r),
      metodos:    this.fin.metodosPago(sid, r),
      categorias: this.fin.ventasPorCategoria(sid, r),
      ventasDia:  this.fin.ventasPorDia(sid, r),
      gastos:     this.fin.listarGastos(sid, r),
      top:        this.fin.topProductos(sid, r),
      igv:        this.fin.igv(sid, r),
      margenCats: this.fin.margenCategorias(sid, r),
      topUtil:    this.fin.topUtilidad(sid, r),
      inventario: this.fin.diasInventario(sid, r),
    }).subscribe({
      next: (res) => {
        this.pyl.set(res.pyl);
        this.pylAnterior.set(res.pylAnt);
        this.pylAnioAnterior.set(res.pylAnio);
        this.flujo.set(res.flujo);
        this.metodos.set(res.metodos);
        this.categorias.set(res.categorias);
        this.ventasDia.set(res.ventasDia);
        this.gastos.set(res.gastos);
        this.topProductos.set(res.top);
        this.igv.set(res.igv);
        this.margenCats.set(res.margenCats);
        this.topUtilidad.set(res.topUtil);
        this.inventario.set(res.inventario);
        this.cargando.set(false);
        setTimeout(() => this.renderCharts(), 60);
      },
      error: (e) => {
        this.cargando.set(false);
        this.toast.error('No se pudo cargar finanzas: ' + (e.error?.message ?? e.message));
      },
    });
  }

  setPeriodo(p: Periodo): void {
    this.periodo.set(p);
    this.cargar();
  }

  // ── Gráficos (ApexCharts) ─────────────────────────────────────────────
  private renderCharts(): void {
    if (!this.viewReady) return;
    this.renderVentas();
    this.renderMetodos();
    this.renderCategorias();
    this.renderGastos();
  }

  private renderVentas(): void {
    const el = this.elVentas()?.nativeElement;
    if (!el) return;
    const datos = this.ventasDia();
    const opciones: any = {
      chart: { type: 'area', height: 280, toolbar: { show: false }, fontFamily: 'inherit',
               animations: { enabled: true, easing: 'easeinout', speed: 800 } },
      series: [{ name: 'Ventas', data: datos.map((d) => Number(d.total)) }],
      xaxis: { categories: datos.map((d) => d.dia.slice(5)), labels: { style: { fontSize: '10px' } } },
      yaxis: { labels: { formatter: (v: number) => 'S/ ' + Math.round(v) } },
      colors: [COLOR.primary],
      dataLabels: { enabled: false },
      // Con pocos días la curva suave se inventa ondulaciones entre puntos:
      // el día 3 del mes se veía una "tendencia" sinuosa que no está en los
      // datos. Recta cuando hay poco, suave cuando hay serie de verdad.
      stroke: { curve: datos.length <= 7 ? 'straight' : 'smooth', width: 3 },
      // Los puntos marcan los días reales medidos; sin ellos, tres valores
      // parecen una línea continua de un mes.
      markers: { size: datos.length <= 14 ? 4 : 0, strokeWidth: 0 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 } },
      grid: { borderColor: '#EEF2F7', strokeDashArray: 4 },
      tooltip: { y: { formatter: (v: number) => 'S/ ' + v.toFixed(2) } },
      noData: { text: 'Sin ventas en el período' },
    };
    this.chartVentas?.destroy();
    this.chartVentas = new ApexCharts(el, opciones);
    this.chartVentas.render();
  }

  private renderMetodos(): void {
    const el = this.elMetodos()?.nativeElement;
    if (!el) return;
    const datos = this.metodos();
    const opciones: any = {
      chart: { type: 'donut', height: 260, fontFamily: 'inherit',
               animations: { enabled: true, speed: 800 } },
      series: datos.map((m) => Number(m.monto)),
      labels: datos.map((m) => this.labelMetodo(m.metodo)),
      colors: [COLOR.emerald, COLOR.violet, COLOR.primary, COLOR.amber, COLOR.slate],
      legend: { position: 'bottom', fontSize: '12px' },
      dataLabels: { enabled: true, formatter: (v: number) => v.toFixed(0) + '%' },
      plotOptions: { pie: { donut: { size: '65%' } } },
      tooltip: { y: { formatter: (v: number) => 'S/ ' + v.toFixed(2) } },
      noData: { text: 'Sin pagos en el período' },
    };
    this.chartMetodos?.destroy();
    this.chartMetodos = new ApexCharts(el, opciones);
    this.chartMetodos.render();
  }

  private renderCategorias(): void {
    const el = this.elCategorias()?.nativeElement;
    if (!el) return;
    const datos = this.categorias().slice(0, 6);
    const opciones: any = {
      chart: { type: 'bar', height: 260, toolbar: { show: false }, fontFamily: 'inherit',
               animations: { enabled: true, speed: 800 } },
      series: [{ name: 'Ventas', data: datos.map((c) => Number(c.monto)) }],
      xaxis: { categories: datos.map((c) => c.categoria) },
      colors: [COLOR.violet],
      plotOptions: { bar: { horizontal: true, borderRadius: 6, barHeight: '60%' } },
      dataLabels: { enabled: false },
      grid: { borderColor: '#EEF2F7', strokeDashArray: 4 },
      tooltip: { y: { formatter: (v: number) => 'S/ ' + v.toFixed(2) } },
      noData: { text: 'Sin ventas por categoría' },
    };
    this.chartCategorias?.destroy();
    this.chartCategorias = new ApexCharts(el, opciones);
    this.chartCategorias.render();
  }

  private renderGastos(): void {
    const el = this.elGastos()?.nativeElement;
    if (!el) return;
    const datos = this.gastosPorCategoria();
    const opciones: any = {
      chart: { type: 'donut', height: 260, fontFamily: 'inherit', animations: { enabled: true, speed: 800 } },
      series: datos.map((d) => d.monto),
      labels: datos.map((d) => this.labelCategoriaGasto(d.categoria)),
      colors: PALETA,
      legend: { position: 'bottom', fontSize: '12px' },
      dataLabels: { enabled: true, formatter: (v: number) => v.toFixed(0) + '%' },
      plotOptions: { pie: { donut: { size: '65%' } } },
      tooltip: { y: { formatter: (v: number) => 'S/ ' + v.toFixed(2) } },
      noData: { text: 'Sin gastos en el período' },
    };
    this.chartGastos?.destroy();
    this.chartGastos = new ApexCharts(el, opciones);
    this.chartGastos.render();
  }

  // ── Gastos ────────────────────────────────────────────────────────────
  abrirGasto(): void {
    this.gastoEditando.set(null);
    this.fCategoria.set('SERVICIOS');
    this.fDescripcion.set('');
    this.fMonto.set(null);
    this.fFecha.set(this.iso(new Date()));
    this.mostrarGasto.set(true);
  }

  /** Corregir en vez de borrar: no pierde el registro de quién lo cargó. */
  editarGasto(g: GastoRow): void {
    this.gastoEditando.set(g);
    this.fCategoria.set(g.categoria);
    this.fDescripcion.set(g.descripcion);
    this.fMonto.set(Number(g.monto));
    this.fFecha.set(this.iso(new Date(g.fecha)));
    this.mostrarGasto.set(true);
  }

  /** Hoy en yyyy-mm-dd, para topar el input de fecha (no se paga por adelantado). */
  protected get hoyISO(): string { return this.iso(new Date()); }
  cerrarGasto(): void { this.mostrarGasto.set(false); }

  guardarGasto(): void {
    const desc = this.fDescripcion().trim();
    const monto = this.fMonto();
    if (!desc || !monto || monto <= 0) {
      this.toast.aviso('Completa descripción y monto válido');
      return;
    }
    const fecha = this.fFecha();
    if (fecha && fecha > this.hoyISO) {
      this.toast.aviso('La fecha del gasto no puede ser futura');
      return;
    }
    const sid = this.sucursal.sucursalActivaId();
    const editando = this.gastoEditando();
    const datos = {
      sucursalId: sid,
      categoria: this.fCategoria(),
      descripcion: desc,
      monto,
      // Mediodía en hora Perú: evita que el gasto salte de día al convertirse a UTC.
      ...(fecha ? { fecha: `${fecha}T12:00:00-05:00` } : {}),
    };
    this.guardandoGasto.set(true);
    const peticion = editando
      ? this.fin.actualizarGasto(editando.id, datos)
      : this.fin.crearGasto(datos);
    peticion.subscribe({
      next: () => {
        this.guardandoGasto.set(false);
        this.toast.exito(editando ? 'Gasto corregido' : 'Gasto registrado');
        this.cerrarGasto();
        this.cargar();
      },
      error: (e) => {
        this.guardandoGasto.set(false);
        this.toast.error(e.error?.message ?? e.message ?? 'No se pudo guardar el gasto');
      },
    });
  }

  /**
   * Borrar un gasto cambia la utilidad neta del período y no deja rastro de
   * quién lo hizo, así que no puede ser un clic suelto al lado del monto.
   */
  pedirEliminar(g: GastoRow): void { this.gastoAEliminar.set(g); }
  cancelarEliminar(): void { this.gastoAEliminar.set(null); }

  confirmarEliminar(): void {
    const g = this.gastoAEliminar();
    if (!g) return;
    this.eliminandoGasto.set(true);
    this.fin.eliminarGasto(g.id).subscribe({
      next: () => {
        this.eliminandoGasto.set(false);
        this.gastoAEliminar.set(null);
        this.toast.aviso('Gasto eliminado');
        this.cargar();
      },
      error: (e) => {
        this.eliminandoGasto.set(false);
        this.toast.error(e.error?.message ?? e.message ?? 'No se pudo eliminar');
      },
    });
  }

  // ── Gastos fijos mensuales ────────────────────────────────────────────

  private cargarFijos(): void {
    const sid = this.sucursal.sucursalActivaId();
    if (!sid) return;
    this.fin.listarRecurrentes(sid).subscribe({
      next: (r) => this.recurrentes.set(r),
      error: () => this.recurrentes.set([]),
    });
    this.fin.pendientesRecurrentes(sid).subscribe({
      next: (p) => this.pendientes.set(p),
      error: () => this.pendientes.set(null),
    });
  }

  abrirFijos(): void { this.mostrarFijos.set(true); this.limpiarFijo(); }
  cerrarFijos(): void { this.mostrarFijos.set(false); }

  private limpiarFijo(): void {
    this.fijoEditando.set(null);
    this.rCategoria.set('ALQUILER');
    this.rDescripcion.set('');
    this.rMonto.set(null);
    this.rDia.set(1);
  }

  editarFijo(r: GastoRecurrente): void {
    this.fijoEditando.set(r);
    this.rCategoria.set(r.categoria);
    this.rDescripcion.set(r.descripcion);
    this.rMonto.set(Number(r.monto));
    this.rDia.set(r.diaDelMes);
  }
  cancelarFijo(): void { this.limpiarFijo(); }

  guardarFijo(): void {
    const desc = this.rDescripcion().trim();
    const monto = this.rMonto();
    const dia = Number(this.rDia());
    if (!desc || !monto || monto <= 0) {
      this.toast.aviso('Completa descripción y monto válido');
      return;
    }
    if (!Number.isInteger(dia) || dia < 1 || dia > 28) {
      this.toast.aviso('El día de pago debe estar entre 1 y 28');
      return;
    }
    const sid = this.sucursal.sucursalActivaId();
    const editando = this.fijoEditando();
    const datos = {
      sucursalId: sid,
      categoria: this.rCategoria(),
      descripcion: desc,
      monto,
      diaDelMes: dia,
    };
    this.guardandoFijo.set(true);
    const peticion = editando
      ? this.fin.actualizarRecurrente(editando.id, datos)
      : this.fin.crearRecurrente(datos);
    peticion.subscribe({
      next: () => {
        this.guardandoFijo.set(false);
        this.toast.exito(editando ? 'Gasto fijo actualizado' : 'Gasto fijo creado');
        this.limpiarFijo();
        this.cargarFijos();
      },
      error: (e) => {
        this.guardandoFijo.set(false);
        this.toast.error(e.error?.message ?? e.message ?? 'No se pudo guardar');
      },
    });
  }

  alternarFijo(r: GastoRecurrente): void {
    this.fin.actualizarRecurrente(r.id, { activo: !r.activo }).subscribe({
      next: () => this.cargarFijos(),
      error: (e) => this.toast.error(e.error?.message ?? 'No se pudo cambiar'),
    });
  }

  eliminarFijo(r: GastoRecurrente): void {
    this.fin.eliminarRecurrente(r.id).subscribe({
      next: () => { this.toast.aviso('Gasto fijo eliminado'); this.limpiarFijo(); this.cargarFijos(); },
      error: (e) => this.toast.error(e.error?.message ?? 'No se pudo eliminar'),
    });
  }

  /**
   * Registra los meses pendientes. Es un paso explícito a propósito: el sistema
   * avisa, el dueño confirma. Nada de gastos que aparecen solos.
   */
  aplicarPendientes(): void {
    const p = this.pendientes();
    const sid = this.sucursal.sucursalActivaId();
    if (!p || p.pendientes.length === 0 || !sid) return;
    this.aplicando.set(true);
    this.fin.aplicarRecurrentes(sid, p.pendientes.map((x) => x.clave)).subscribe({
      next: (r) => {
        this.aplicando.set(false);
        this.toast.exito(`${r.registrados} gasto(s) fijo(s) registrados`);
        this.cargarFijos();
        this.cargar();
      },
      error: (e) => {
        this.aplicando.set(false);
        this.toast.error(e.error?.message ?? e.message ?? 'No se pudieron registrar');
      },
    });
  }

  /** "ago 2026" a partir del año y mes (1–12) que devuelve el backend. */
  protected mesLegible(anio: number, mes: number): string {
    return new Date(anio, mes - 1, 1)
      .toLocaleDateString('es-PE', { month: 'short', year: 'numeric' });
  }

  /** Nombre de quien registró el gasto ('—' si la cuenta ya no existe). */
  protected autorGasto(g: GastoRow): string {
    if (!g.usuario) return '—';
    return `${g.usuario.nombres} ${g.usuario.apellidos ?? ''}`.trim();
  }

  // ── Helpers de presentación ───────────────────────────────────────────
  protected num(v: string | number | null | undefined): number { return Number(v ?? 0); }
  protected formatSol(v: string | number | null | undefined): string {
    return 'S/ ' + this.num(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  protected pct(v: string | number | null | undefined): string { return this.num(v).toFixed(1) + '%'; }
  protected deltaLabel(d: number | null): string {
    if (d === null) return 'sin comparación';
    return (d >= 0 ? '+' : '') + d.toFixed(1) + '% vs anterior';
  }
  protected deltaPos(d: number | null): boolean { return (d ?? 0) >= 0; }

  protected labelMetodo(m: string): string {
    return { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta', YAPE_PLIN: 'Yape/Plin',
             TRANSFERENCIA: 'Transferencia', MIXTO: 'Mixto' }[m] ?? m;
  }
  protected labelCategoriaGasto(c: string): string {
    return { ALQUILER: 'Alquiler', SUELDOS: 'Sueldos', SERVICIOS: 'Servicios', MERCADERIA: 'Mercadería',
             MARKETING: 'Marketing', MANTENIMIENTO: 'Mantenimiento', IMPUESTOS: 'Impuestos',
             TRANSPORTE: 'Transporte', OTROS: 'Otros' }[c] ?? c;
  }
  protected fechaCorta(iso: string): string {
    return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
  }
  protected totalGastos(): number {
    return this.gastos().reduce((s, g) => s + Number(g.monto), 0);
  }

  protected setVistaRanking(v: 'venta' | 'utilidad'): void {
    this.vistaRanking.set(v);
  }

  /** Días de inventario formateados ("—" cuando no hay ventas para calcular). */
  /**
   * Días de inventario, con techo.
   *
   * Un producto casi sin rotación da cifras sin sentido —"2502 días"— que
   * restan credibilidad a toda la pantalla. Pasado el año el número exacto ya
   * no informa: lo único que importa es que ese capital lleva parado
   * muchísimo tiempo.
   */
  protected diasTexto(d: number | null): string {
    if (d === null) return '—';
    if (d > 365) return 'más de 1 año';
    return `${d.toFixed(0)} días`;
  }

  // ── Exportar a CSV (estado de resultados + gastos) ────────────────────
  exportarCSV(): void {
    const p = this.pyl();
    if (!p) { this.toast.aviso('No hay datos para exportar'); return; }
    const esc = (v: string | number) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lineas: string[] = [];
    lineas.push('ESTADO DE RESULTADOS,' + this.labelPeriodo());
    lineas.push('Concepto,Monto');
    lineas.push(`Ventas totales,${this.num(p.ventasTotales).toFixed(2)}`);
    lineas.push(`Ventas netas (sin IGV),${this.num(p.ventasNetas).toFixed(2)}`);
    lineas.push(`Costo de ventas,${this.num(p.costoVentas).toFixed(2)}`);
    lineas.push(`Utilidad bruta,${this.num(p.utilidadBruta).toFixed(2)}`);
    lineas.push(`Margen bruto %,${this.num(p.margenBruto).toFixed(2)}`);
    lineas.push(`Mermas (vencidos/dañados),${this.num(p.perdidaMermas).toFixed(2)}`);
    lineas.push(`Gastos operativos,${this.num(p.gastos).toFixed(2)}`);
    lineas.push(`Utilidad neta,${this.num(p.utilidadNeta).toFixed(2)}`);
    lineas.push(`Margen neto %,${this.num(p.margenNeto).toFixed(2)}`);

    const i = this.igv();
    if (i) {
      lineas.push('');
      lineas.push('IGV ESTIMADO (referencial - no es declaración)');
      lineas.push(`IGV de ventas,${this.num(i.igvVentas).toFixed(2)}`);
      lineas.push(`IGV de compras,${this.num(i.igvCompras).toFixed(2)}`);
      lineas.push(`Por pagar,${this.num(i.porPagar).toFixed(2)}`);
    }

    const eq = this.equilibrioDiario();
    if (eq) {
      lineas.push('');
      lineas.push('PUNTO DE EQUILIBRIO');
      lineas.push(`Venta diaria necesaria,${eq.porDia.toFixed(2)}`);
      lineas.push(`Venta diaria real,${eq.promedioReal.toFixed(2)}`);
    }

    lineas.push('');
    lineas.push('GASTOS DEL PERÍODO');
    lineas.push('Fecha,Categoría,Descripción,Monto');
    for (const g of this.gastos()) {
      lineas.push([this.fechaCorta(g.fecha), this.labelCategoriaGasto(g.categoria),
        g.descripcion, this.num(g.monto).toFixed(2)].map(esc).join(','));
    }
    lineas.push('');
    lineas.push('GASTOS POR CATEGORÍA');
    lineas.push('Categoría,Monto');
    for (const c of this.gastosPorCategoria()) {
      lineas.push([this.labelCategoriaGasto(c.categoria), c.monto.toFixed(2)].map(esc).join(','));
    }

    if (this.margenCats().length > 0) {
      lineas.push('');
      lineas.push('RENTABILIDAD POR CATEGORÍA');
      lineas.push('Categoría,Unidades,Ingreso,Costo,Utilidad,Margen %');
      for (const c of this.margenCats()) {
        lineas.push([c.categoria, c.unidades, this.num(c.ingreso).toFixed(2),
          this.num(c.costo).toFixed(2), this.num(c.utilidad).toFixed(2),
          this.num(c.margenPct).toFixed(2)].map(esc).join(','));
      }
    }
    const blob = new Blob(['﻿' + lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finanzas_${this.iso(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.exito('Estado de resultados exportado');
  }
}
