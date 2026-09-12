import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';
import { ReposicionRow } from './reposicion.service';

/**
 * Cliente del módulo de IA del backend.
 *
 * IMPORTANTE: aquí NO hay ninguna clave de API. El navegador llama a
 * /api/v1/ia/..., y es el backend quien habla con el proveedor. Una clave de
 * IA en el frontend es una clave pública: cualquiera la saca del bundle.
 */

export interface GrupoIA {
  titulo: string;
  motivo: string;
  /** Códigos de producto. Ya validados contra la tabla real en el backend. */
  codigos: string[];
}

export interface AnalisisIA {
  resumen: string;
  grupos: GrupoIA[];
  avisos: string[];
}

export type MotivoIA = 'SIN_API_KEY' | 'SIN_DATOS' | 'ERROR_PROVEEDOR';

export interface EstadoRespuestaIA {
  disponible: boolean;
  modelo: string;
  enCache: boolean;
  motivo?: MotivoIA;
  detalle?: string;
}

/**
 * La respuesta SIEMPRE trae `filas` (la tabla de reposición). `analisis` puede
 * venir en null si la IA no está disponible: en ese caso la pantalla sigue
 * funcionando igual, solo sin el plan de compra.
 */
export interface RespuestaReposicionIA {
  sucursalId: string;
  dias: number;
  objetivo: number;
  totalProductos: number;
  analizados: number;
  filas: ReposicionRow[];
  analisis: AnalisisIA | null;
  ia: EstadoRespuestaIA;
}

@Injectable({ providedIn: 'root' })
export class IaService {
  private readonly api = inject(ApiService);

  /** Analiza la sugerencia de reposición de una sucursal. */
  analizarReposicion(sucursalId: string, dias = 30, objetivo = 30): Observable<RespuestaReposicionIA> {
    return this.api.get<RespuestaReposicionIA>(`/ia/reposicion/${sucursalId}`, { dias, objetivo });
  }
}
