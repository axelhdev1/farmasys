import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';

export type CategoriaMerma = 'VENCIDO' | 'DANADO' | 'ROBO' | 'MUESTRA' | 'OTRO';

/** Lote candidato a baja (vencido o por vencer). */
export interface LoteParaBaja {
  id: string;
  lote: string;
  vencimiento: string;
  cantidadBase: number;
  productoId: string;
  producto: { nombre: string; codigo: string } | null;
  estado: 'VENCIDO' | 'POR_VENCER';
  diasRestantes: number;
}

/** Fila del historial de mermas. */
export interface MermaRow {
  id: string;
  fecha: string;
  tipo: string;
  cantidad: number;
  motivo: string | null;
  producto: { nombre: string; codigo: string } | null;
  valor: number;
}

export interface HistorialMermas {
  items: MermaRow[];
  valorTotal: number;
  unidadesTotal: number;
}

/** Mermas / baja formal de stock (vencidos, dañados, robo, muestras). */
@Injectable({ providedIn: 'root' })
export class MermaService {
  private readonly api = inject(ApiService);

  /** Lotes vencidos o por vencer dentro de `dias`. */
  lotesParaBaja(sucursalId: string, dias = 30): Observable<LoteParaBaja[]> {
    return this.api.get<LoteParaBaja[]>(`/inventario/lotes-para-baja/${sucursalId}`, {
      dias: String(dias),
    });
  }

  /** Historial de mermas con valor perdido. */
  historial(sucursalId: string, dias = 30): Observable<HistorialMermas> {
    return this.api.get<HistorialMermas>(`/inventario/mermas/${sucursalId}`, {
      dias: String(dias),
    });
  }

  /** Da de baja un lote (parcial o total). */
  darDeBaja(
    loteId: string,
    body: { categoria: CategoriaMerma; nota?: string; cantidadBase?: number },
  ): Observable<{ ok: boolean; dadoDeBaja: number }> {
    return this.api.post<{ ok: boolean; dadoDeBaja: number }>(
      `/inventario/lotes/${loteId}/baja`,
      body,
    );
  }
}
