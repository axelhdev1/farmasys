import { Component, computed, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  SucursalService,
  SucursalInput,
  SucursalKpi,
  TerminalSucursal,
} from '../../core/services/sucursal.service';
import { UsuarioApiService, UsuarioBackend } from '../../core/services/usuario-api';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { Sucursal, EstadoSucursal } from '../../core/models/sucursal.model';

type ModoModal = 'crear' | 'editar';

@Component({
  selector: 'app-sucursales',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './sucursales.html',
  styleUrl: './sucursales.scss',
})
export class SucursalesComponent implements OnInit, OnDestroy {
  protected readonly sucursalSvc = inject(SucursalService);
  private   readonly usuarioApi  = inject(UsuarioApiService);
  private   readonly toast       = inject(ToastService);
  private   readonly auth        = inject(AuthService);
  private   readonly router      = inject(Router);

  protected readonly cargando = this.sucursalSvc.cargando;

  /** Usuarios activos (para asignar responsable y mostrar en el detalle). */
  protected readonly usuarios = signal<UsuarioBackend[]>([]);

  // ── Torre de control VIVA (A1) ────────────────────────────────────────
  /** Cada cuánto se refrescan los KPIs (ms). */
  private static readonly REFRESCO_MS = 90_000;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly _actualizado = signal<number>(Date.now());
  /** Late cada 30s solo para recalcular la etiqueta "hace X min". */
  private readonly reloj = signal(0);

  /** Texto discreto de frescura de los datos. */
  protected readonly actualizadoHace = computed<string>(() => {
    this.reloj();
    const min = Math.floor((Date.now() - this._actualizado()) / 60_000);
    if (min <= 0) return 'Actualizado recién';
    return `Actualizado hace ${min} min`;
  });

  private refrescarKpis(): void {
    this.sucursalSvc.cargarKpis();
    this._actualizado.set(Date.now());
  }

  ngOnInit(): void {
    // Carga los KPIs del día por sucursal (ventas, caja, alertas).
    this.refrescarKpis();
    this.usuarioApi.listar(false).subscribe({
      next: (u) => this.usuarios.set(u),
      error: () => this.usuarios.set([]),
    });

    // Un solo timer a 30s: mueve el reloj de la etiqueta y refresca los KPIs
    // cuando toca. Solo con la pestaña visible (no gasta datos en segundo plano).
    this.pollTimer = setInterval(() => {
      this.reloj.update((t) => t + 1);
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - this._actualizado() >= SucursalesComponent.REFRESCO_MS) {
        this.refrescarKpis();
      }
    }, 30_000);
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  /** Usuarios asignados a una sucursal (para el detalle). */
  protected usuariosDe(sucursalId: string): UsuarioBackend[] {
    return this.usuarios().filter((u) => u.sucursalId === sucursalId);
  }

  protected nombreUsuario(u: UsuarioBackend): string {
    return `${u.nombres} ${u.apellidos ?? ''}`.trim();
  }

  // ── Búsqueda / filtro ─────────────────────────────────────────────────
  protected readonly busqueda = signal('');
  /**
   * Grid principal: filtrado y ORDENADO por venta del día (desc). La botica que
   * más vende encabeza; la de menor venta queda al final y se marca en ámbar.
   */
  protected readonly sucursalesFiltradas = computed<Sucursal[]>(() => {
    const q = this.busqueda().toLowerCase().trim();
    const lista = this.sucursalSvc.sucursales();
    const filtradas = !q
      ? [...lista]
      : lista.filter(
          (s) =>
            s.nombre.toLowerCase().includes(q) ||
            (s.distrito ?? '').toLowerCase().includes(q) ||
            this.etiquetaEstado(s.estado).toLowerCase().includes(q),
        );
    return filtradas.sort((a, b) => this.ventaHoyDe(b) - this.ventaHoyDe(a));
  });

