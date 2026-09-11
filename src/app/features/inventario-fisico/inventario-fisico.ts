import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { SucursalService } from '../../core/services/sucursal.service';
import { ToastService } from '../../core/services/toast.service';
import { ComprobanteService } from '../pos/comprobante.service';
import {
  InventarioFisicoService,
  ConteoItem,
  ConteoHistorialRow,
  ConteoActa,
} from '../../core/services/inventario-fisico.service';

interface Fila extends ConteoItem {
  contado: number | null; // edición local
}

@Component({
  selector: 'app-inventario-fisico',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './inventario-fisico.html',
})
export class InventarioFisicoComponent implements OnInit {
  private readonly auth  = inject(AuthService);
  /** Sucursal ACTIVA del header: con multi-botica, la del token no basta. */
  private readonly sucursalSvc = inject(SucursalService);
  private readonly toast = inject(ToastService);
  private readonly svc   = inject(InventarioFisicoService);
  /** Impresión por iframe oculto (mismo camino que el ticket del POS). */
  private readonly comprobante = inject(ComprobanteService);

  protected cargando   = signal(true);
  protected conteoId   = signal<string | null>(null);
  protected filas      = signal<Fila[]>([]);
  protected busqueda   = signal('');
  protected soloDiferencias = signal(false);
  protected guardando  = signal(false);
  protected cerrando   = signal(false);
  protected observacion = signal('');
  protected historial  = signal<ConteoHistorialRow[]>([]);

  // Acta (detalle de un conteo cerrado)
  protected acta        = signal<ConteoActa | null>(null);
  protected cargandoActa = signal(false);

  protected readonly hayConteo = computed(() => this.conteoId() !== null);

