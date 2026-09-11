import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SucursalService } from '../../core/services/sucursal.service';
import { ComprobanteService } from '../pos/comprobante.service';
import {
  CajaService,
  ReporteZBackend,
  TerminalCaja,
  MiCajaAbierta,
} from '../../core/services/caja.service';
import { ToastService } from '../../core/services/toast.service';
import { CajaSesion, TipoMovimientoCaja, CategoriaMovimientoCaja } from '../../core/models/caja.model';

// El terminal ya NO es una constante: se elige del catálogo de la sucursal
// (model Terminal). Un cajón físico = una sesión de caja.

interface OpcionCategoria {
  valor: CategoriaMovimientoCaja;
  label: string;
  tipo: TipoMovimientoCaja;
}

/**
 * Caja — apertura, panel en vivo y cierre (arqueo) del turno del cajero.
 * Consume CajaService (persistente en localStorage).
 */
@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [FormsModule, DecimalPipe, DatePipe],
  templateUrl: './caja.html',
})
export class CajaComponent {
  private readonly auth        = inject(AuthService);
  private readonly sucursalSvc = inject(SucursalService);
  private readonly cajaSvc     = inject(CajaService);
  private readonly toast       = inject(ToastService);
  private readonly router      = inject(Router);
  /** Impresión por iframe oculto (el mismo camino que el ticket del POS). */
  private readonly comprobante = inject(ComprobanteService);

  // ── Identidad ────────────────────────────────────────────────────────
  private readonly cajeroId   = computed(() => this.auth.usuario()?.id ?? 'desconocido');
  protected readonly cajeroNombre = computed(() => {
    const u = this.auth.usuario();
    return u ? `${u.nombres} ${u.apellidos}`.trim() : 'Cajero';
  });
  private readonly sucursalId = computed(() => this.sucursalSvc.sucursalActivaId());
  protected readonly sucursalNombre = computed(() => this.sucursalSvc.sucursalActiva()?.nombre ?? '—');

  // ── Caja activa + totales en vivo (del backend, vía signals) ───────────
  protected readonly caja = computed<CajaSesion | null>(() => this.cajaSvc.cajaActivaSig());
  protected readonly totales = computed(() => this.cajaSvc.totalesSig());

  /** Cierres recientes de esta sucursal (histórico real). */
  protected readonly historial = computed(() => this.cajaSvc.historialSig());

  // ── Apertura ───────────────────────────────────────────────────────────
  protected montoInicial = signal<number | null>(null);

  /** Fondos de sencillo habituales en botica (atajo de apertura). */
  protected readonly montosRapidos = [50, 100, 200];

  /** Terminales (cajones) de la sucursal, con ocupación y último cierre. */
  protected readonly terminales = signal<TerminalCaja[]>([]);
  protected readonly terminalSel = signal<string>('');
  protected readonly cargandoTerminales = signal(false);

  /** Terminal elegido (para mostrar su último cierre y si está ocupado). */
  protected readonly terminalActual = computed<TerminalCaja | undefined>(() =>
    this.terminales().find((t) => t.nombre === this.terminalSel()),
  );

  constructor() {
    // Carga los terminales cuando cambia la sucursal y no hay caja abierta
    // (la pantalla de apertura es la única que los necesita).
    effect(() => {
      const sid = this.sucursalId();
      if (!sid || this.caja()) return;
      this.cargarTerminales();
      // ¿Tengo una caja abierta en otra botica que me esté bloqueando?
      this.verificarCajaEnOtraSucursal();
    });
  }

  /**
   * Mi caja abierta en OTRA sucursal. Solo puedo tener una a la vez, así que si
   * quedó abierta en otra botica hay que mostrármela para cerrarla; si no, el
   * sistema me bloquea sin darme salida.
   */
  protected readonly cajaEnOtraSucursal = signal<MiCajaAbierta | null>(null);

  private verificarCajaEnOtraSucursal(): void {
    this.cajaSvc.miCajaAbierta().subscribe({
      next: (mia) => {
        const esDeOtra = !!mia && mia.sucursalId !== this.sucursalId();
        this.cajaEnOtraSucursal.set(esDeOtra ? mia : null);
      },
      error: () => this.cajaEnOtraSucursal.set(null),
    });
  }

