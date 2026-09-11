import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ReposicionService, ReposicionRow } from '../../core/services/reposicion.service';
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
  private readonly sucursal = inject(SucursalService);
  private readonly toast    = inject(ToastService);
  private readonly router   = inject(Router);

  protected readonly cargando = signal(false);
  protected readonly filas    = signal<ReposicionRow[]>([]);
  protected readonly dias     = signal(30);
  protected readonly busqueda = signal('');

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

  setDias(d: number): void { this.dias.set(d); this.cargar(); }

  irAComprar(): void { this.router.navigateByUrl('/compras'); }

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
