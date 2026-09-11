import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { SucursalService } from '../../core/services/sucursal.service';
import { ToastService } from '../../core/services/toast.service';
import { InventarioApiService } from '../../core/services/inventario-api';
import {
  TransferenciaService,
  SucursalMin,
  TransferenciaBackend,
} from '../../core/services/transferencia.service';

interface ProdOrigen {
  productoId: string;
  nombre: string;
  codigo: string;
  disponible: number; // vendible en el origen (suma de lotes vigentes)
}

interface LineaTransfer {
  productoId: string;
  nombre: string;
  disponible: number;
  cantidad: number;
}

@Component({
  selector: 'app-transferencias',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './transferencias.html',
})
export class TransferenciasComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  /** Sucursal ACTIVA del header: con multi-botica, la del token no basta. */
  private readonly sucursalSvc = inject(SucursalService);
  private readonly toast = inject(ToastService);
  private readonly svc   = inject(TransferenciaService);
  private readonly invApi = inject(InventarioApiService);

  protected sucursales = signal<SucursalMin[]>([]);
  protected origenId   = signal('');
  protected destinoId  = signal('');
  protected motivo     = signal('');

  protected prodOrigen = signal<ProdOrigen[]>([]);
  protected cargandoOrigen = signal(false);
  protected busqueda   = signal('');
  protected lineas     = signal<LineaTransfer[]>([]);
  protected enviando   = signal(false);

  protected historial  = signal<TransferenciaBackend[]>([]);

  protected readonly destinos = computed(() =>
    this.sucursales().filter((s) => s.id !== this.origenId()),
  );

  protected readonly sugerencias = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    if (q.length < 2) return [];
    const yaAgregados = new Set(this.lineas().map((l) => l.productoId));
    return this.prodOrigen()
      .filter((p) => !yaAgregados.has(p.productoId) && p.disponible > 0)
      .filter((p) => p.nombre.toLowerCase().includes(q) || p.codigo.includes(q))
      .slice(0, 6);
  });

  protected readonly totalUnidades = computed(() =>
    this.lineas().reduce((s, l) => s + (l.cantidad || 0), 0),
  );

  ngOnInit(): void {
    const sid = this.sucursalSvc.sucursalActivaId() ?? this.auth.usuario()?.sucursalActualId ?? '';
    this.svc.sucursales().subscribe({
      next: (rows) => {
        this.sucursales.set(rows ?? []);
        if (sid && rows.some((r) => r.id === sid)) this.seleccionarOrigen(sid);
      },
      error: () => this.sucursales.set([]),
    });
    this.cargarHistorial();
  }

  seleccionarOrigen(id: string): void {
    this.origenId.set(id);
    if (this.destinoId() === id) this.destinoId.set('');
    this.lineas.set([]);
    this.cargarStockOrigen(id);
  }

  private cargarStockOrigen(sucursalId: string): void {
    if (!sucursalId) return;
    this.cargandoOrigen.set(true);
    this.invApi.cargarInventario(sucursalId).subscribe({
      next: ({ productos, lotes }) => {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const disp = new Map<string, number>();
        for (const l of lotes) {
          if (new Date(l.vencimiento) >= hoy) {
            disp.set(l.productoId, (disp.get(l.productoId) ?? 0) + l.cantidadBase);
          }
        }
        this.prodOrigen.set(
          productos.map((p) => ({
            productoId: p.id,
            nombre: p.nombre,
            codigo: p.codigo,
            disponible: disp.get(p.id) ?? 0,
          })),
        );
        this.cargandoOrigen.set(false);
      },
      error: () => { this.prodOrigen.set([]); this.cargandoOrigen.set(false); },
    });
  }

  agregar(p: ProdOrigen): void {
    this.lineas.update((l) => [
      ...l,
      { productoId: p.productoId, nombre: p.nombre, disponible: p.disponible, cantidad: 1 },
    ]);
    this.busqueda.set('');
  }

  setCantidad(i: number, valor: number): void {
    this.lineas.update((l) =>
      l.map((x, idx) =>
        idx === i ? { ...x, cantidad: Math.max(1, Math.min(Math.floor(valor || 0), x.disponible)) } : x,
      ),
    );
  }

  quitar(i: number): void {
    this.lineas.update((l) => l.filter((_, idx) => idx !== i));
  }

  confirmar(): void {
    const origen = this.origenId();
    const destino = this.destinoId();
    if (!origen || !destino) { this.toast.aviso('Elige origen y destino'); return; }
    if (origen === destino) { this.toast.aviso('El origen y el destino deben ser distintos'); return; }
    const items = this.lineas().filter((l) => l.cantidad > 0);
    if (!items.length) { this.toast.aviso('Agrega al menos un producto'); return; }
    this.enviando.set(true);
    this.svc.crear({
      origenId: origen,
      destinoId: destino,
      motivo: this.motivo().trim() || undefined,
      items: items.map((l) => ({ productoId: l.productoId, cantidadBase: l.cantidad })),
    }).subscribe({
      next: (r) => {
        this.enviando.set(false);
        this.toast.exito(`Transferencia ${r.numero} registrada`);
        this.lineas.set([]);
        this.motivo.set('');
        this.cargarStockOrigen(origen);
        this.cargarHistorial();
      },
      error: (e) => { this.enviando.set(false); this.toast.error(e.message ?? 'No se pudo transferir'); },
    });
  }

  private cargarHistorial(): void {
    const sid = this.sucursalSvc.sucursalActivaId() ?? this.auth.usuario()?.sucursalActualId;
    this.svc.listar(sid).subscribe({
      next: (rows) => this.historial.set(rows ?? []),
      error: () => this.historial.set([]),
    });
  }

  nombreSucursal(id?: string | null): string {
    return this.sucursales().find((s) => s.id === id)?.nombre ?? '—';
  }

  formatFechaHora(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