  /** Cierra la caja que quedó abierta en otra sucursal (arqueo con su monto). */
  cerrarCajaDeOtraSucursal(): void {
    const mia = this.cajaEnOtraSucursal();
    if (!mia) return;
    // El modal de arqueo lee totalesSig: hay que cargar el resumen de ESA caja,
    // que no es la de la sucursal activa.
    this.cajaSvc.cargarResumenDe(mia.id);
    this.cajaACerrar.set(mia.id);
    this.efectivoContado.set(null);
    this.mostrarCierre.set(true);
  }

  private cargarTerminales(): void {
    this.cargandoTerminales.set(true);
    this.cajaSvc.terminales().subscribe({
      next: (lista) => {
        this.terminales.set(lista);
        // Preselecciona el primer terminal LIBRE (si todos están ocupados,
        // no se elige ninguno y el botón queda bloqueado).
        const libre = lista.find((t) => !t.ocupado);
        this.terminalSel.set(libre?.nombre ?? '');
        this.cargandoTerminales.set(false);
      },
      error: () => {
        this.terminales.set([]);
        this.terminalSel.set('');
        this.cargandoTerminales.set(false);
      },
    });
  }

  /**
   * Etiqueta del terminal en el selector. Si está ocupado muestra POR QUIÉN y
   * DESDE CUÁNDO: "ocupado por María Quispe (desde 21/6)" delata al instante
   * una caja que quedó abierta hace días.
   */
  protected etiquetaTerminal(t: TerminalCaja): string {
    if (!t.ocupado) return ' — libre';
    const quien = t.ocupadoPor ?? 'otro cajero';
    if (!t.ocupadoDesde) return ` — ocupado por ${quien}`;
    const desde = new Date(t.ocupadoDesde).toLocaleDateString('es-PE', {
      day: 'numeric',
      month: 'numeric',
    });
    return ` — ocupado por ${quien} (desde ${desde})`;
  }

  /** Primer terminal ocupado hace 1+ días: candidato a caja olvidada. */
  protected readonly terminalHuerfano = computed<TerminalCaja | undefined>(() =>
    this.terminales().find((t) => t.ocupado && t.diasOcupado >= 1),
  );

  /** Relevo de turno: usa el efectivo del último cierre como fondo inicial. */
  usarFondoSugerido(): void {
    const cierre = this.terminalActual()?.ultimoCierre;
    if (!cierre?.efectivoContado) return;
    this.montoInicial.set(Number(cierre.efectivoContado));
  }

  abrirCaja(): void {
    const monto = this.montoInicial();
    const terminal = this.terminalSel();
    if (!terminal) {
      this.toast.error('Elige un terminal disponible');
      return;
    }
    if (monto === null || monto < 0) {
      this.toast.error('Ingresa un monto inicial válido');
      return;
    }
    this.cajaSvc.abrir({ terminal, montoInicial: monto }).subscribe({
      next: () => {
        this.montoInicial.set(null);
        this.toast.exito('Caja abierta');
      },
      error: (e) => {
        // El backend explica el motivo (terminal ocupado, caja abierta en otra
        // botica…): mostrarlo tal cual y refrescar la ocupación.
        this.toast.error(e.error?.message ?? e.message ?? 'No se pudo abrir la caja');
        this.cargarTerminales();
      },
    });
  }

  // ── Movimientos (ingreso / egreso) ─────────────────────────────────────
  protected mostrarMovimiento = signal(false);
  protected movTipo      = signal<TipoMovimientoCaja>('EGRESO');
  protected movCategoria = signal<CategoriaMovimientoCaja>('GASTO');
  protected movMonto     = signal<number | null>(null);
  protected movMotivo    = signal<string>('');

  protected readonly categorias: OpcionCategoria[] = [
    { valor: 'APORTE_SENCILLO', label: 'Aporte de sencillo', tipo: 'INGRESO' },
    { valor: 'AJUSTE_INGRESO',  label: 'Ingreso / ajuste',   tipo: 'INGRESO' },
    { valor: 'RETIRO',          label: 'Retiro a bóveda',    tipo: 'EGRESO' },
    { valor: 'PAGO_PROVEEDOR',  label: 'Pago a proveedor',   tipo: 'EGRESO' },
    { valor: 'GASTO',           label: 'Gasto menor',        tipo: 'EGRESO' },
    { valor: 'VUELTO',          label: 'Vuelto / sencillo',  tipo: 'EGRESO' },
  ];

  protected readonly categoriasFiltradas = computed(() =>
    this.categorias.filter(c => c.tipo === this.movTipo())
  );

