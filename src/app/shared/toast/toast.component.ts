import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

/**
 * ToastComponent — contenedor de notificaciones flotantes.
 *
 * Se coloca UNA SOLA VEZ en el main-layout.html:
 *   <app-toast></app-toast>
 *
 * No necesita configuración adicional; lee el ToastService automáticamente.
 */
@Component({
  selector: 'app-toast',
  standalone: true,
  templateUrl: './toast.component.html',
})
export class ToastComponent {
  protected readonly toastSvc = inject(ToastService);

  protected icono(tipo: string): string {
    const map: Record<string, string> = {
      exito: 'check_circle',
      error: 'error',
      aviso: 'warning',
      info:  'info',
    };
    return map[tipo] ?? 'info';
  }

  protected clasesContenedor(tipo: string): string {
    const map: Record<string, string> = {
      exito: 'bg-emerald-50 border-emerald-200',
      error: 'bg-red-50 border-red-200',
      aviso: 'bg-amber-50 border-amber-200',
      info:  'bg-primary-50 border-primary-200',
    };
    return map[tipo] ?? 'bg-white border-border-color';
  }

  protected clasesTexto(tipo: string): string {
    const map: Record<string, string> = {
      exito: 'text-emerald-800',
      error: 'text-red-800',
      aviso: 'text-amber-800',
      info:  'text-primary-800',
    };
    return map[tipo] ?? 'text-text-main';
  }

  protected clasesIcono(tipo: string): string {
    const map: Record<string, string> = {
      exito: 'text-emerald-500',
      error: 'text-red-500',
      aviso: 'text-amber-500',
      info:  'text-primary-500',
    };
    return map[tipo] ?? 'text-primary';
  }
}