  /** Venta del día de una sucursal (0 si aún no llegan los KPIs). */
  protected ventaHoyDe(s: Sucursal): number {
    return Number(this.kpiDe(s.id)?.totalVendido ?? 0);
  }

  /** Ids de la sucursal líder y la de menor venta (solo si hay ventas reales). */
  private readonly extremos = computed<{ lider: string | null; menor: string | null }>(() => {
    // Solo entre boticas operativas y con al menos una venta: marcar a una
    // botica cerrada o sin datos como "peor" sería injusto y confuso.
    const candidatas = this.sucursalesFiltradas().filter(
      (s) => s.estado === 'ACTIVA' && this.ventaHoyDe(s) > 0,
    );
    if (candidatas.length < 2) return { lider: null, menor: null };
    return {
      lider: candidatas[0].id,
      menor: candidatas[candidatas.length - 1].id,
    };
  });

  protected esLider(s: Sucursal): boolean { return this.extremos().lider === s.id; }
  protected esMenor(s: Sucursal): boolean { return this.extremos().menor === s.id; }

  // ── Sparkline 7 días (A2) ─────────────────────────────────────────────
  /** Puntos de la polilínea SVG (viewBox 100x28). '' si no hay serie. */
  protected sparkPuntos(id: string): string {
    const serie = this.kpiDe(id)?.serie7d ?? [];
    if (serie.length < 2) return '';
    const max = Math.max(...serie, 1);
    const W = 100, H = 28, PAD = 3;
    const paso = W / (serie.length - 1);
    return serie
      .map((v, i) => {
        const x = (i * paso).toFixed(1);
        const y = (H - PAD - (v / max) * (H - PAD * 2)).toFixed(1);
        return `${x},${y}`;
      })
      .join(' ');
  }

  /** ¿El último día superó el promedio de los previos? (color del sparkline) */
  protected sparkSube(id: string): boolean {
    const serie = this.kpiDe(id)?.serie7d ?? [];
    if (serie.length < 2) return true;
    const previos = serie.slice(0, -1);
    const prom = previos.reduce((a, b) => a + b, 0) / previos.length;
    return serie[serie.length - 1] >= prom;
  }

  // ── Personal de la sucursal (A5) ──────────────────────────────────────
  /** Nº de usuarios activos: del KPI backend, con el listado local de respaldo. */
  protected personalDe(id: string): number {
    return this.kpiDe(id)?.personalActivo ?? this.usuariosDe(id).length;
  }

  // ── Accesos rápidos por tarjeta (A4) ──────────────────────────────────
  /**
   * Navega a un módulo con la sucursal preseleccionada. Si el usuario puede
   * conmutar (SUPER_ADMIN), además cambia la sucursal activa para que el
   * módulo destino cargue sus datos; el resto ya está fijado por su token.
   */
  private irConSucursal(ruta: string, sucursalId: string): void {
    if (this.auth.tieneAlgunRol('SUPER_ADMIN')) {
      this.sucursalSvc.cambiarSucursal(sucursalId);
    }
    this.router.navigate([ruta], { queryParams: { sucursal: sucursalId } });
  }

  protected irAInventario(s: Sucursal): void     { this.irConSucursal('/inventario', s.id); }
  protected irAVentasHoy(s: Sucursal): void      { this.irConSucursal('/ventas', s.id); }
  protected irATransferencias(s: Sucursal): void { this.irConSucursal('/transferencias', s.id); }

  /** KPI del día de una sucursal (o undefined si aún no cargó). */
  protected kpiDe(id: string): SucursalKpi | undefined {
    return this.sucursalSvc.kpis()[id];
  }

