import { Injectable, effect, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api';
import { AuthService } from '../auth/auth.service';

/** Configuración global de la empresa emisora (una fila en el backend). */
export interface Configuracion {
  id: string;
  razonSocial: string;
  ruc: string;
  direccionFiscal: string;
  telefono: string;
  email: string;
  directorTecnico: string;
  colegiatura: string;
  registroSanitario: string;
  licenciaFuncionamiento: string;
  igvPorcentaje: string;
  moneda: string;
  simbolo: string;
  pieTicket: string;
  logoUrl: string;
  logoEnTicket: boolean;
  tipoImpresion: string;
  alertaVencimientoDias: number;
  stockMinimoDefault: number;
  /** Diferencia de efectivo (S/) a partir de la cual el cierre de caja exige motivo. */
  umbralDescuadreCaja: string;
}

export type ConfiguracionInput = Partial<
  Omit<Configuracion, 'id' | 'igvPorcentaje' | 'umbralDescuadreCaja'>
> & {
  igvPorcentaje?: number;
  umbralDescuadreCaja?: number;
};

/** Una línea de la bitácora: un campo que cambió, con quién y cuándo. */
export interface CambioConfiguracion {
  id: string;
  campo: string;
  anterior: string;
  nuevo: string;
  fecha: string;
  email: string;
  nombre: string;
}

/**
 * ConfiguracionService — configuración global del sistema.
 * Se carga una vez al iniciar sesión y alimenta el comprobante (datos del
 * emisor, pie de ticket) y otros parámetros globales.
 */
@Injectable({ providedIn: 'root' })
export class ConfiguracionService {
  private readonly api  = inject(ApiService);
  private readonly auth = inject(AuthService);
  private cargado = false;

  private readonly _config = signal<Configuracion | null>(null);
  readonly config = this._config.asReadonly();

  constructor() {
    effect(() => {
      if (this.auth.usuario() && !this.cargado) {
        this.cargado = true;
        this.cargar();
      }
    });
  }

  cargar(): void {
    this.api.get<Configuracion>('/configuracion').subscribe({
      next: (c) => this._config.set(c),
      error: () => this._config.set(null),
    });
  }

  guardar(input: ConfiguracionInput): Observable<Configuracion> {
    return this.api
      .put<Configuracion>('/configuracion', input)
      .pipe(tap((c) => this._config.set(c)));
  }

  /** Bitácora de cambios (solo administradores en el backend). */
  historial(limite = 50): Observable<CambioConfiguracion[]> {
    return this.api.get<CambioConfiguracion[]>('/configuracion/historial', { limite });
  }
}
