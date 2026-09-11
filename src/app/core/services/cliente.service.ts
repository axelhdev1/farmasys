import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ApiService } from './api';
import { ToastService } from './toast.service';
import { Cliente } from '../models/cliente.model';

/**
 * ClienteService — padrón de clientes de la farmacia.
 *
 * Conectado al backend real (GET/POST/PATCH /clientes). El POS usa
 * `buscarPorDocumento()` para vincular boletas y facturas por DNI/RUC.
 *
 * `buscarLocal()` filtra sobre lo ya cargado en memoria: sirve para el
 * autocompletado inmediato mientras se escribe, sin ir al servidor en cada
 * tecla.
 */
@Injectable({ providedIn: 'root' })
export class ClienteService {
  private readonly api   = inject(ApiService);
  private readonly toast = inject(ToastService);

  private readonly _clientes = signal<Cliente[]>([]);
  private readonly _cargando = signal(false);

  readonly clientes = this._clientes.asReadonly();
  readonly cargando = this._cargando.asReadonly();

  // ════════════════════════════════════════════════════════════════════════
  /**
   * Carga el padrón de clientes registrados.
   * GET /api/v1/clientes?page=0&size=100
   */
  cargar(): void {
    this._cargando.set(true);
    this.api.get<Cliente[]>('/clientes').subscribe({
      next: (data) => this._clientes.set(data),
      error: (err) => this.toast.error('Error al cargar clientes: ' + err.message),
      complete: () => this._cargando.set(false),
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  /**
   * Busca un cliente por número de documento (DNI o RUC).
   * Usado en el POS para vincular una boleta o factura.
   * GET /api/v1/clientes/buscar?documento=...
   */
  buscarPorDocumento(documento: string): Observable<Cliente | null> {
    return this.api
      .get<Cliente[]>('/clientes/buscar', { q: documento.trim() })
      .pipe(
        map((lista) => lista.find((c) => c.numeroDocumento === documento.trim()) ?? lista[0] ?? null),
      );
  }

  // ════════════════════════════════════════════════════════════════════════
  /**
   * Registra un nuevo cliente.
   * POST /api/v1/clientes
   */
  registrar(datos: Omit<Cliente, 'id'>): Observable<Cliente> {
    return this.api.post<Cliente>('/clientes', datos).pipe(
      tap((nuevo) => this._clientes.update((lista) => [nuevo, ...lista])),
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  /**
   * Actualiza los datos de un cliente existente.
   * PUT /api/v1/clientes/{id}
   */
  actualizar(id: string, datos: Partial<Omit<Cliente, 'id'>>): Observable<Cliente> {
    return this.api.patch<Cliente>(`/clientes/${id}`, datos).pipe(
      tap((act) => this._clientes.update((lista) => lista.map((c) => (c.id === id ? act : c)))),
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  /**
   * Búsqueda local por nombre, apellido o número de documento.
   * En producción, reemplazar por llamada HTTP con debounce.
   * GET /api/v1/clientes?q=...
   */
  buscarLocal(query: string): Cliente[] {
    const q = query.toLowerCase().trim();
    if (!q) return this._clientes();
    return this._clientes().filter(c =>
      c.nombres.toLowerCase().includes(q)             ||
      c.numeroDocumento.includes(q)                   ||
      (c.apellidos?.toLowerCase().includes(q) ?? false) ||
      (c.razonSocial?.toLowerCase().includes(q) ?? false)
    );
  }
}
