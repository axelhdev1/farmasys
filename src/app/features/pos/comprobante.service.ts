import { Injectable, inject } from '@angular/core';
import { MetodoPago } from '../../core/models/carrito.model';
import { VentaCompletada } from './pos.model';
import { ConfiguracionService } from '../../core/services/configuracion.service';

/**
 * Forma neutral de un comprobante imprimible. La usan tanto el POS (venta nueva)
 * como el Historial (reimpresión), así el HTML del ticket vive en UN solo lugar.
 */
export interface ComprobanteImprimible {
  numeroComprobante: string;
  tipoComprobante: string;
  fechaHoraTexto: string;
  cajero: string;
  clienteNombre: string;
  clienteDoc: string;
  metodoLabel: string;
  items: { nombre: string; cantidad: number; precioUnitario: number; total: number }[];
  subtotal: number;
  igv: number;
  descuento?: number;
  total: number;
  /** Desglose de pagos: con 2+ métodos se imprime línea por línea (mixto). */
  pagos?: { label: string; monto: number; referencia?: string }[];
  /** Efectivo entregado y vuelto (solo venta nueva en efectivo). */
  recibido?: number;
  vuelto?: number;
  /** Si la venta está anulada, motivo a estampar en el ticket. */
  anuladaMotivo?: string | null;
}

/**
 * ComprobanteService — responsable de la PRESENTACIÓN del comprobante:
 *  - formato de fecha/hora y etiqueta de método de pago,
 *  - generación del HTML imprimible (ticket 80mm).
 *
 * Vive fuera del PosComponent para que el componente no cargue con lógica
 * de presentación de impresión (que es frágil y testeable por separado).
 *
 * Datos de la botica (RUC, dirección, etc.) están centralizados acá; cuando
 * exista el módulo de Configuración se inyectarán desde ahí.
 */
@Injectable({ providedIn: 'root' })
export class ComprobanteService {
  private readonly configSvc = inject(ConfiguracionService);

  /** Datos de cabecera del negocio, tomados de la Configuración global.
   *  Público: el modal del POS lo usa para el preview en pantalla. */
  negocio() {
    const c = this.configSvc.config();
    return {
      nombre: c?.razonSocial || 'Mi Botica',
      ruc: c?.ruc || '',
      direccion: c?.direccionFiscal || '',
      telefono: c?.telefono || '',
      pieTicket: c?.pieTicket || '¡Gracias por su compra! Conserve su comprobante.',
    };
  }

