import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';

export interface ConteoItem {
  id: string;
  loteId: string;
  productoId: string;
  productoNombre: string;
  loteNumero: string;
  vencimiento: string;
  sistemaCantidad: number;
  contadaCantidad: number | null;
}

export interface ConteoSesion {
  id: string;
  sucursalId: string;
  estado: string;
  iniciadoEn: string;
  items: ConteoItem[];
}

export interface ConteoActa {
  id: string;
  estado: string;
  observacion: string | null;
  iniciadoEn: string;
  cerradoEn: string | null;
  usuario?: { nombres: string; apellidos?: string | null } | null;
  sucursal?: { nombre: string } | null;
  items: ConteoItem[];
}

export interface ConteoHistorialRow {
  id: string;
  cerradoEn: string;
  observacion: string | null;
  usuario?: { nombres: string; apellidos?: string | null } | null;
  lineas: number;
  sobrantes: number;
  faltantes: number;
}

/** Toma de inventario físico (conteo vs sistema, ajuste lote a lote). */
@Injectable({ providedIn: 'root' })
export class InventarioFisicoService {
  private readonly api = inject(ApiService);

  actual(sucursalId: string): Observable<ConteoSesion | null> {
    return this.api.get<ConteoSesion | null>(`/inventario-fisico/actual/${sucursalId}`);
  }

  historial(sucursalId: string): Observable<ConteoHistorialRow[]> {
    return this.api.get<ConteoHistorialRow[]>(`/inventario-fisico/historial/${sucursalId}`);
  }

  obtener(conteoId: string): Observable<ConteoActa> {
    return this.api.get<ConteoActa>(`/inventario-fisico/detalle/${conteoId}`);
  }

  abrir(sucursalId: string): Observable<ConteoSesion> {
    return this.api.post<ConteoSesion>(`/inventario-fisico/abrir/${sucursalId}`, {});
  }

  guardar(conteoId: string, items: Array<{ itemId: string; contadaCantidad: number }>): Observable<unknown> {
    return this.api.patch<unknown>(`/inventario-fisico/${conteoId}/conteos`, { items });
  }

  cerrar(conteoId: string, observacion?: string): Observable<{ ok: boolean; ajustados: number }> {
    return this.api.post<{ ok: boolean; ajustados: number }>(
      `/inventario-fisico/${conteoId}/cerrar`,
      { observacion },
    );
  }
}
