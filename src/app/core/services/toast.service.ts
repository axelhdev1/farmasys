import { Injectable, signal } from '@angular/core';

export type ToastTipo = 'exito' | 'error' | 'aviso' | 'info';

export interface Toast {
  id: number;
  tipo: ToastTipo;
  mensaje: string;
}

let _nextId = 0;

/**
 * ToastService — notificaciones flotantes globales.
 *
 * Uso desde cualquier servicio o componente:
 *   private readonly toast = inject(ToastService);
 *   this.toast.exito('Venta registrada correctamente');
 *   this.toast.error('Sin conexión al servidor');
 *
 * El ToastComponent (en el main-layout) lee this.toasts() y los renderiza.
 * Los toasts se eliminan automáticamente tras `duracion` ms.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);

  /** Lista de toasts activos (readonly para los componentes). */
  readonly toasts = this._toasts.asReadonly();

  /** Muestra un mensaje de éxito (verde). Duración default: 3.5 s */
  exito(mensaje: string, duracion = 3_500): void {
    this.mostrar('exito', mensaje, duracion);
  }

  /** Muestra un mensaje de error (rojo). Duración default: 5 s */
  error(mensaje: string, duracion = 5_000): void {
    this.mostrar('error', mensaje, duracion);
  }

  /** Muestra un aviso o advertencia (ámbar). Duración default: 4 s */
  aviso(mensaje: string, duracion = 4_000): void {
    this.mostrar('aviso', mensaje, duracion);
  }

  /** Muestra información neutral (azul). Duración default: 3.5 s */
  info(mensaje: string, duracion = 3_500): void {
    this.mostrar('info', mensaje, duracion);
  }

  /** Cierra un toast por id (también lo llama el botón ✕ del componente). */
  cerrar(id: number): void {
    this._toasts.update(list => list.filter(t => t.id !== id));
  }

  // ── privado ────────────────────────────────────────────────────────
  private mostrar(tipo: ToastTipo, mensaje: string, duracion: number): void {
    const id = ++_nextId;
    this._toasts.update(list => [...list, { id, tipo, mensaje }]);
    setTimeout(() => this.cerrar(id), duracion);
  }
}