  abrirModalMovimiento(tipo: TipoMovimientoCaja): void {
    this.movTipo.set(tipo);
    this.movCategoria.set(this.categorias.find(c => c.tipo === tipo)!.valor);
    this.movMonto.set(null);
    this.movMotivo.set('');
    this.mostrarMovimiento.set(true);
  }

  cancelarMovimiento(): void { this.mostrarMovimiento.set(false); }

  registrarMovimiento(): void {
    const c = this.caja();
    if (!c) return;
    const monto = this.movMonto();
    if (monto === null || monto <= 0) { this.toast.error('Monto inválido'); return; }
    if (!this.movMotivo().trim())     { this.toast.error('El motivo es obligatorio'); return; }

    this.cajaSvc.registrarMovimiento(c.id, {
      tipo: this.movTipo(),
      categoria: this.movCategoria(),
      monto,
      motivo: this.movMotivo(),
    }).subscribe({
      next: () => {
        this.mostrarMovimiento.set(false);
        this.toast.exito('Movimiento registrado');
      },
      error: (e) => this.toast.error(e.message ?? 'No se pudo registrar'),
    });
  }

  // ── Cierre (arqueo) ────────────────────────────────────────────────────
  protected mostrarCierre = signal(false);
  protected efectivoContado = signal<number | null>(null);
  /**
   * Id de la caja a cerrar. Normalmente es la de esta sucursal, pero puede ser
   * una que quedó abierta en OTRA botica (ver cajaEnOtraSucursal).
   */
  protected readonly cajaACerrar = signal<string | null>(null);

  abrirModalCierre(): void {
    this.cajaACerrar.set(this.caja()?.id ?? null);
    this.efectivoContado.set(null);
    this.mostrarCierre.set(true);
  }
  cancelarCierre(): void {
    this.mostrarCierre.set(false);
    this.cajaACerrar.set(null);
  }

  /**
   * Fondo inicial a mostrar en el arqueo. Cae a la caja de otra sucursal
   * cuando se está cerrando esa (caja() local es null en ese caso).
   */
  protected readonly montoInicialCierre = computed<number>(() =>
    Number(this.caja()?.montoInicial ?? this.cajaEnOtraSucursal()?.montoInicial ?? 0),
  );

  /** Diferencia previsualizada en el modal de cierre. */
  protected readonly diferenciaPrevia = computed(() => {
    const t = this.totales();
    const contado = this.efectivoContado();
    if (!t || contado === null) return null;
    return Math.round((contado - t.efectivoEsperado) * 100) / 100;
  });

  confirmarCierre(): void {
    // Puede ser la caja de esta sucursal o la que quedó abierta en otra.
    const cajaId = this.cajaACerrar() ?? this.caja()?.id ?? null;
    const contado = this.efectivoContado();
    if (!cajaId || contado === null || contado < 0) {
      this.toast.error('Ingresa el efectivo contado');
      return;
    }
    this.cajaSvc.cerrar(cajaId, contado).subscribe({
      next: (cerrada) => {
        this.mostrarCierre.set(false);
        this.cajaACerrar.set(null);
        const dif = Number(cerrada.diferencia ?? 0);
        if (dif === 0)      this.toast.exito('Caja cerrada y cuadrada');
        else if (dif < 0)   this.toast.error(`Caja cerrada · faltante S/ ${Math.abs(dif).toFixed(2)}`);
        else                this.toast.aviso(`Caja cerrada · sobrante S/ ${dif.toFixed(2)}`);
        this.imprimirZ(cajaId); // imprime el reporte Z del cierre
        // Al cerrar la de otra sucursal, ya puede abrir aquí.
        this.verificarCajaEnOtraSucursal();
        this.cargarTerminales();
      },
      error: (e) => this.toast.error(e.error?.message ?? e.message ?? 'No se pudo cerrar la caja'),
    });
  }

  irAPOS(): void { this.router.navigateByUrl('/pos'); }

  // ── Reporte Z (imprimible) ─────────────────────────────────────────────
  imprimirZ(cajaId: string): void {
    this.cajaSvc.reporteZ(cajaId).subscribe({
      next: (z) => this.renderZ(z),
      error: (e) => this.toast.error(e.message ?? 'No se pudo generar el Z'),
    });
  }

