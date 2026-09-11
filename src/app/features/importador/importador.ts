import { Component, inject, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../../core/services/api';
import { ToastService } from '../../core/services/toast.service';

/** Fila ya normalizada, lista para enviar al backend. */
interface FilaImportacion {
  codigo: string;
  nombre: string;
  principioActivo?: string;
  concentracion?: string;
  categoria: string;
  laboratorio?: string;
  ubicacion?: string;
  registroSanitario?: string;
  esGenerico?: boolean;
  requiereReceta?: boolean;
  controlado?: boolean;
  unidadBase?: string;
  presentacionNombre: string;
  factor: number;
  precioVenta: number;
  codigoBarras?: string;
  esBase?: boolean;
  filaArchivo: number;
}

interface ResumenImportacion {
  filasRecibidas: number;
  productosValidos: number;
  errores: { fila: number; codigo: string; error: string }[];
  creados: number;
  simulacion: boolean;
}

/** Cabeceras aceptadas (flexibles) → campo interno. */
const MAPA_CABECERAS: Record<string, keyof FilaImportacion> = {
  'codigo': 'codigo', 'código': 'codigo',
  'nombre': 'nombre', 'producto': 'nombre',
  'principioactivo': 'principioActivo', 'principio activo': 'principioActivo', 'principio_activo': 'principioActivo', 'dci': 'principioActivo',
  'concentracion': 'concentracion', 'concentración': 'concentracion',
  'categoria': 'categoria', 'categoría': 'categoria',
  'laboratorio': 'laboratorio', 'lab': 'laboratorio',
  'ubicacion': 'ubicacion', 'ubicación': 'ubicacion', 'estante': 'ubicacion',
  'registrosanitario': 'registroSanitario', 'registro sanitario': 'registroSanitario', 'registro_sanitario': 'registroSanitario',
  'generico': 'esGenerico', 'genérico': 'esGenerico', 'es_generico': 'esGenerico',
  'receta': 'requiereReceta', 'requiere_receta': 'requiereReceta', 'requiere receta': 'requiereReceta',
  'controlado': 'controlado',
  'unidadbase': 'unidadBase', 'unidad base': 'unidadBase', 'unidad_base': 'unidadBase',
  'presentacion': 'presentacionNombre', 'presentación': 'presentacionNombre',
  'factor': 'factor', 'unidades': 'factor',
  'precio': 'precioVenta', 'precioventa': 'precioVenta', 'precio_venta': 'precioVenta', 'precio venta': 'precioVenta',
  'codigobarras': 'codigoBarras', 'codigo_barras': 'codigoBarras', 'código de barras': 'codigoBarras', 'ean': 'codigoBarras',
  'base': 'esBase', 'es_base': 'esBase',
};

const CAMPOS_BOOL: (keyof FilaImportacion)[] =
  ['esGenerico', 'requiereReceta', 'controlado', 'esBase'];
const CAMPOS_NUM: (keyof FilaImportacion)[] = ['factor', 'precioVenta'];

/**
 * Importador de catálogo — carga masiva desde el Excel/CSV real del cliente.
 * Flujo: elegir archivo → validar (simulación en servidor, no escribe nada)
 * → revisar el reporte de errores → confirmar la importación.
 */
@Component({
  selector: 'app-importador',
  imports: [DecimalPipe],
  templateUrl: './importador.html',
})
export class ImportadorComponent {
  private readonly api   = inject(ApiService);
  private readonly toast = inject(ToastService);

  protected readonly archivoNombre = signal<string>('');
  protected readonly filas         = signal<FilaImportacion[]>([]);
  protected readonly erroresParse  = signal<string[]>([]);
  protected readonly resultado     = signal<ResumenImportacion | null>(null);
  protected readonly procesando    = signal(false);

  /** Productos únicos detectados en el archivo (por código). */
  protected readonly productosDetectados = computed(
    () => new Set(this.filas().map((f) => f.codigo)).size,
  );

  // ── Archivo ────────────────────────────────────────────────────────────
  onArchivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.archivoNombre.set(file.name);
    this.resultado.set(null);
    const reader = new FileReader();
    reader.onload = () => this.parsearCSV(String(reader.result ?? ''));
    reader.readAsText(file, 'utf-8');
    input.value = ''; // permite re-subir el mismo archivo tras corregirlo
  }

  /** Parser CSV simple: separador auto (; o ,), comillas dobles soportadas. */
  private parsearCSV(texto: string): void {
    const errores: string[] = [];
    const lineas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lineas.length < 2) {
      this.filas.set([]);
      this.erroresParse.set(['El archivo no tiene datos (se espera cabecera + filas).']);
      return;
    }
    const sep = (lineas[0].match(/;/g)?.length ?? 0) >= (lineas[0].match(/,/g)?.length ?? 0) ? ';' : ',';

    const partir = (linea: string): string[] => {
      const celdas: string[] = [];
      let actual = '';
      let enComillas = false;
      for (let i = 0; i < linea.length; i++) {
        const ch = linea[i];
        if (ch === '"') {
          if (enComillas && linea[i + 1] === '"') { actual += '"'; i++; }
          else enComillas = !enComillas;
        } else if (ch === sep && !enComillas) {
          celdas.push(actual); actual = '';
        } else {
          actual += ch;
        }
      }
      celdas.push(actual);
      return celdas.map((c) => c.trim());
    };

    // Cabeceras → campos
    const cabeceras = partir(lineas[0]).map((c) => c.toLowerCase().trim());
    const campos: (keyof FilaImportacion | null)[] = cabeceras.map(
      (c) => MAPA_CABECERAS[c] ?? null,
    );
    const requeridos: (keyof FilaImportacion)[] =
      ['codigo', 'nombre', 'categoria', 'presentacionNombre', 'factor', 'precioVenta'];
    for (const r of requeridos) {
      if (!campos.includes(r)) {
        errores.push(`Falta la columna "${r}" en la cabecera (revisa la plantilla).`);
      }
    }
    if (errores.length) {
      this.filas.set([]);
      this.erroresParse.set(errores);
      return;
    }

    const esVerdad = (v: string) =>
      ['si', 'sí', 'true', '1', 'x', 'verdadero'].includes(v.toLowerCase().trim());

    const filas: FilaImportacion[] = [];
    for (let i = 1; i < lineas.length; i++) {
      const celdas = partir(lineas[i]);
      const fila: Partial<FilaImportacion> = { filaArchivo: i + 1 };
      campos.forEach((campo, idx) => {
        if (!campo || campo === 'filaArchivo') return;
        const bruto = celdas[idx] ?? '';
        if (CAMPOS_BOOL.includes(campo)) {
          (fila as Record<string, unknown>)[campo] = esVerdad(bruto);
        } else if (CAMPOS_NUM.includes(campo)) {
          (fila as Record<string, unknown>)[campo] = Number(bruto.replace(',', '.')) || 0;
        } else if (bruto) {
          (fila as Record<string, unknown>)[campo] = bruto;
        }
      });
      filas.push(fila as FilaImportacion);
    }
    this.filas.set(filas);
    this.erroresParse.set([]);
  }

  // ── Simular / importar ─────────────────────────────────────────────────
  simular(): void   { this.enviar(true); }
  importar(): void  { this.enviar(false); }

  private enviar(simular: boolean): void {
    if (this.filas().length === 0) {
      this.toast.aviso('Primero elige un archivo con datos');
      return;
    }
    this.procesando.set(true);
    this.api
      .post<ResumenImportacion>('/productos/importar', { simular, filas: this.filas() })
      .subscribe({
        next: (r) => {
          this.procesando.set(false);
          this.resultado.set(r);
          if (!r.simulacion && r.creados > 0) {
            this.toast.exito(`${r.creados} productos importados al catálogo`);
          } else if (r.simulacion) {
            this.toast.exito(
              r.errores.length === 0
                ? 'Validación perfecta: todo listo para importar'
                : `Validación con ${r.errores.length} observaciones`,
            );
          }
        },
        error: (e) => {
          this.procesando.set(false);
          this.toast.error(e.message ?? 'No se pudo procesar la importación');
        },
      });
  }

  // ── Utilidades ─────────────────────────────────────────────────────────
  descargarPlantilla(): void {
    const cabecera =
      'codigo;nombre;principio_activo;concentracion;categoria;laboratorio;ubicacion;generico;receta;controlado;unidad_base;presentacion;factor;precio;codigo_barras;base';
    const ejemplo1 = 'PAR500;Paracetamol 500mg;Paracetamol;500mg;Analgésicos;Genfar;Estante A-1;si;no;no;tableta;Caja x 100;100;18.00;7750001000015;no';
    const ejemplo2 = 'PAR500;Paracetamol 500mg;Paracetamol;500mg;Analgésicos;Genfar;Estante A-1;si;no;no;tableta;Blíster x 10;10;2.00;;no';
    const ejemplo3 = 'PAR500;Paracetamol 500mg;Paracetamol;500mg;Analgésicos;Genfar;Estante A-1;si;no;no;tableta;Unidad;1;0.30;;si';
    this.descargarTexto('plantilla-catalogo.csv', [cabecera, ejemplo1, ejemplo2, ejemplo3].join('\n'));
  }

  descargarErrores(): void {
    const r = this.resultado();
    if (!r || r.errores.length === 0) return;
    const lineas = ['fila;codigo;error', ...r.errores.map((e) => `${e.fila};${e.codigo};"${e.error}"`)];
    this.descargarTexto('errores-importacion.csv', lineas.join('\n'));
  }

  private descargarTexto(nombre: string, contenido: string): void {
    const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  limpiar(): void {
    this.archivoNombre.set('');
    this.filas.set([]);
    this.erroresParse.set([]);
    this.resultado.set(null);
  }
}
