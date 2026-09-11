# FarmaSys — Procedimiento de apertura de tienda (datos reales)

> Cómo dejar una botica operando con SU catálogo y SU stock el día 1.
> Duración típica: 1 tarde de preparación + 1 conteo físico.

## Paso 1 — Preparar el archivo del catálogo

1. Pedir al cliente su lista de productos (Excel de su sistema anterior,
   lista de proveedor o inventario a mano).
2. Acomodarla a la plantilla: en el sistema → **Importar catálogo →
   Descargar plantilla de ejemplo**. Columnas requeridas: codigo, nombre,
   categoria, presentacion, factor, precio.
   - Un producto con caja/blíster/unidad = 3 filas con el MISMO código.
   - `factor` = cuántas unidades base trae (caja x 100 → 100; unidad → 1).
   - Marcar `base` = si en UNA presentación (la unidad mínima que venden).
3. Guardar como CSV (Excel: Archivo → Guardar como → CSV).

## Paso 2 — Importar (sin miedo)

1. Entrar como ADMIN → **Importar catálogo** → elegir el archivo.
2. **Validar** (no escribe nada) → revisar el reporte de observaciones →
   corregir el Excel y repetir hasta que esté limpio (o aceptar los saltos).
3. **Importar al catálogo**. Es todo-o-nada; los códigos ya existentes se
   saltan, nunca se pisan.

## Paso 3 — Stock inicial con el módulo de Inventario Físico

El catálogo importado nace con stock CERO (correcto: el stock real lo define
el conteo, no el Excel).

1. **Inventario Físico → Nuevo conteo** en la sucursal.
2. Contar producto por producto POR LOTE: cantidad + N° de lote +
   vencimiento (la fecha impresa en la caja). Sin lote visible → usar
   "S/L" + mejor estimado de vencimiento.
3. **Cerrar el conteo**: el sistema ajusta stock y lotes a lo contado y
   queda el acta imprimible como respaldo.

> Este mismo procedimiento corrige el stock descuadrado por ajustes
> antiguos (StockSucursal ≠ suma de lotes).

## Paso 4 — Configuración final

1. **Configuración**: razón social, RUC, dirección fiscal, teléfono y pie
   de ticket REALES (salen impresos en cada boleta).
2. **Sucursales**: series de comprobantes (B001/F001/T001), QR de Yape/Plin.
3. **Usuarios**: crear las cuentas reales por rol; borrar/desactivar las de
   prueba. Contraseñas fuertes.
4. Venta de prueba de punta a punta: abrir caja → vender → imprimir →
   verificar en Historial → anular → verificar stock → cerrar caja con
   reporte Z.

## Paso 5 — Primer día acompañado

- Estar presente en la apertura de caja y las primeras ventas.
- Dejar impresas las guías de CAPACITACION.md junto a la caja.
- Anotar TODO lo que confunda al personal: esa lista es el backlog real.