  /**
   * Imprime un HTML de ticket usando un IFRAME OCULTO (no window.open):
   * inmune a bloqueadores de popups y sin document.write en ventana nueva.
   * Lo comparten el POS (venta nueva) y el Historial (reimpresión).
   */
  imprimir(html: string): void {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) { iframe.remove(); return; }
    doc.open();
    doc.write(html);
    doc.close();
    // Pequeña espera para que cargue el layout antes de imprimir.
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // Se retira después de que el diálogo de impresión tomó el contenido.
      setTimeout(() => iframe.remove(), 3000);
    }, 300);
  }

  /** Fecha/hora legible (es-PE) para el ticket y el modal de venta. */
  formatFechaHora(d: Date): string {
    return d.toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  /** Etiqueta humana del método de pago. */
  labelMetodo(m: MetodoPago): string {
    switch (m) {
      case 'TARJETA':       return 'Tarjeta';
      case 'EFECTIVO':      return 'Efectivo';
      case 'YAPE_PLIN':     return 'Yape / Plin';
      case 'TRANSFERENCIA': return 'Transferencia';
      case 'MIXTO':         return 'Mixto';
    }
  }

  /** Genera el ticket de una venta NUEVA del POS (mapea al formato neutral). */
  generarHTML(v: VentaCompletada): string {
    return this.generarDesde({
      numeroComprobante: v.numeroComprobante,
      tipoComprobante: v.tipoComprobante,
      fechaHoraTexto: this.formatFechaHora(v.fechaHora),
      cajero: `${v.cajero} · ${v.terminal}`,
      clienteNombre: v.cliente
        ? `${v.cliente.nombres} ${v.cliente.apellidos ?? ''}`.trim()
        : 'Consumidor Final',
      clienteDoc: v.cliente?.numeroDocumento
        ? `${v.cliente.tipoDocumento}: ${v.cliente.numeroDocumento}`
        : '',
      metodoLabel: this.labelMetodo(v.metodoPago),
      items: v.items.map((it) => ({
        nombre: it.producto.nombre,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        total: it.precioUnitario * it.cantidad,
      })),
      subtotal: v.subtotal,
      igv: v.igv,
      descuento: v.descuento,
      total: v.total,
      pagos: v.pagos,
      recibido: v.recibido,
      vuelto: v.vuelto,
    });
  }

  /** Genera el HTML imprimible (80mm) desde el formato neutral. Fuente única del ticket. */
  generarDesde(d: ComprobanteImprimible): string {
    const neg = this.negocio();
    const filas = d.items.map((it) => `
      <tr>
        <td style="padding:4px 6px;font-size:11px;">${it.nombre}</td>
        <td style="padding:4px 6px;font-size:11px;text-align:center;">${it.cantidad}</td>
        <td style="padding:4px 6px;font-size:11px;text-align:right;">S/ ${it.precioUnitario.toFixed(2)}</td>
        <td style="padding:4px 6px;font-size:11px;text-align:right;">S/ ${it.total.toFixed(2)}</td>
      </tr>`).join('');

    const selloAnulada = d.anuladaMotivo !== undefined && d.anuladaMotivo !== null
      ? `<div style="text-align:center;color:#b30000;font-weight:bold;font-size:13px;margin:8px 0;padding:6px;border:2px dashed #b30000;">
           *** ANULADA ***
           ${d.anuladaMotivo ? `<div style="font-size:10px;font-weight:normal;margin-top:4px;">${d.anuladaMotivo}</div>` : ''}
         </div>`
      : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>${d.numeroComprobante}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; width: 80mm; margin: 0 auto; padding: 8px; font-size: 12px; color: #111; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-top: 1px dashed #333; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 10px; text-transform: uppercase; padding: 4px 6px; border-bottom: 1px solid #333; text-align: left; }
    th:not(:first-child) { text-align: right; }
    .total-row td { font-weight: bold; font-size: 12px; }
    .grand-total td { font-size: 15px; font-weight: bold; border-top: 1px solid #333; padding-top: 6px; }
    @media print {
      @page { margin: 4mm; size: 80mm auto; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="bold" style="font-size:16px;">${neg.nombre}</div>
    ${neg.ruc ? `<div style="font-size:10px;">RUC: ${neg.ruc}</div>` : ''}
    ${neg.direccion ? `<div style="font-size:10px;">${neg.direccion}</div>` : ''}
    ${neg.telefono ? `<div style="font-size:10px;">Tel: ${neg.telefono}</div>` : ''}
  </div>

  <div class="divider"></div>

  <div class="center bold" style="font-size:13px;">${d.tipoComprobante} DE VENTA</div>
  <div class="center" style="font-size:11px;">${d.numeroComprobante}</div>
  ${selloAnulada}

  <div class="divider"></div>

  <div style="font-size:10px;">
    <div><b>Fecha:</b> ${d.fechaHoraTexto}</div>
    <div><b>Cajero:</b> ${d.cajero}</div>
    <div><b>Cliente:</b> ${d.clienteNombre}</div>
    ${d.clienteDoc ? `<div><b>${d.clienteDoc}</b></div>` : ''}
    ${
      d.pagos && d.pagos.length > 1
        ? `<div><b>Pago:</b></div>` +
          d.pagos
            .map(
              (p) =>
                `<div style="padding-left:8px;">· ${p.label}: S/ ${p.monto.toFixed(2)}${p.referencia ? ` (Ref. ${p.referencia})` : ''}</div>`,
            )
            .join('')
        : `<div><b>Método de pago:</b> ${d.metodoLabel}${
            d.pagos?.[0]?.referencia ? ` (Ref. ${d.pagos[0].referencia})` : ''
          }</div>`
    }
  </div>

  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <th style="width:50%;">Producto</th>
        <th style="width:10%;text-align:center;">Cant</th>
        <th style="width:20%;text-align:right;">Precio</th>
        <th style="width:20%;text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>

  <div class="divider"></div>

  <table>
    <tr>
      <td style="font-size:11px;padding:2px 6px;">Subtotal (sin IGV)</td>
      <td style="font-size:11px;padding:2px 6px;text-align:right;">S/ ${d.subtotal.toFixed(2)}</td>
    </tr>
    <tr>
      <td style="font-size:11px;padding:2px 6px;">IGV (18%)</td>
      <td style="font-size:11px;padding:2px 6px;text-align:right;">S/ ${d.igv.toFixed(2)}</td>
    </tr>
    ${d.descuento && d.descuento > 0 ? `<tr>
      <td style="font-size:11px;padding:2px 6px;">Descuento</td>
      <td style="font-size:11px;padding:2px 6px;text-align:right;">- S/ ${d.descuento.toFixed(2)}</td>
    </tr>` : ''}
    <tr class="grand-total">
      <td style="padding:6px 6px 2px;">TOTAL</td>
      <td style="padding:6px 6px 2px;text-align:right;">S/ ${d.total.toFixed(2)}</td>
    </tr>
    ${d.recibido != null && d.vuelto != null ? `<tr>
      <td style="font-size:11px;padding:4px 6px 0;">Recibido</td>
      <td style="font-size:11px;padding:4px 6px 0;text-align:right;">S/ ${d.recibido.toFixed(2)}</td>
    </tr>
    <tr>
      <td style="font-size:12px;font-weight:bold;padding:2px 6px;">Vuelto</td>
      <td style="font-size:12px;font-weight:bold;padding:2px 6px;text-align:right;">S/ ${d.vuelto.toFixed(2)}</td>
    </tr>` : ''}
  </table>

  <div class="divider"></div>

  <div class="center" style="font-size:10px;">
    <div>${neg.pieTicket}</div>
  </div>
</body>
</html>`;
  }
}
