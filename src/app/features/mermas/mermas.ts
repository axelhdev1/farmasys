import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { SucursalService } from '../../core/services/sucursal.service';
import { ToastService } from '../../core/services/toast.service';
import {
  MermaService,
  LoteParaBaja,
  MermaRow,
  CategoriaMerma,
} from '../../core/services/merma.service';

interface OpcionCategoria {
  valor: CategoriaMerma;
  label: string;
  icono: string;
}

@Component({
  selector: 'app-mermas',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './mermas.html',
})
export class MermasComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  /** Sucursal ACTIVA del header: con multi-botica, la del token no basta. */
  private readonly sucursalSvc = inject(SucursalService);
  private readonly toast = inject(ToastService);
  private readonly svc   = inject(MermaService);

  protected readonly puedeDarBaja = computed(() =>
    this.auth.tieneAlgunRol('SUPER_ADMIN', 'ADMIN', 'ALMACENERO', 'FARMACEUTICO'),
  );

  protected readonly categorias: OpcionCategoria[] = [
    { valor: 'VENCIDO', label: 'Vencido', icono: 'event_busy' },
    { valor: 'DANADO', label: 'Dañado / roto', icono: 'broken_image' },
    { valor: 'ROBO', label: 'Robo / pérdida', icono: 'gpp_bad' },
    { valor: 'MUESTRA', label: 'Muestra médica', icono: 'vaccines' },
    { valor: 'OTRO', label: 'Otro', icono: 'more_horiz' },
  ];

  // ── Estado ────────────────────────────────────────────────────────────
  protected dias        = signal(30);
  protected cargando    = signal(false);
  protected lotes       = signal<LoteParaBaja[]>([]);
  protected mermas      = signal<MermaRow[]>([]);
  protected valorTotal  = signal(0);
  protected unidadesTot = signal(0);

  protected readonly vencidos  = computed(() => this.lotes().filter((l) => l.estado === 'VENCIDO'));
  protected readonly porVencer = computed(() => this.lotes().filter((l) => l.estado === 'POR_VENCER'));

  protected readonly kpiVencidos = computed(() =>
    this.vencidos().reduce((s, l) => s + l.cantidadBase, 0),
  );

  // ── Modal de baja ─────────────────────────────────────────────────────
  protected mostrarBaja = signal(false);
  protected loteSel     = signal<LoteParaBaja | null>(null);
  protected categoria   = signal<CategoriaMerma>('VENCIDO');
  protected nota        = signal('');
  protected cantidad    = signal(0);
  protected dando       = signal(false);

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    const sid = this.sucursalSvc.sucursalActivaId() ?? this.auth.usuario()?.sucursalActualId;
    if (!sid) { this.toast.aviso('Selecciona una sucursal'); return; }
    this.cargando.set(true);
    this.svc.lotesParaBaja(sid, this.dias()).subscribe({
      next: (rows) => { this.lotes.set(rows ?? []); this.cargando.set(false); },
      error: (e) => { this.lotes.set([]); this.cargando.set(false); this.toast.error('No se pudo cargar: ' + e.message); },
    });
    this.svc.historial(sid, 90).subscribe({
      next: (h) => { this.mermas.set(h.items ?? []); this.valorTotal.set(h.valorTotal ?? 0); this.unidadesTot.set(h.unidadesTotal ?? 0); },
      error: () => { this.mermas.set([]); this.valorTotal.set(0); this.unidadesTot.set(0); },
    });
  }

  cambiarDias(d: number): void { this.dias.set(d); this.cargar(); }

  // ── Baja ──────────────────────────────────────────────────────────────
  abrirBaja(l: LoteParaBaja): void {
    if (!this.puedeDarBaja()) { this.toast.aviso('No tienes permiso para dar de baja'); return; }
    this.loteSel.set(l);
    this.categoria.set(l.estado === 'VENCIDO' ? 'VENCIDO' : 'DANADO');
    this.nota.set('');
    this.cantidad.set(l.cantidadBase);
    this.mostrarBaja.set(true);
  }

  cerrarBaja(): void { this.mostrarBaja.set(false); this.loteSel.set(null); }

  setCantidad(valor: number): void {
    const max = this.loteSel()?.cantidadBase ?? 0;
    this.cantidad.set(Math.max(1, Math.min(Math.floor(valor || 0), max)));
  }

  confirmarBaja(): void {
    const l = this.loteSel();
    if (!l) return;
    const cant = this.cantidad();
    if (cant < 1 || cant > l.cantidadBase) { this.toast.aviso('Cantidad inválida'); return; }
    this.dando.set(true);
    this.svc.darDeBaja(l.id, {
      categoria: this.categoria(),
      nota: this.nota().trim() || undefined,
      cantidadBase: cant,
    }).subscribe({
      next: (r) => {
        this.dando.set(false);
        this.toast.exito(`Baja registrada · ${r.dadoDeBaja} u. retiradas`);
        this.cerrarBaja();
        this.cargar();
      },
      error: (e) => {
        this.dando.set(false);
        this.toast.error(e.message ?? 'No se pudo registrar la baja');
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  formatSol(n: number): string {
    return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatFecha(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatFechaHora(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  diasTexto(l: LoteParaBaja): string {
    if (l.diasRestantes < 0) return `Vencido hace ${Math.abs(l.diasRestantes)} d`;
    if (l.diasRestantes === 0) return 'Vence hoy';
    return `Vence en ${l.diasRestantes} d`;
  }

  tipoLabel(tipo: string): string {
    return tipo === 'BAJA_VENCIMIENTO' ? 'Vencimiento' : 'Merma';
  }
}
