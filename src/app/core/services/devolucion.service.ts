import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';

export interface DevolucionItemInput {
  ventaItemId: string;
  cantidad: number;
}

export interface CrearDevolucionInput {
  ventaId: string;
  motivo: string;
  items: DevolucionItemInput[];
}

/** Devolución tal como la devuelve el backend. */
export interface DevolucionBackend {
  id: string;
  fecha: string;
  motivo: string;
  monto: string;
  registradoPor: string;
  items: Array<{
    id: string;
    ventaItemId: string;
    productoId: string;
    cantidad: number;
    subtotal: string;
  }>;
  venta?: { numeroComprobante: string } | null;
  usuario?: { nombres: string; apellidos?: string | null } | null;
}

/** Devoluciones (parcial o total) de una venta. */
@Injectable({ providedIn: 'root' })
export class DevolucionService {
  private readonly api = inject(ApiService);

  crear(input: CrearDevolucionInput): Observable<{ id: string; monto: string }> {
    return this.api.post<{ id: string; monto: string }>('/devoluciones', input);
  }

  listar(ventaId: string): Observable<DevolucionBackend[]> {
    return this.api.get<DevolucionBackend[]>('/devoluciones', { ventaId });
  }
}
