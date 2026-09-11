import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

/** Selector de elementos enfocables dentro del modal. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * FocusTrapDirective — atrapa el foco del teclado dentro de un modal.
 *
 * Uso: <div appFocusTrap ...> en el PANEL del modal (no en el backdrop).
 *
 * Comportamiento:
 *  - Al abrir: enfoca el primer elemento enfocable del modal.
 *  - Tab / Shift+Tab: ciclan dentro del modal (no se escapan al fondo).
 *  - Al cerrar (destroy): devuelve el foco al elemento que lo tenía antes.
 *
 * Accesibilidad WCAG 2.4.3 (orden de foco) para los modales del POS:
 * receta, presentación, nuevo cliente, vaciar carrito y venta completada.
 */
@Directive({
  selector: '[appFocusTrap]',
  standalone: true,
  host: { '(keydown)': 'onKeydown($event)' },
})
export class FocusTrapDirective implements OnInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private focoPrevio: HTMLElement | null = null;

  ngOnInit(): void {
    this.focoPrevio = document.activeElement as HTMLElement | null;
    // Espera al render del contenido del modal antes de enfocar.
    setTimeout(() => this.focusables()[0]?.focus(), 0);
  }

  ngOnDestroy(): void {
    // Devuelve el foco a quien lo tenía (si sigue en el documento).
    if (this.focoPrevio && document.contains(this.focoPrevio)) {
      this.focoPrevio.focus();
    }
  }

  protected onKeydown(ev: KeyboardEvent): void {
    if (ev.key !== 'Tab') return;
    const f = this.focusables();
    if (f.length === 0) return;
    const primero = f[0];
    const ultimo = f[f.length - 1];
    const activo = document.activeElement;
    if (ev.shiftKey && (activo === primero || !this.el.nativeElement.contains(activo))) {
      ev.preventDefault();
      ultimo.focus();
    } else if (!ev.shiftKey && (activo === ultimo || !this.el.nativeElement.contains(activo))) {
      ev.preventDefault();
      primero.focus();
    }
  }

  /** Elementos enfocables VISIBLES dentro del modal. */
  private focusables(): HTMLElement[] {
    return Array.from(
      this.el.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((e) => e.offsetParent !== null);
  }
}
