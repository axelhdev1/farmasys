import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * ApiService — servicio HTTP base centralizado.
 *
 * Todos los servicios de la aplicación (ProductoService, VentaService, etc.)
 * deben usar este servicio en lugar de inyectar HttpClient directamente.
 *
 * Ventajas:
 *  - La URL base se toma de environment.apiUrl (dev vs prod automático).
 *  - Si el endpoint del backend cambia, solo se toca aquí.
 *  - Los errores HTTP se manejan en el jwtInterceptor de forma centralizada.
 *
 * Uso típico en un servicio hijo:
 *   private readonly api = inject(ApiService);
 *
 *   obtenerProductos(): Observable<Producto[]> {
 *     return this.api.get<Producto[]>('/productos');
 *   }
 *
 *   crearVenta(req: VentaRequest): Observable<VentaResponse> {
 *     return this.api.post<VentaResponse>('/ventas', req);
 *   }
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /**
   * GET   /api/v1/<endpoint>
   * @param endpoint  Ruta relativa, ej. '/productos' o '/productos/123'
   * @param params    Query params opcionales como objeto plano
   */
  get<T>(endpoint: string, params?: Record<string, string | number | boolean>): Observable<T> {
    return this.http.get<T>(this.url(endpoint), {
      params: this.toHttpParams(params),
    });
  }

  /**
   * POST  /api/v1/<endpoint>
   * @param endpoint  Ruta relativa
   * @param body      Objeto que se serializa a JSON
   */
  post<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.url(endpoint), body);
  }

  /**
   * PUT   /api/v1/<endpoint>
   * @param endpoint  Ruta relativa, ej. '/productos/123'
   * @param body      Objeto con los campos a actualizar
   */
  put<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(endpoint), body);
  }

  /**
   * PATCH /api/v1/<endpoint>
   * @param endpoint  Ruta relativa
   * @param body      Objeto con solo los campos a parchear
   */
  patch<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(endpoint), body);
  }

  /**
   * DELETE /api/v1/<endpoint>
   * @param endpoint  Ruta relativa, ej. '/productos/123'
   */
  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(this.url(endpoint));
  }

  // ── Helpers privados ──────────────────────────────────────────────────

  /** Construye la URL completa concatenando base + endpoint. */
  private url(endpoint: string): string {
    // Evita doble barra si endpoint ya empieza con '/'
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${this.base}${path}`;
  }

  /** Convierte un objeto plano en HttpParams de Angular. */
  private toHttpParams(
    obj?: Record<string, string | number | boolean>
  ): HttpParams {
    let params = new HttpParams();
    if (!obj) return params;
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        params = params.set(key, String(value));
      }
    }
    return params;
  }
}
