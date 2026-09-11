import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeEsPe from '@angular/common/locales/es-PE';

import { routes } from './app.routes';
import { jwtInterceptor } from './core/auth/jwt.interceptor';

/**
 * Idioma y formatos peruanos para TODA la aplicación.
 *
 * Sin esto Angular usa `en-US` por defecto y el pipe `date` imprime el formato
 * estadounidense mes/día/año: un cierre de caja del 10 de agosto salía como
 * "8/10/26", que en Perú se lee como 8 de octubre. En un arqueo de efectivo,
 * confundir la fecha de un turno no es un detalle cosmético.
 *
 * Afecta también a `number` y `currency`: separador de miles y decimales.
 */
registerLocaleData(localeEsPe);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([jwtInterceptor])),
    { provide: LOCALE_ID, useValue: 'es-PE' },
  ],
};