  protected formatSol(n: string | number | undefined): string {
    const v = Number(n ?? 0);
    return `S/ ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Avance del mes vs la meta de venta mensual.
   * Devuelve null si la sucursal no tiene meta configurada (no se muestra barra).
   */
  protected avanceMeta(s: Sucursal): { pct: number; vendido: number; meta: number } | null {
    const meta = s.metaVentaMensual ?? 0;
    if (meta <= 0) return null;
    const vendido = Number(this.kpiDe(s.id)?.totalVendidoMes ?? 0);
    return { pct: Math.min(100, Math.round((vendido / meta) * 100)), vendido, meta };
  }

  /**
   * ¿La botica está dentro de su horario de atención ahora mismo?
   * Soporta turnos que cruzan la medianoche (ej. 22:00 → 06:00).
   */
  protected abiertaAhora(s: Sucursal): boolean {
    const a = s.horarioApertura;
    const c = s.horarioCierre;
    if (!a || !c) return false;
    const aMin = (h: string): number => {
      const [hh, mm] = h.split(':').map(Number);
      return (hh || 0) * 60 + (mm || 0);
    };
    const ahora = new Date();
    const min = ahora.getHours() * 60 + ahora.getMinutes();
    const ini = aMin(a);
    const fin = aMin(c);
    return ini <= fin ? min >= ini && min <= fin : min >= ini || min <= fin;
  }

  /** Solo ADMIN/SUPER_ADMIN gestionan boticas (el backend también lo exige). */
  protected readonly puedeGestionar = computed(() =>
    this.auth.tieneAlgunRol('SUPER_ADMIN', 'ADMIN'),
  );

  // ── Contadores reales (sin KPIs inventados) ───────────────────────────
  protected readonly totalSucursales = computed(() => this.sucursalSvc.sucursales().length);
  protected readonly activas = computed(() =>
    this.sucursalSvc.sucursales().filter((s) => s.estado === 'ACTIVA').length,
  );
  protected readonly enMantenimiento = computed(() =>
    this.sucursalSvc.sucursales().filter((s) => s.estado === 'EN_MANTENIMIENTO').length,
  );
  protected readonly inactivas = computed(() =>
    this.sucursalSvc.sucursales().filter((s) => s.estado === 'INACTIVA').length,
  );

  // ── Modal crear / editar ──────────────────────────────────────────────
  protected readonly modalAbierto = signal(false);
  protected readonly modo         = signal<ModoModal>('crear');
  protected readonly guardando     = signal(false);
  private   readonly idEditando    = signal<string | null>(null);

  protected fNombre       = signal('');
  protected fDistrito     = signal('');
  protected fDireccion    = signal('');
  protected fTelefono     = signal('');
  protected fEstado       = signal<EstadoSucursal>('ACTIVA');
  protected fSerieBoleta  = signal('B001');
  protected fSerieFactura = signal('F001');
  protected fSerieTicket  = signal('T001');
  protected fQrYape       = signal('');
  protected fQrPlin       = signal('');
  protected fResponsableId    = signal('');
  protected fEmail            = signal('');
  protected fHorarioApertura  = signal('');
  protected fHorarioCierre    = signal('');
  protected fMeta             = signal<number | null>(null);

  // ── Ranking de ventas por botica (comparativa) ────────────────────────
  protected readonly ranking = computed(() => {
    const kpis = this.sucursalSvc.kpis();
    return this.sucursalSvc.sucursales()
      .map((s) => ({ sucursal: s, ventas: Number(kpis[s.id]?.totalVendido ?? 0) }))
      .sort((a, b) => b.ventas - a.ventas);
  });
  protected readonly ventaMaxRanking = computed(() =>
    Math.max(...this.ranking().map((r) => r.ventas), 1),
  );
  protected readonly hayVentasRanking = computed(() =>
    this.ranking().some((r) => r.ventas > 0),
  );
  protected barra(ventas: number): number {
    return Math.round((ventas / this.ventaMaxRanking()) * 100);
  }

  // ── Modal detalle (ficha de sucursal) ─────────────────────────────────
  protected readonly detalle = signal<Sucursal | null>(null);
  protected abrirDetalle(s: Sucursal): void { this.detalle.set(s); }
  protected cerrarDetalle(): void { this.detalle.set(null); }

  // ── Modal desactivar ──────────────────────────────────────────────────
  protected readonly modalDesactivar = signal(false);
  protected readonly sucDesactivar   = signal<Sucursal | null>(null);

  // ── Validaciones del form ─────────────────────────────────────────────
  // La letra identifica el tipo de comprobante (B/F/T). Mismo criterio que el
  // backend, para avisar antes de llamar al API.
  protected readonly errorSerieBoleta = computed<string | null>(() => {
    const s = this.fSerieBoleta().trim().toUpperCase();
    if (!s) return 'Requerida';
    return /^B\d{3}$/.test(s) ? null : 'Formato: B + 3 dígitos (ej. B001)';
  });
  protected readonly errorSerieFactura = computed<string | null>(() => {
    const s = this.fSerieFactura().trim().toUpperCase();
    if (!s) return 'Requerida';
    return /^F\d{3}$/.test(s) ? null : 'Formato: F + 3 dígitos (ej. F001)';
  });
  protected readonly errorSerieTicket = computed<string | null>(() => {
    const s = this.fSerieTicket().trim().toUpperCase();
    if (!s) return 'Requerida';
    return /^T\d{3}$/.test(s) ? null : 'Formato: T + 3 dígitos (ej. T001)';
  });
  protected readonly formularioValido = computed<boolean>(() =>
    this.fNombre().trim().length >= 2 &&
    !this.errorSerieBoleta() &&
    !this.errorSerieFactura() &&
    !this.errorSerieTicket(),
  );

  // ── Acciones del modal ────────────────────────────────────────────────
  protected abrirNuevo(): void {
    this.modo.set('crear');
    this.idEditando.set(null);
    this.fNombre.set('');
    this.fDistrito.set('');
    this.fDireccion.set('');
    this.fTelefono.set('');
    this.fEstado.set('ACTIVA');
    this.fSerieBoleta.set('B001');
    this.fSerieFactura.set('F001');
    this.fSerieTicket.set('T001');
    this.fQrYape.set('');
    this.fQrPlin.set('');
    this.fResponsableId.set('');
    this.fEmail.set('');
    this.fHorarioApertura.set('');
    this.fHorarioCierre.set('');
    this.fMeta.set(null);
    this.modalAbierto.set(true);
  }

  protected abrirEdicion(s: Sucursal): void {
    this.modo.set('editar');
    this.idEditando.set(s.id);
    this.fNombre.set(s.nombre);
    this.fDistrito.set(s.distrito ?? '');
    this.fDireccion.set(s.direccion ?? '');
    this.fTelefono.set(s.telefono ?? '');
    this.fEstado.set(s.estado);
    this.fSerieBoleta.set(s.serieBoleta ?? 'B001');
    this.fSerieFactura.set(s.serieFactura ?? 'F001');
    this.fSerieTicket.set(s.serieTicket ?? 'T001');
    this.fQrYape.set(this.qrTexto(s.qrYape));
    this.fQrPlin.set(this.qrTexto(s.qrPlin));
    this.fResponsableId.set(s.responsableId ?? '');
    this.fEmail.set(s.email ?? '');
    this.fHorarioApertura.set(s.horarioApertura ?? '');
    this.fHorarioCierre.set(s.horarioCierre ?? '');
    this.fMeta.set(s.metaVentaMensual ?? null);
    this.modalAbierto.set(true);
  }

  protected cerrarModal(): void {
    this.modalAbierto.set(false);
    this.idEditando.set(null);
  }

  // ── Terminales / cajones físicos (C8) ─────────────────────────────────
  protected readonly modalTerminales = signal(false);
  protected readonly sucTerminales   = signal<Sucursal | null>(null);
  protected readonly terminales      = signal<TerminalSucursal[]>([]);
  protected readonly cargandoTerm    = signal(false);
  protected fNuevoTerminal           = signal('');

  protected abrirTerminales(s: Sucursal): void {
    this.sucTerminales.set(s);
    this.fNuevoTerminal.set('');
    this.modalTerminales.set(true);
    this.recargarTerminales();
  }

  protected cerrarTerminales(): void {
    this.modalTerminales.set(false);
    this.sucTerminales.set(null);
    this.terminales.set([]);
  }

  private recargarTerminales(): void {
    const s = this.sucTerminales();
    if (!s) return;
    this.cargandoTerm.set(true);
    this.sucursalSvc.terminalesDe(s.id).subscribe({
      next: (t) => { this.terminales.set(t); this.cargandoTerm.set(false); },
      error: () => { this.terminales.set([]); this.cargandoTerm.set(false); },
    });
  }

  /** Sugiere el siguiente nombre libre (CAJA-01, CAJA-02…). */
  protected readonly siguienteTerminal = computed<string>(() => {
    const nums = this.terminales()
      .map((t) => Number(t.nombre.replace(/\D/g, '')))
      .filter((n) => !Number.isNaN(n));
    const siguiente = (nums.length ? Math.max(...nums) : 0) + 1;
    return `CAJA-${String(siguiente).padStart(2, '0')}`;
  });

  protected agregarTerminal(): void {
    const s = this.sucTerminales();
    if (!s) return;
    const nombre = (this.fNuevoTerminal().trim() || this.siguienteTerminal()).toUpperCase();
    if (!/^CAJA-\d{2}$/.test(nombre)) {
      this.toast.aviso('Formato de terminal: CAJA-01, CAJA-02, …');
      return;
    }
    this.sucursalSvc.crearTerminal(s.id, nombre).subscribe({
      next: () => {
        this.toast.exito(`Terminal ${nombre} creado`);
        this.fNuevoTerminal.set('');
        this.recargarTerminales();
      },
      error: (e) => this.toast.error(e.error?.message ?? 'No se pudo crear el terminal'),
    });
  }

  protected alternarTerminal(t: TerminalSucursal): void {
    this.sucursalSvc.actualizarTerminal(t.id, { activo: !(t.activo ?? true) }).subscribe({
      next: () => {
        this.toast.exito(`Terminal ${t.nombre} ${t.activo === false ? 'activado' : 'desactivado'}`);
        this.recargarTerminales();
      },
      error: (e) => this.toast.error(e.error?.message ?? 'No se pudo actualizar el terminal'),
    });
  }

  // ── Wizard de apertura (A7) ───────────────────────────────────────────
  protected readonly wizardAbierto  = signal(false);
  protected readonly sucursalNueva  = signal<{ id: string; nombre: string } | null>(null);

  protected cerrarWizard(): void {
    this.wizardAbierto.set(false);
    this.sucursalNueva.set(null);
  }

  /** Abastecer trayendo stock de otra botica. */
  protected wizardTransferir(): void {
    const s = this.sucursalNueva();
    this.cerrarWizard();
    if (s) this.irConSucursal('/transferencias', s.id);
  }

  /** Abastecer cargando el stock físico inicial. */
  protected wizardConteo(): void {
    const s = this.sucursalNueva();
    this.cerrarWizard();
    if (s) this.irConSucursal('/inventario-fisico', s.id);
  }

  protected guardar(): void {
    if (!this.formularioValido()) {
      this.toast.aviso('Revisa los campos del formulario');
      return;
    }
    const datos: SucursalInput = {
      nombre: this.fNombre().trim(),
      distrito: this.fDistrito().trim() || undefined,
      direccion: this.fDireccion().trim() || undefined,
      telefono: this.fTelefono().trim() || undefined,
      estado: this.fEstado(),
      serieBoleta: this.fSerieBoleta().trim().toUpperCase(),
      serieFactura: this.fSerieFactura().trim().toUpperCase(),
      serieTicket: this.fSerieTicket().trim().toUpperCase(),
      qrYape: this.fQrYape().trim() || undefined,
      qrPlin: this.fQrPlin().trim() || undefined,
      responsableId: this.fResponsableId() || undefined,
      email: this.fEmail().trim() || undefined,
      horarioApertura: this.fHorarioApertura().trim() || undefined,
      horarioCierre: this.fHorarioCierre().trim() || undefined,
      metaVentaMensual: this.fMeta() ?? undefined,
    };

    this.guardando.set(true);
    const id = this.idEditando();
    const op = id
      ? this.sucursalSvc.actualizarSucursal(id, datos)
      : this.sucursalSvc.crearSucursal(datos);

    op.subscribe({
      next: (creada) => {
        this.guardando.set(false);
        this.toast.exito(id ? 'Sucursal actualizada' : `Sucursal ${datos.nombre} creada`);
        this.cerrarModal();
        // Apertura: una botica nueva nace con stock en 0. En vez de dejar al
        // usuario en un inventario vacío sin saber qué hacer, le ofrecemos las
        // dos vías reales de abastecerla.
        if (!id) {
          this.sucursalNueva.set({ id: creada.id, nombre: creada.nombre });
          this.wizardAbierto.set(true);
        }
      },
      error: (e) => {
        this.guardando.set(false);
        this.toast.error(e.error?.message ?? e.message ?? 'No se pudo guardar la sucursal');
      },
    });
  }

  // ── Desactivar / reactivar ────────────────────────────────────────────
  protected pedirDesactivar(s: Sucursal): void {
    this.sucDesactivar.set(s);
    this.modalDesactivar.set(true);
  }

  protected cancelarDesactivar(): void {
    this.modalDesactivar.set(false);
    this.sucDesactivar.set(null);
  }

  protected confirmarDesactivar(): void {
    const s = this.sucDesactivar();
    if (!s) return;
    this.sucursalSvc.desactivarSucursal(s.id).subscribe({
      next: () => {
        this.toast.aviso(`${s.nombre} desactivada`);
        this.cancelarDesactivar();
      },
      error: (e) => this.toast.error(e.error?.message ?? e.message ?? 'No se pudo desactivar'),
    });
  }

  protected reactivar(s: Sucursal): void {
    this.sucursalSvc.reactivarSucursal(s.id).subscribe({
      next: () => this.toast.exito(`${s.nombre} reactivada`),
      error: (e) => this.toast.error(e.error?.message ?? e.message ?? 'No se pudo reactivar'),
    });
  }

  protected irSucursal(id: string): void {
    this.sucursalSvc.cambiarSucursal(id);
  }

  /**
   * El QR puede venir del backend como string (URL/celular) o, en el modelo del
   * front, como objeto PagoQR. Normaliza a texto para el input del form.
   */
  private qrTexto(qr: unknown): string {
    if (!qr) return '';
    if (typeof qr === 'string') return qr;
    const obj = qr as { imagenUrl?: string; celular?: string };
    return obj.imagenUrl ?? obj.celular ?? '';
  }

  // ── Helpers de presentación ───────────────────────────────────────────
  protected etiquetaEstado(e: EstadoSucursal): string {
    return { ACTIVA: 'Activa', INACTIVA: 'Inactiva', EN_MANTENIMIENTO: 'En mantenimiento' }[e];
  }

  protected clasesEstado(e: EstadoSucursal): string {
    return {
      ACTIVA:           'bg-emerald-50 text-emerald-700',
      INACTIVA:         'bg-red-50 text-red-600',
      EN_MANTENIMIENTO: 'bg-amber-50 text-amber-600',
    }[e];
  }

  protected iconoEstado(e: EstadoSucursal): string {
    return { ACTIVA: 'check_circle', INACTIVA: 'cancel', EN_MANTENIMIENTO: 'build' }[e];
  }

  protected esActiva(s: Sucursal): boolean {
    return this.sucursalSvc.sucursalActivaId() === s.id;
  }

  /** Fecha de apertura legible (dd/mm/yyyy) o "—" si no hay. */
  protected fechaApertura(iso: string | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
