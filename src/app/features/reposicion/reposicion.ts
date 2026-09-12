import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ReposicionService, ReposicionRow } from '../../core/services/reposicion.service';
import { IaService, AnalisisIA, EstadoRespuestaIA } from '../../core/services/ia.service';
import { SucursalService } from '../../core/services/sucursal.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-reposicion',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './reposicion.html',
})
export class ReposicionComponent implements OnInit {
  private readonly repo     = inject(ReposicionService);
  private readonly ia       = inject(IaService);
  private readonly sucursal = inject(SucursalService);
  private readonly toast    = inject(ToastService);
  private readonly router   = inject(Router);

  protected readonly cargando = signal(false);
  protected readonly filas    = signal<ReposicionRow[]>([]);
  protected readonly dias     = signal(30);
  protected readonly busqueda = signal('');

  // ── Estado del análisis con IA ──────────────────────────────────────────
  protected readonly analizando = signal(false);
  protected readonly analisis   = signal<AnalisisIA | null>(null);
  protected readonly estadoIa   = signal<EstadoRespuestaIA | null>(null);

  protected readonly filtradas = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    const lista = this.filas();
    if (!q) return lista;
    return lista.filter(
      (f) =>
        (f.producto?.nombre ?? '').toLowerCase().includes(q) ||
        (f.producto?.codigo ?? '').toLowerCase().includes(q),
    );
  });

  protected readonly criticos = computed(() =>
    this.filas().filter((f) => f.diasCobertura !== null && f.diasCobertura <= 7).length,
  );
  protected readonly totalItems = computed(() => this.filas().length);

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    const sid = this.sucursal.sucursalActivaId();
    if (!sid) return;
    this.cargando.set(true);
    this.repo.listar(sid, this.dias(), 30).subscribe({
      next: (rows) => { this.filas.set(rows); this.cargando.set(false); },
      error: (e) => {
        this.cargando.set(false);
        this.toast.error('No se pudo calcular la reposición: ' + (e.error?.message ?? e.message));
      },
    });
  }

  /**
   * Pide al backend el plan de compra. La respuesta trae TAMBIÉN la tabla, así
   * que se aprovecha para refrescarla: una sola llamada, no dos.
   *
   * Si el análisis no está disponible (sin clave, proveedor caído), el endpoint
   * devuelve la tabla igual y aquí solo se avisa. La pantalla nunca se rompe
   * porque la IA no conteste.
   */
  analizarConIA(): void {
    const sid = this.sucursal.sucursalActivaId();
    if (!sid || this.analizando()) return;
    this.analizando.set(true);
    this.ia.analizarReposicion(sid, this.dias(), 30).subscribe({
      next: (r) => {
        this.analizando.set(false);
        this.estadoIa.set(r.ia);
        this.analisis.set(r.analisis);
        if (r.filas?.length) this.filas.set(r.filas);
        if (!r.analisis) {
          this.toast.aviso(r.ia.detalle ?? 'El análisis con IA no está disponible ahora.');
        } else if (r.ia.enCache) {
          this.toast.info('Análisis recuperado de caché.');
        }
      },
      error: (e) => {
        this.analizando.set(false);
        this.toast.error('No se pudo analizar: ' + (e.error?.message ?? e.message));
      },
    });
  }

  protected cerrarAnalisis(): void {
    this.analisis.set(null);
    this.estadoIa.set(null);
  }

  /** Cambiar la ventana invalida el análisis: era sobre otros números. */
  setDias(d: number): void {
    this.dias.set(d);
    this.cerrarAnalisis();
    this.cargar();
  }

  irAComprar(): void { this.router.navigateByUrl('/compras'); }

  /** Nombre del producto a partir del código, para pintar los chips del grupo. */
  protected nombrePorCodigo(codigo: string): string {
    return this.filas().find((f) => f.producto?.codigo === codigo)?.producto?.nombre ?? codigo;
  }

  /** Color según urgencia (días de cobertura restantes). */
  protected claseCobertura(f: ReposicionRow): string {
    if (f.diasCobertura === null) return 'text-text-secondary';
    if (f.diasCobertura <= 7) return 'text-accent-red-ink font-black';
    if (f.diasCobertura <= 15) return 'text-accent-orange-ink font-bold';
    return 'text-text-main';
  }

  protected coberturaTexto(f: ReposicionRow): string {
    if (f.diasCobertura === null) return 'Sin rotación';
    return `${f.diasCobertura} días`;
  }

  protected unidad(f: ReposicionRow): string {
    return f.producto?.unidadBase ?? 'und';
  }
}
