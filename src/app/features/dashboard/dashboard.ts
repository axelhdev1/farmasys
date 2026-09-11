import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';
import { Producto } from '../../core/models/producto.model';
import { ProductoService } from '../../core/services/producto.service';
import { StockSucursalService } from '../../core/services/stock-sucursal.service';
import { SucursalService } from '../../core/services/sucursal.service';
import { VentaService, VentaBackend } from '../../core/services/venta.service';
import { CajaService, CajaOlvidada } from '../../core/services/caja.service';
import { ConfiguracionService } from '../../core/services/configuracion.service';

/**
 * Una cosa que atender hoy.
 *
 * `valor` + `etiqueta` es lo que se pinta en el chip ("5" · "sin stock");
 * `titulo` y `detalle` siguen existiendo para el aria-label, que es lo único
 * que lee un lector de pantalla cuando el chip se queda en dos palabras.
 * `valor` va en null cuando la alerta no es una cuenta (la caja sin abrir):
 * entonces el chip muestra el icono en lugar de la cifra.
 */
interface AlertaAccion {
  icono: string;
  valor: number | null;
  etiqueta: string;
  titulo: string;
  detalle: string;
  ruta: string;
  cta: string;
  critico: boolean;
}

interface ItemVenta {
  productoId: string;
  nombre: string;
  categoria: string;
  cantidad: number;
  precioUnitario: number;
}

/**
 * Métodos que el dashboard sabe pintar.
 *
 * Antes eran solo tres y TRANSFERENCIA caía en 'Efectivo': una venta cobrada
 * por transferencia aparecía como si hubiera entrado plata al cajón. Y en el
 * pago mixto se miraba solo el primer pago, así que una venta partida entre
 * efectivo y tarjeta se etiquetaba con lo que viniera primero.
 */
type MetodoUI = 'Efectivo' | 'Yape' | 'Tarjeta' | 'Transferencia' | 'Mixto';

interface VentaUI {
  id: string;
  hora: string;        // "14:32"
  horaMinutos: number; // minutos desde medianoche, para agrupar
  cliente: string;
  metodo: MetodoUI;
  items: ItemVenta[];
  total: number;
}

interface AccesoRapido {
  ruta: string;
  label: string;
  icono: string;
  destacado?: boolean;
}

interface AlertaVencimiento {
  nombre: string;
  categoria: string;
  lote: string;
  dias: number;
}

