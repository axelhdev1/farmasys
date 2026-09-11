import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';

export interface ReposicionRow {
  producto: { nombre: string; codigo: string; unidadBase?: string | null; activo: boolean } | null;
  stockActual: number;
  stockMinimo: number;
  vendidoPeriodo: number;
  velocidadDia: number;
  diasCobertura: number | null;
  sugerido: number;
}

/** Sugerencia de reposición por demanda (qué comprar y cuánto). */
@Injectable({ providedIn: 'root' })
export class ReposicionService {
  private readonly api = inject(ApiService);

  listar(sucursalId: string, dias = 30, objetivo = 30): Observable<ReposicionRow[]> {
    return this.api.get<ReposicionRow[]>(`/reportes/reposicion/${sucursalId}`, { dias, objetivo });
  }
}