  private renderZ(z: ReporteZBackend): void {
    // Se imprime por IFRAME OCULTO, no con window.open: los bloqueadores de
    // ventanas emergentes venían matando el Z justo al cerrar turno, que es
    // cuando el cajero necesita el papel para entregar con el efectivo.
    const n = (v: string | number | null | undefined) => 'S/ ' + Number(v ?? 0).toFixed(2);
    const dt = (v: string | null) =>
      v ? new Date(v).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const pm = z.porMetodo || {};
    const metodos: Array<[string, string]> = [
      ['Efectivo', 'EFECTIVO'], ['Tarjeta', 'TARJETA'], ['Yape/Plin', 'YAPE_PLIN'], ['Transferencia', 'TRANSFERENCIA'], ['Mixto', 'MIXTO'],
    ];
    const metodoRows = metodos
      .filter(([, k]) => Number(pm[k] ?? 0) > 0)
      .map(([lbl, k]) => `<div class="row"><span>${lbl}</span><span>${n(pm[k])}</span></div>`)
      .join('') || '<div class="row small"><span>Sin ventas</span><span></span></div>';
    const movRows = (z.movimientos || [])
      .map((m) => `<div class="row small"><span>${m.tipo === 'INGRESO' ? '+' : '−'} ${m.categoria}</span><span>${n(m.monto)}</span></div>`)
      .join('');
    const dif = Number(z.diferencia ?? 0);
    const difLabel = z.efectivoContado == null ? '' :
      `<div class="row bold"><span>Diferencia</span><span style="color:${dif < 0 ? '#dc2626' : dif > 0 ? '#d97706' : '#059669'}">${n(dif)}</span></div>`;
    const html = `<html><head><title>Reporte Z</title><style>
      *{font-family:'Courier New',monospace;box-sizing:border-box}
      body{width:300px;margin:0 auto;padding:12px;color:#111;font-size:12px}
      h2{text-align:center;margin:0;font-size:14px}.c{text-align:center}
      .hr{border-top:1px dashed #999;margin:8px 0}
      .row{display:flex;justify-content:space-between;margin:2px 0}
      .small{font-size:11px;color:#444}.bold{font-weight:bold}.tot{font-size:14px;font-weight:bold}</style></head><body>
      <h2>REPORTE Z · CIERRE DE CAJA</h2>
      <div class="c small">${z.sucursal}</div>
      <div class="hr"></div>
      <div class="row small"><span>Cajero</span><span>${z.cajero}</span></div>
      <div class="row small"><span>Terminal</span><span>${z.terminal}</span></div>
      <div class="row small"><span>Apertura</span><span>${dt(z.aperturaEn)}</span></div>
      <div class="row small"><span>Cierre</span><span>${dt(z.cerradaEn)}</span></div>
      <div class="hr"></div>
      <div class="row"><span>Ventas (tickets)</span><span>${z.tickets}</span></div>
      <div class="row"><span>Anuladas</span><span>${z.anuladas ?? 0}</span></div>
      <div class="hr"></div>
      <div class="bold c">VENTAS POR MÉTODO</div>
      ${metodoRows}
      <div class="row tot"><span>Total vendido</span><span>${n(z.totalVendido)}</span></div>
      <div class="hr"></div>
      <div class="bold c">ARQUEO DE EFECTIVO</div>
      <div class="row"><span>Monto inicial</span><span>${n(z.montoInicial)}</span></div>
      <div class="row"><span>Ventas efectivo</span><span>${n(pm['EFECTIVO'])}</span></div>
      <div class="row"><span>+ Ingresos</span><span>${n(z.ingresos)}</span></div>
      <div class="row"><span>− Egresos</span><span>${n(z.egresos)}</span></div>
      <div class="row bold"><span>Efectivo esperado</span><span>${n(z.efectivoEsperado)}</span></div>
      ${z.efectivoContado != null ? `<div class="row"><span>Efectivo contado</span><span>${n(z.efectivoContado)}</span></div>` : ''}
      ${difLabel}
      ${movRows ? `<div class="hr"></div><div class="bold c">MOVIMIENTOS</div>${movRows}` : ''}
      <div class="hr"></div>
      <div class="c small">Impreso ${dt(new Date().toISOString())}</div>
      </body></html>`;
    // El iframe dispara print() por su cuenta (ver ComprobanteService): el
    // ticket ya no necesita su propio <script> de auto-impresión.
    this.comprobante.imprimir(html);
  }

  // ── Helpers de plantilla ──────────────────────────────────────────────
  labelCategoria(valor: CategoriaMovimientoCaja): string {
    return this.categorias.find(c => c.valor === valor)?.label ?? valor;
  }
}