/**
 * Dashboard principal.
 *
 * Filosofía de datos (todo REAL, nada simulado):
 *   - Catálogo y stock → ProductoService / StockSucursalService.
 *   - Ventas de hoy y de ayer → VentaService (una sola petición cubre ambos
 *     días; ayer solo se usa para las tendencias).
 *   - KPIs por sucursal y cajas olvidadas → backend de reportes / caja.
 *   - Hora y saludo → reactivos via tick signal (se actualizan cada minuto).
 *
 * Las fechas se comparan por día LOCAL, nunca por UTC (ver claveDiaLocal).
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
  private readonly auth         = inject(AuthService);
  private readonly productoSvc  = inject(ProductoService);
  private readonly stockSvc     = inject(StockSucursalService);
  private readonly ventaSvc     = inject(VentaService);
  private readonly cajaSvc      = inject(CajaService);
  private readonly configSvc    = inject(ConfiguracionService);
  private readonly router       = inject(Router);
  protected readonly sucursalSvc = inject(SucursalService);

  ngOnInit(): void {
    // Carga el catálogo/stock reales y las ventas reales de hoy.
    this.productoSvc.cargar();
    this.cargarVentasHoy();
    // KPIs por sucursal (torre de control del SUPER_ADMIN): sin esto el ranking
    // y los totales globales salían todos en 0.
    if (this.esSuperAdmin()) {
      this.sucursalSvc.cargarKpis();
    }
    // KPI de la sucursal activa: de aquí salen el valor de inventario (a costo)
    // y el conteo de alertas. Antes esta zona los recalculaba por su cuenta con
    // otras reglas y se contradecía con el ranking de arriba.
    const activa = this.sucursalSvc.sucursalActivaId();
    if (activa) this.sucursalSvc.cargarKpiDeSucursal(activa);
    // Cajas olvidadas (abiertas +24h): bloquean su terminal y dejan el arqueo
    // sin cerrar. Solo administración puede resolverlas.
    if (this.esSuperAdmin() || this.esAdmin()) {
      this.cajaSvc.cajasOlvidadas(24).subscribe({
        next: (lista) => this.cajasOlvidadas.set(lista),
        error: () => this.cajasOlvidadas.set([]),
      });
    }
  }

  /** Cajas abiertas hace más de 24h (alerta de control). */
  protected readonly cajasOlvidadas = signal<CajaOlvidada[]>([]);

  /**
   * Día LOCAL de una fecha, como 'AAAA-MM-DD'.
   *
   * OJO: NO usar `toISOString().slice(0,10)` para esto. Esa función devuelve
   * UTC, y Perú va 5 horas atrás: a partir de las 19:00 hora local, UTC ya está
   * en el día siguiente. El dashboard comparaba el día UTC contra la fecha UTC
   * de cada venta y, pasadas las 7 de la noche, las ventas de esa misma tarde
   * dejaban de contar — la botica veía su venta del día caer a cero justo en
   * hora punta.
   */
  private claveDiaLocal(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dia}`;
  }

  /**
   * Carga las ventas REALES de hoy y de AYER (para comparar) y las mapea al
   * formato del dashboard. Una sola petición cubre ambos días.
   */
  private cargarVentasHoy(): void {
    // Sucursal activa (no el token directo): así el switch del SUPER_ADMIN
    // también recarga las ventas del dashboard.
    const sid = this.sucursalSvc.sucursalActivaId();

    const ahora = new Date();
    const ayer = new Date(ahora);
    ayer.setDate(ayer.getDate() - 1);
    ayer.setHours(0, 0, 0, 0);

    const claveHoy = this.claveDiaLocal(ahora);
    const claveAyer = this.claveDiaLocal(ayer);

    this.ventaSvc.listarBackend(sid, { desde: ayer.toISOString() }).subscribe({
      next: (rows) => {
        const completadas = rows.filter((r) => r.estado === 'COMPLETADA');
        const deHoy: VentaBackend[] = [];
        let totalAyer = 0;
        let ticketsAyer = 0;

        for (const r of completadas) {
          const clave = this.claveDiaLocal(new Date(r.fecha));
          if (clave === claveHoy) {
            deHoy.push(r);
          } else if (clave === claveAyer) {
            totalAyer += Number(r.total);
            ticketsAyer += 1;
          }
        }

        this._ventasHoy.set(deHoy.map((r) => this.mapVentaDash(r)));
        this._ventaAyer.set(totalAyer);
        this._ticketsAyer.set(ticketsAyer);
      },
      error: () => {
        this._ventasHoy.set([]);
        this._ventaAyer.set(0);
        this._ticketsAyer.set(0);
      },
    });
  }

  /** Etiqueta del método de pago de una venta, mirando TODOS sus pagos. */
  private metodoDe(v: VentaBackend): MetodoUI {
    const metodos = new Set((v.pagos ?? []).map((p) => p.metodo));
    if (metodos.size === 0) return 'Efectivo';
    // Más de un método = mixto de verdad, aunque el backend no lo marque así.
    if (metodos.size > 1 || metodos.has('MIXTO')) return 'Mixto';
    const unico = [...metodos][0];
    const mapa: Record<string, MetodoUI> = {
      TARJETA: 'Tarjeta',
      YAPE_PLIN: 'Yape',
      TRANSFERENCIA: 'Transferencia',
      EFECTIVO: 'Efectivo',
    };
    return mapa[unico] ?? 'Efectivo';
  }

  private mapVentaDash(v: VentaBackend): VentaUI {
    const d = new Date(v.fecha);
    const cli = v.cliente
      ? (v.cliente.razonSocial || `${v.cliente.nombres} ${v.cliente.apellidos ?? ''}`.trim())
      : 'Cliente particular';
    return {
      id: v.numeroComprobante,
      hora: d.toTimeString().slice(0, 5),
      horaMinutos: d.getHours() * 60 + d.getMinutes(),
      cliente: cli,
      metodo: this.metodoDe(v),
      items: v.items.map((i) => ({
        productoId: i.productoId,
        nombre: i.producto?.nombre ?? i.productoId,
        // La categoría venía fija en '' y se pintaba como "Lote X · " sin nada
        // detrás. Se resuelve contra el catálogo, que ya está cargado.
        categoria: this.productoSvc.porId(i.productoId)?.categoria ?? '',
        cantidad: i.cantidad,
        precioUnitario: Number(i.precioUnitario),
      })),
      total: Number(v.total),
    };
  }

  /** Stock del producto en la sucursal activa (unidad base). Para el dashboard. */
  protected stockEnSucursal(p: Producto): number {
    return this.stockSvc.stockEn(p.id, this.sucursalSvc.sucursalActivaId());
  }

  // ── Tick reactivo para saludo / fecha ───────────────────────────────
  // Se actualiza cada minuto para que la hora/saludo no queden congelados.
  private readonly tick = signal(0);
  constructor() {
    setInterval(() => this.tick.update(t => t + 1), 60_000);
  }

  // ── Identidad ───────────────────────────────────────────────────────
  protected readonly esSuperAdmin   = computed(() => this.auth.tieneAlgunRol('SUPER_ADMIN'));
  protected readonly esAdmin        = computed(() => this.auth.tieneAlgunRol('ADMIN'));
  protected readonly esVendedor     = computed(() => this.auth.tieneAlgunRol('VENDEDOR'));
  protected readonly esFarmaceutico = computed(() => this.auth.tieneAlgunRol('FARMACEUTICO'));
  protected readonly esAlmacenero   = computed(() => this.auth.tieneAlgunRol('ALMACENERO'));

  protected readonly nombreUsuario = computed(() => this.auth.usuario()?.nombres ?? 'Usuario');

  /**
   * ¿Puede ver cifras financieras en el inicio?
   *
   * Se usa el MISMO permiso que protege la pantalla de Finanzas, no una lista
   * de roles aparte: si mañana se le da acceso a un contador, el inicio lo
   * respeta solo.
   *
   * Existe porque "Valor inventario" —cuánto capital tiene la botica parado en
   * mercadería— estaba en la pantalla de inicio de cualquier vendedor, sin
   * ningún control, justo después de haber cerrado el P&L y los márgenes por
   * rol. Además el cajero no hace nada con ese número: su inicio es abrir caja,
   * reponer y vender.
   */
  protected readonly puedeVerFinanzas = computed(() => this.auth.tienePermiso('finanzas'));

  /**
   * Estado del turno del usuario, para la tarjeta que reemplaza al valor de
   * inventario. Un cajero necesita saber esto al entrar; el capital
   * inmovilizado no le sirve de nada.
   */
  protected readonly miTurno = computed(() => {
    const caja = this.cajaSvc.cajaAbiertaDe(
      this.auth.usuario()?.id ?? '',
      this.sucursalSvc.sucursalActivaId(),
    );
    if (!caja || caja.estado !== 'ABIERTA') {
      return { abierta: false, terminal: '', desde: '' };
    }
    const d = new Date(caja.aperturaEn);
    return {
      abierta: true,
      terminal: caja.terminal,
      desde: Number.isNaN(d.getTime()) ? '' : d.toTimeString().slice(0, 5),
    };
  });

  protected readonly rolUsuario = computed(() => {
    const u = this.auth.usuario();
    if (!u || u.roles.length === 0) return '';
    const map: Record<string, string> = {
      SUPER_ADMIN:  'Super Administrador',
      ADMIN:        'Administrador',
      VENDEDOR:     'Vendedor',
      FARMACEUTICO: 'Farmacéutico',
      ALMACENERO:   'Almacenero',
    };
    return map[u.roles[0]] ?? u.roles[0];
  });

  /** Sucursal del usuario para mostrar en el hero */
  protected readonly nombreSucursalUsuario = computed(() => {
    const id = this.auth.usuario()?.sucursalActualId;
    if (!id) return null;
    const s = this.sucursalSvc.sucursales().find(s => s.id === id);
    return s ? `${s.nombre} · ${s.distrito}` : null;
  });

  // ── Ventas del día ──────────────────────────────────────────────────
  /** Ventas reales de hoy (las carga ngOnInit desde el backend). */
  private readonly _ventasHoy = signal<VentaUI[]>([]);

  // Aquí vivía `_ventasMock`: 45 líneas de ventas inventadas, con nombres de
  // clientes falsos y números de boleta de mentira. No se usaba —y estaba
  // justo debajo del comentario que dice "todo REAL, nada simulado"—, pero
  // bastaba un descuido para que apareciera en la pantalla del cliente.

  // ── KPIs derivados de las ventas reales ─────────────────────────────
  protected readonly ventaHoy = computed(() =>
    this._ventasHoy().reduce((s, v) => s + v.total, 0)
  );

  protected readonly ticketsHoy = computed(() => this._ventasHoy().length);

  protected readonly ticketPromedio = computed(() => {
    const t = this.ticketsHoy();
    return t === 0 ? 0 : this.ventaHoy() / t;
  });

  // ── Tendencias REALES contra ayer ──────────────────────────────────────
  // Antes eran dos textos fijos ('+12%' / '+5%') que se pintaban en pantalla
  // como si fueran datos: el dueño podía creer que había crecido cuando no.
  private readonly _ventaAyer   = signal(0);
  private readonly _ticketsAyer = signal(0);

  /**
   * Variación contra ayer. Devuelve null cuando no hay base de comparación
   * (ayer sin ventas): en ese caso no se muestra nada, en vez de inventar un
   * "+100%" que no significa nada.
   */
  private variacion(hoy: number, ayer: number): { texto: string; positivo: boolean } | null {
    if (ayer <= 0) return null;
    const pct = ((hoy - ayer) / ayer) * 100;
    const signo = pct >= 0 ? '+' : '';
    return { texto: `${signo}${pct.toFixed(0)}%`, positivo: pct >= 0 };
  }

  protected readonly tendenciaVenta = computed(() =>
    this.variacion(this.ventaHoy(), this._ventaAyer()),
  );
  protected readonly tendenciaTkt = computed(() =>
    this.variacion(this.ticketsHoy(), this._ticketsAyer()),
  );

  protected readonly topProductos = computed(() => {
    const acc = new Map<string, { nombre: string; categoria: string; ventas: number; ingresos: number }>();
    for (const v of this._ventasHoy()) {
      for (const it of v.items) {
        const actual = acc.get(it.productoId);
        if (actual) {
          actual.ventas   += it.cantidad;
          actual.ingresos += it.cantidad * it.precioUnitario;
        } else {
          acc.set(it.productoId, {
            nombre: it.nombre, categoria: it.categoria,
            ventas: it.cantidad,
            ingresos: it.cantidad * it.precioUnitario,
          });
        }
      }
    }
    return Array.from(acc.values()).sort((a, b) => b.ventas - a.ventas).slice(0, 5);
  });

  protected readonly ventasRecientes = computed(() =>
    [...this._ventasHoy()].sort((a, b) => b.horaMinutos - a.horaMinutos).slice(0, 6)
  );

  /**
   * Franja horaria a graficar.
   *
   * Antes estaba fija en 8am–8pm. Una botica que abre a las 7 o cierra a las 10
   * tenía ventas que NO salían en la barra pero SÍ en el total del día: el
   * gráfico no sumaba lo que decía el KPI de arriba. Ahora la franja se estira
   * hasta cubrir la primera y la última venta reales, con 8–20 como mínimo para
   * que un día flojo no muestre dos barras sueltas.
   */
  private readonly franjaHoraria = computed(() => {
    const ventas = this._ventasHoy();
    let desde = 8;
    let hasta = 20;
    for (const v of ventas) {
      const h = Math.floor(v.horaMinutos / 60);
      if (h < desde) desde = h;
      if (h > hasta) hasta = h;
    }
    return { desde, hasta };
  });

  protected readonly ventasPorHora = computed(() => {
    const { desde, hasta } = this.franjaHoraria();
    const horas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
    const datos = horas.map(h => {
      const total = this._ventasHoy()
        .filter(v => Math.floor(v.horaMinutos / 60) === h)
        .reduce((s, v) => s + v.total, 0);
      return { hora: h, label: this.formatHora(h), total };
    });
    return datos;
  });

  protected readonly maxVentaHora = computed(() =>
    Math.max(...this.ventasPorHora().map(d => d.total), 1)
  );

  /**
   * Techo del eje Y, redondeado hacia arriba a 1 / 2 / 5 × potencia de diez.
   *
   * Antes las barras se escalaban contra el máximo real, así que la hora pico
   * siempre llegaba al 100% y no había forma de leer un valor: el gráfico
   * dibujaba proporciones sin escala. Con un techo redondo (1.000, 2.500…) las
   * marcas del eje caen en cifras que se leen de un vistazo.
   */
  protected readonly techoGrafico = computed(() => {
    const max = this.maxVentaHora();
    if (max <= 0) return 20;

    // Se elige el TRAMO (no el techo): el escalón redondo más pequeño que,
    // repetido cuatro veces, cubra el pico. Así las cuatro marcas del eje caen
    // siempre en cifras legibles —250 · 500 · 750 · 1.000— en vez de 313 y
    // 1.125, y el pico queda alto en el marco en lugar de a media altura.
    const bruto = max / 4;
    const exp   = Math.pow(10, Math.floor(Math.log10(bruto)));
    const n     = bruto / exp;
    const tramo = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(p => n <= p) ?? 10;

    // Suelo de 20: con una única venta de S/ 1 el eje salía "1 · 1 · 1 · 0 · 0".
    return Math.max(20, tramo * exp * 4);
  });

  /** Marcas del eje, de arriba abajo. `pct` es la posición desde la base. */
  protected readonly ejeVentas = computed(() => {
    const techo = this.techoGrafico();
    return [1, 0.75, 0.5, 0.25, 0].map(f => ({
      valor: Math.round(techo * f),
      pct: f * 100,
    }));
  });

  /**
   * Las barras, ya escaladas contra el techo del eje (no contra el máximo), que
   * es lo que hace que la altura dibujada y el número del eje signifiquen lo
   * mismo.
   */
  protected readonly barrasHora = computed(() => {
    const techo = this.techoGrafico();
    return this.ventasPorHora().map(d => ({
      ...d,
      porcentaje: techo > 0 ? (d.total / techo) * 100 : 0,
    }));
  });

  protected readonly horaPico = computed(() => {
    const arr = this.ventasPorHora();
    const top = arr.reduce((max, d) => d.total > max.total ? d : max, arr[0]);
    return top.label;
  });

  protected readonly mejorProducto = computed(() => this.topProductos()[0]?.nombre ?? '-');

  private formatHora(h: number): string {
    if (h === 12) return '12pm';
    if (h === 0)  return '12am';
    return h < 12 ? `${h}am` : `${h - 12}pm`;
  }

  // ── Alertas de stock REALES por sucursal activa (StockSucursalService) ──
  protected readonly sinStock = computed(() => {
    const sid = this.sucursalSvc.sucursalActivaId();
    return this.productoSvc.productos()
      .filter(p => p.activo && this.stockSvc.stockEn(p.id, sid) === 0);
  });

  protected readonly stockCritico = computed(() => {
    const sid = this.sucursalSvc.sucursalActivaId();
    return this.productoSvc.productos().filter(p => {
      if (!p.activo) return false;
      const s   = this.stockSvc.stockEn(p.id, sid);
      const min = this.stockSvc.stockMinimoEn(p.id, sid);
      return s > 0 && min > 0 && s <= min;
    });
  });

  protected readonly totalAlertasStock = computed(() =>
    this.sinStock().length + this.stockCritico().length
  );

  protected readonly totalProductos = computed(() =>
    this.productoSvc.productos().filter(p => p.activo).length
  );

  /**
   * Capital inmovilizado en stock, **a costo**, tal como lo calcula el backend.
   *
   * Antes se recalculaba aquí a PRECIO DE VENTA y truncando por el factor más
   * grande de las presentaciones (250 unidades con caja de 100 contaban como 2
   * cajas y se perdían 50). Resultado: la tarjeta de la botica en la torre de
   * control decía un número y esta, dos pantallazos más abajo, decía otro
   * distinto para la misma sucursal — y ninguno coincidía con Finanzas.
   *
   * Ahora sale del mismo KPI que alimenta el ranking: una sola definición.
   */
  protected readonly valorInventario = computed(() => {
    const k = this.sucursalSvc.kpiDe(this.sucursalSvc.sucursalActivaId() ?? '');
    return Number(k?.valorInventario ?? 0);
  });

  protected readonly saludo = computed(() => {
    this.tick();
    const h = new Date().getHours();
    // 0–4 = madrugada (sigue siendo "buenas noches")
    // 5–11 = mañana
    // 12–18 = tarde
    // 19–23 = noche
    if (h >= 5 && h < 12)  return 'Buenos días';
    if (h >= 12 && h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  });

  /**
   * Señal de momento del día.
   *
   * El hero cambiaba de color entero con la hora —celeste de mañana, amarillo
   * de tarde, oscuro de noche—. Se quitó: tres fondos son tres regímenes de
   * contraste que mantener, y así fue exactamente como se rompió (la paleta
   * cambió y la variante de tarde se quedó con texto ámbar heredado sobre un
   * fondo que ya no era ámbar). Además el amarillo es el color de alerta del
   * sistema: media jornada con el encabezado en ámbar y los avisos dejan de
   * destacar.
   *
   * La señal sobrevive donde no le cuesta contraste a nadie: el icono.
   */
  protected readonly iconoHora = computed(() => {
    this.tick();
    const h = new Date().getHours();
    if (h >= 5 && h < 12)  return { icono: 'wb_twilight', clase: 'bg-sky-50 text-sky-700' };
    if (h >= 12 && h < 19) return { icono: 'light_mode',  clase: 'bg-amber-50 text-accent-orange-ink' };
    return { icono: 'dark_mode', clase: 'bg-slate-800 text-white' };
  });

  protected readonly fechaHoy = computed(() => {
    this.tick();
    return new Date().toLocaleDateString('es-PE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  });

  /**
   * Días de anticipación configurados en Ajustes. Estaban fijos en 90 aquí y en
   * 30 en el panel de alertas, mientras Inventario y el backend ya usaban el
   * valor configurado: tres pantallas, tres criterios.
   */
  protected readonly diasAlerta = computed(() => {
    const d = Number(this.configSvc.config()?.alertaVencimientoDias);
    return Number.isFinite(d) && d > 0 ? d : 90;
  });

  /** Lotes por vencer dentro de la ventana configurada (incluye ya vencidos). */
  protected readonly alertasVencimiento = computed<AlertaVencimiento[]>(() => {
    const sid = this.sucursalSvc.sucursalActivaId();
    return this.stockSvc.proximosAVencer(sid, this.diasAlerta()).map(l => {
      const p = this.productoSvc.porId(l.productoId);
      return {
        nombre:    p?.nombre ?? l.productoId,
        categoria: p?.categoria ?? '',
        lote:      l.lote,
        dias:      this.stockSvc.diasParaVencer(l.vencimiento),
      };
    });
  });

  /** Cuántos vencimientos caben sin desbalancear la columna. */
  private readonly TOPE_VENCIMIENTOS = 7;

  /** Los más urgentes primero; el resto se consulta en Inventario. */
  protected readonly vencimientosVisibles = computed(() =>
    [...this.alertasVencimiento()]
      .sort((a, b) => a.dias - b.dias)
      .slice(0, this.TOPE_VENCIMIENTOS),
  );

  protected readonly vencimientosOcultos = computed(() =>
    Math.max(0, this.alertasVencimiento().length - this.TOPE_VENCIMIENTOS),
  );

  /**
   * Solo los que AÚN no vencen. Es lo que cuenta la tarjeta "Por vencer", con
   * el mismo criterio que el KPI del backend (que excluye los vencidos): los ya
   * vencidos tienen su propia alerta, y sumarlos aquí hacía que la tarjeta y el
   * ranking de arriba dieran números distintos para la misma botica.
   */
  protected readonly porVencerCount = computed(
    () => this.alertasVencimiento().filter((a) => a.dias >= 0).length,
  );

  /**
   * Lotes que YA vencieron. Va aparte de `porVencerCount` a propósito: el panel
   * lateral mostraba un único badge con la suma ("24 lotes") bajo el título
   * "Próximos a Vencer", mientras la tarjeta de arriba decía "14". Dos cifras
   * distintas para la misma botica en la misma pantalla, y ninguna explicaba a
   * la otra. Ahora el panel enseña las dos por separado.
   */
  protected readonly vencidosCount = computed(
    () => this.alertasVencimiento().filter((a) => a.dias < 0).length,
  );

  /** ¿El cajero (vendedor/farmacéutico) no ha abierto su caja hoy? */
  protected readonly sinCajaAbierta = computed(() => {
    if (!this.auth.tieneAlgunRol('VENDEDOR', 'FARMACEUTICO')) return false;
    const caja = this.cajaSvc.cajaAbiertaDe(
      this.auth.usuario()?.id ?? '',
      this.sucursalSvc.sucursalActivaId(),
    );
    return !caja;
  });

  /** Panel "Qué atender hoy": alertas reales convertidas en acciones. */
  protected readonly alertas = computed<AlertaAccion[]>(() => {
    const out: AlertaAccion[] = [];

    if (this.sinCajaAbierta()) {
      out.push({
        icono: 'account_balance_wallet', valor: null, etiqueta: 'Abre tu caja',
        titulo: 'No has abierto tu caja',
        detalle: 'Ábrela para registrar ventas', ruta: '/caja', cta: 'Abrir caja', critico: true,
      });
    }
    const agot = this.sinStock().length;
    if (agot > 0) {
      out.push({
        icono: 'production_quantity_limits', valor: agot, etiqueta: 'sin stock',
        titulo: `${agot} producto(s) agotado(s)`,
        detalle: 'Sin stock para vender', ruta: '/reposicion', cta: 'Ver reposición', critico: true,
      });
    }
    const bajo = this.stockCritico().length;
    if (bajo > 0) {
      out.push({
        icono: 'inventory', valor: bajo, etiqueta: 'bajo mínimo',
        titulo: `${bajo} producto(s) con stock bajo`,
        detalle: 'Por debajo del mínimo', ruta: '/reposicion', cta: 'Ver reposición', critico: false,
      });
    }
    const vencidos = this.vencidosCount();
    if (vencidos > 0) {
      out.push({
        icono: 'block', valor: vencidos, etiqueta: 'lotes vencidos',
        titulo: `${vencidos} lote(s) vencido(s)`,
        detalle: 'Deben darse de baja', ruta: '/inventario', cta: 'Ver inventario', critico: true,
      });
    }
    const porVencer = this.porVencerCount();
    if (porVencer > 0) {
      out.push({
        icono: 'event_busy', valor: porVencer, etiqueta: 'lotes por vencer',
        titulo: `${porVencer} lote(s) por vencer`,
        detalle: `Vencen en ${this.diasAlerta()} días o menos`,
        ruta: '/inventario', cta: 'Ver inventario', critico: false,
      });
    }
    return out;
  });

  protected readonly accesosRapidos = computed<AccesoRapido[]>(() => {
    if (this.esSuperAdmin()) {
      return [
        { ruta: '/sucursales',   label: 'Mis Sucursales',  icono: 'store',         destacado: true },
        { ruta: '/finanzas',     label: 'Finanzas',        icono: 'bar_chart' },
        { ruta: '/inventario',   label: 'Inventario',      icono: 'inventory_2' },
        { ruta: '/usuarios',     label: 'Usuarios',        icono: 'manage_accounts' },
      ];
    }
    if (this.esAdmin()) {
      return [
        { ruta: '/pos',          label: 'Nueva Venta',     icono: 'point_of_sale', destacado: true },
        { ruta: '/finanzas',     label: 'Finanzas',        icono: 'bar_chart' },
        { ruta: '/inventario',   label: 'Inventario',      icono: 'inventory_2' },
        { ruta: '/usuarios',     label: 'Usuarios',        icono: 'manage_accounts' },
      ];
    }
    if (this.esVendedor()) {
      return [
        { ruta: '/pos',          label: 'Nueva Venta',     icono: 'point_of_sale', destacado: true },
        { ruta: '/clientes',     label: 'Clientes',        icono: 'group' },
        { ruta: '/ventas',       label: 'Mis Ventas',      icono: 'receipt_long' },
      ];
    }
    if (this.esFarmaceutico()) {
      return [
        { ruta: '/inventario',   label: 'Inventario',      icono: 'inventory_2',   destacado: true },
        { ruta: '/ventas',       label: 'Ventas',          icono: 'receipt_long' },
        { ruta: '/clientes',     label: 'Clientes',        icono: 'group' },
      ];
    }
    if (this.esAlmacenero()) {
      return [
        { ruta: '/inventario',   label: 'Inventario',      icono: 'inventory_2',   destacado: true },
      ];
    }
    return [];
  });

  etiquetaVencimiento(dias: number): string {
    if (dias < 0)  return 'Vencido';
    if (dias === 0) return 'Hoy';
    if (dias === 1) return 'Mañana';
    return `${dias} días`;
  }

  colorMetodo(metodo: MetodoUI): string {
    switch (metodo) {
      case 'Efectivo':      return 'bg-emerald-50 text-emerald-600';
      case 'Yape':          return 'bg-violet-50 text-violet-600';
      case 'Tarjeta':       return 'bg-primary-50 text-primary-600';
      case 'Transferencia': return 'bg-slate-100 text-slate-600';
      case 'Mixto':         return 'bg-amber-50 text-accent-orange-ink';
    }
  }

  iconoMetodo(metodo: MetodoUI): string {
    switch (metodo) {
      case 'Yape':          return 'smartphone';
      case 'Tarjeta':       return 'credit_card';
      case 'Transferencia': return 'account_balance';
      case 'Mixto':         return 'call_split';
      default:              return 'payments';
    }
  }

  // Usan el padrón CON KPIs reales fusionados (sucursalesConKpi), no el crudo:
  // `sucursales()` nunca trae `kpi` y el ranking salía plano en 0.
  protected readonly rankingSucursales = computed(() =>
    [...this.sucursalSvc.sucursalesConKpi()]
      .sort((a, b) => (b.kpi?.ventaHoy ?? 0) - (a.kpi?.ventaHoy ?? 0))
  );

  protected readonly maxVentaSucursal = computed(() =>
    Math.max(...this.sucursalSvc.sucursalesConKpi().map(s => s.kpi?.ventaHoy ?? 0), 1)
  );

  protected anchoBarra(ventaHoy: number): number {
    return Math.round((ventaHoy / this.maxVentaSucursal()) * 100);
  }

  /**
   * Clases del botón de acceso rápido del hero.
   *
   * El hero se pinta oscuro para el super admin y claro para el resto, así que
   * los botones tienen que cambiar de paleta con él. Estaba resuelto teniendo
   * dos heros duplicados en la plantilla, y se habían desincronizado: en uno
   * los dos botones contiguos llevaban `rounded-lg` y `rounded-xl`. Con una
   * sola fuente eso no puede volver a pasar.
   */
  protected claseAcceso(destacado?: boolean): string {
    const base =
      'flex items-center gap-2 text-sm font-semibold px-4 h-10 rounded-lg ' +
      'transition-colors focus:outline-none focus-visible:ring-2';

    // Un solo acento por vista: el botón principal es el único relleno.
    return destacado
      ? `${base} bg-primary text-white hover:bg-primary-700 focus-visible:ring-primary/50`
      : `${base} bg-background-light text-text-main hover:bg-slate-200/70 focus-visible:ring-primary/40`;
  }

  irA(ruta: string): void { this.router.navigateByUrl(ruta); }
  irAPOS(): void          { this.router.navigateByUrl('/pos'); }
  irAInventario(): void   { this.router.navigateByUrl('/inventario'); }
  irAFinanzas(): void     { this.router.navigateByUrl('/finanzas'); }
  irASucursales(): void   { this.router.navigateByUrl('/sucursales'); }

  irASucursal(id: string): void {
    this.sucursalSvc.cambiarSucursal(id);
    this.router.navigateByUrl('/dashboard');
  }
}