  protected readonly filasVista = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    const solo = this.soloDiferencias();
    return this.filas().filter((f) => {
      if (solo && (f.contado == null || f.contado === f.sistemaCantidad)) return false;
      if (!q) return true;
      return f.productoNombre.toLowerCase().includes(q) || f.loteNumero.toLowerCase().includes(q);
    });
  });

  protected readonly resumen = computed(() => {
    let contados = 0, sobrantes = 0, faltantes = 0;
    for (const f of this.filas()) {
      if (f.contado == null) continue;
      contados++;
      const d = f.contado - f.sistemaCantidad;
      if (d > 0) sobrantes += d; else if (d < 0) faltantes += -d;
    }
    return { contados, pendientes: this.filas().length - contados, sobrantes, faltantes };
  });

  ngOnInit(): void { this.cargar(); }

  /**
   * Sucursal sobre la que se cuenta. Es la ACTIVA (selector del header), no la
   * del token: cerrar un conteo APLICA los ajustes al stock, así que contar la
   * botica equivocada corrompe el inventario de otra sede.
   */
  private sucursal(): string {
    return this.sucursalSvc.sucursalActivaId() ?? this.auth.usuario()?.sucursalActualId ?? '';
  }

  cargar(): void {
    const sid = this.sucursal();
    if (!sid) { this.cargando.set(false); this.toast.aviso('Selecciona una sucursal'); return; }
    this.cargando.set(true);
    this.svc.actual(sid).subscribe({
      next: (s) => {
        if (s) {
          this.conteoId.set(s.id);
          this.filas.set(s.items.map((i) => ({ ...i, contado: i.contadaCantidad })));
        } else {
          this.conteoId.set(null);
          this.filas.set([]);
        }
        this.cargando.set(false);
      },
      error: () => { this.conteoId.set(null); this.filas.set([]); this.cargando.set(false); },
    });
    this.svc.historial(sid).subscribe({
      next: (h) => this.historial.set(h ?? []),
      error: () => this.historial.set([]),
    });
  }

  iniciar(): void {
    const sid = this.sucursal();
    if (!sid) return;
    this.cargando.set(true);
    this.svc.abrir(sid).subscribe({
      next: (s) => {
        this.conteoId.set(s.id);
        this.filas.set(s.items.map((i) => ({ ...i, contado: null })));
        this.cargando.set(false);
        this.toast.exito(`Conteo iniciado · ${s.items.length} lotes`);
      },
      error: (e) => { this.cargando.set(false); this.toast.error(e.message ?? 'No se pudo iniciar'); },
    });
  }

  setContado(id: string, valor: string): void {
    const v = valor === '' ? null : Math.max(0, Math.floor(Number(valor) || 0));
    this.filas.update((fs) => fs.map((f) => (f.id === id ? { ...f, contado: v } : f)));
  }

  diferencia(f: Fila): number {
    return f.contado == null ? 0 : f.contado - f.sistemaCantidad;
  }

  guardar(): void {
    const id = this.conteoId();
    if (!id) return;
    const items = this.filas()
      .filter((f) => f.contado != null)
      .map((f) => ({ itemId: f.id, contadaCantidad: f.contado as number }));
    if (!items.length) { this.toast.aviso('Cuenta al menos un lote'); return; }
    this.guardando.set(true);
    this.svc.guardar(id, items).subscribe({
      next: () => { this.guardando.set(false); this.toast.exito('Conteo guardado'); },
      error: (e) => { this.guardando.set(false); this.toast.error(e.message ?? 'No se pudo guardar'); },
    });
  }

  cerrar(): void {
    const id = this.conteoId();
    if (!id) return;
    const items = this.filas()
      .filter((f) => f.contado != null)
      .map((f) => ({ itemId: f.id, contadaCantidad: f.contado as number }));
    this.cerrando.set(true);
    // Guarda lo contado y luego cierra (aplica los ajustes).
    const cerrar = () =>
      this.svc.cerrar(id, this.observacion()).subscribe({
        next: (r) => {
          this.cerrando.set(false);
          this.toast.exito(`Conteo cerrado · ${r.ajustados} ajuste(s) aplicados`);
          this.observacion.set('');
          this.cargar();
        },
        error: (e) => { this.cerrando.set(false); this.toast.error(e.message ?? 'No se pudo cerrar'); },
      });
    if (items.length) {
      this.svc.guardar(id, items).subscribe({ next: cerrar, error: cerrar });
    } else {
      cerrar();
    }
  }

  formatFecha(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ── Acta (detalle de un conteo cerrado) ───────────────────────────────
  verActa(id: string): void {
    this.cargandoActa.set(true);
    this.acta.set(null);
    this.svc.obtener(id).subscribe({
      next: (a) => { this.acta.set(a); this.cargandoActa.set(false); },
      error: (e) => { this.cargandoActa.set(false); this.toast.error(e.message ?? 'No se pudo abrir el acta'); },
    });
  }

  cerrarActa(): void { this.acta.set(null); }

  difActa(it: ConteoItem): number {
    return it.contadaCantidad == null ? 0 : it.contadaCantidad - it.sistemaCantidad;
  }

  imprimirActa(): void {
    const a = this.acta();
    if (!a) return;
    // Por iframe oculto (mismo camino que el resto de impresiones): con
    // window.open, un bloqueador de emergentes dejaba sin acta el conteo.
    const filas = a.items.map((it) => {
      const d = this.difActa(it);
      const color = d > 0 ? '#059669' : d < 0 ? '#dc2626' : '#64748b';
      return `<tr>
        <td>${it.productoNombre}</td><td style="font-family:monospace">${it.loteNumero}</td>
        <td>${this.formatFecha(it.vencimiento)}</td>
        <td style="text-align:center">${it.sistemaCantidad}</td>
        <td style="text-align:center">${it.contadaCantidad ?? '—'}</td>
        <td style="text-align:center;color:${color};font-weight:bold">${it.contadaCantidad == null ? '—' : (d > 0 ? '+' : '') + d}</td>
      </tr>`;
    }).join('');
    const resp = a.usuario ? `${a.usuario.nombres} ${a.usuario.apellidos ?? ''}`.trim() : '—';
    const html = `<html><head><title>Acta de inventario</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0 0 4px}
      .meta{font-size:12px;color:#555;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f3f4f6;text-transform:uppercase;font-size:10px}</style>
      </head><body>
      <h1>Acta de inventario físico</h1>
      <div class="meta">${a.sucursal?.nombre ?? ''} · Cerrado ${this.formatFecha(a.cerradoEn)} · Responsable: ${resp}${a.observacion ? ' · ' + a.observacion : ''}</div>
      <table><thead><tr><th>Producto</th><th>Lote</th><th>Vence</th><th style="text-align:center">Sistema</th><th style="text-align:center">Contado</th><th style="text-align:center">Diferencia</th></tr></thead>
      <tbody>${filas}</tbody></table>
      </body></html>`;
    this.comprobante.imprimir(html);
  }
}
