import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';

export interface SucursalMin {
  id: string;
  nombre: string;
}

export interface TransferenciaBackend {
  id: string;
  numero: string;
  fecha: string;
  motivo: string | null;
  origen?: { nombre: string } | null;
  destino?: { nombre: string } | null;
  usuario?: { nombres: string; apellidos?: string | null } | null;
  items: Array<{
    id: string;
    cantidadBase: number;
    producto?: { nombre: string; codigo: string } | null;
  }>;
}

export interface CrearTransferenciaInput {
  origenId: string;
  destinoId: string;
  motivo?: string;
  items: Array<{ productoId: string; cantidadBase: number }>;
}

/** Transferencias de stock entre sucursales. */
@Injectable({ providedIn: 'root' })
export class TransferenciaService {
  private readonly api = inject(ApiService);

  sucursales(): Observable<SucursalMin[]> {
    return this.api.get<SucursalMin[]>('/sucursales');
  }

  crear(input: CrearTransferenciaInput): Observable<{ id: string; numero: string }> {
    return this.api.post<{ id: string; numero: string }>('/transferencias', input);
  }

  listar(sucursalId?: string): Observable<TransferenciaBackend[]> {
    return this.api.get<TransferenciaBackend[]>(
      '/transferencias',
      sucursalId ? { sucursalId } : undefined,
    );
  }
}
