# Handoff: FarmaSys — Sistema de gestión para botica (Perú)

> Generado el 2026-07-13. Léeme completo antes de tocar nada — reemplaza el contexto de la
> conversación anterior. Lo marcado con ⚠️ debe confirmarse con el usuario antes de asumir.

## 1. Resumen del proyecto

**FarmaSys** es un sistema **real y completo de gestión para una botica/farmacia peruana**,
multi-sucursal. No es un demo: el objetivo del usuario (AxelH) es que se vea **serio y
profesional para venderlo a un cliente**, funcionando con **datos reales (cero mocks)** y
reflejando cómo opera una botica de verdad (Inkafarma/Mifarma como referencia).

Stack:
- **Backend**: NestJS 10 (`@nestjs/core ^10.4.0`) + Prisma 5 (`@prisma/client ^5.18.0`) +
  PostgreSQL 16, corriendo en **Docker**. TypeScript `^5.5.0`.
- **Frontend**: Angular 20 (`@angular/core ^20.2.0`) standalone + signals. TypeScript `~5.9.2`.
  Tailwind (tokens propios), Material Symbols, ApexCharts vanilla (`^3.54.1`).
- Rutas en disco: repo en `H:\sistema-botica` (front en `src/`, backend en `backend/`).

## 2. Estado actual

**Todo el sistema está conectado a datos reales** (no queda ningún módulo mock salvo restos de
HTML muerto, ver §8). Funciona: Auth (JWT access+refresh), POS (venta transaccional FEFO, pago
mixto, descuento, receta), Caja (apertura/movimientos/cierre-arqueo + **Reporte Z imprimible**),
Inventario (stock+lotes reales, vista por-lote, ajuste lote-consistente), Compras (medicamentos +
proveedores + ingreso de stock), Reposición (sugerencia por demanda), **Mermas** (baja formal),
**Transferencias** entre sucursales, **Inventario físico** (conteo por lote + acta), Historial de
Ventas (búsqueda/filtros server-side + devoluciones), **Devoluciones** (parcial, reingreso de
stock, egreso de caja), Finanzas (P&L + gráficos ApexCharts + Gastos), Usuarios, Sucursales,
Configuración (singleton + ticket).

**Pendiente / no hecho aún**: SUNAT (comprobante electrónico + nota de crédito) — **diferido a
propósito** ("el lunes atienden el PSE"); medicamentos controlados con receta retenida (DIGEMID);
despliegue a la nube. Ver §9.

**Importante**: no se puede compilar Angular en este entorno; la verificación es por
`transpileModule`/`parseDiagnostics` (ver §6). Por eso los bugs salen recién al hacer **QA en
vivo** — el usuario está justo en esa ronda de QA.

## 3. Arquitectura y estructura

**Backend** (`backend/src/`), un módulo Nest por dominio:
`auth`, `usuarios`, `sucursales`, `productos`, `inventario`, `inventario-fisico`, `compras`,
`ventas`, `devoluciones`, `transferencias`, `caja`, `clientes`, `reportes`, `gastos`,
`configuracion`, `sunat` (stub), `prisma`. Schema único en `backend/prisma/schema.prisma`.

**Frontend** (`src/app/features/`): `auth`, `pos`, `caja`, `inventario`, `inventario-fisico`,
`compras`, `reposicion`, `mermas`, `transferencias`, `ventas` (historial), `clientes`, `finanzas`,
`usuarios`, `sucursales`, `configuracion`, `dashboard`, `facturacion`. Servicios en
`src/app/core/services/`, modelos en `src/app/core/models/`, guards/interceptor/auth en
`src/app/core/auth/`. Rutas lazy en `src/app/app.routes.ts`, sidebar en
`src/app/layout/sidebar/sidebar.html`.

Patrones/convenciones estructurales deliberadas:
- Backend: DTOs con class-validator; `@Roles()` guard + `@CurrentUser() user: JwtPayload`
  (`.sub`, `.roles`, `.sucursalId`); toda mutación de stock/dinero en `prisma.$transaction`;
  `Decimal` nunca float; soft-delete; correlativo atómico.
- **Toda salida/entrada de stock pasa por lotes** para no descuadrar `Lote` vs `StockSucursal`.
  El kardex (`MovimientoStock`) registra **un movimiento por lote** con `loteId` + `referenciaId`.
- Frontend: Angular 20 standalone + `signal`/`computed`; `inject()`; `ApiService` (get/post/put/
  patch/delete); control-flow nuevo (`@if/@for/@empty/@let`); FormsModule ngModel.
- ApexCharts se usa **vanilla** (`import ApexCharts from 'apexcharts'`), NO ng-apexcharts.

## 4. Decisiones tomadas y su razón

- **Decisión**: FEFO reversible mediante el kardex, sin campo nuevo.
  **Por qué**: `inventario.consumirFefo` ya calculaba el desglose por lote pero lo tiraba (escribía
  un solo movimiento con el primer lote). Anulación/devolución devolvían todo al "lote más reciente"
  → distorsionaba vencimientos. Ahora `consumirFefo` escribe **un `MovimientoStock` por lote**
  consumido, y `inventario.reingresarStock(tx, {...})` devuelve a los **lotes originales** leyendo
  esos movimientos (por vencimiento, descontando reingresos previos → soporta devoluciones
  parciales). Fallback al lote más reciente para ventas antiguas sin rastro.
  **Alternativas descartadas**: tabla `VentaItemLote` (más schema, innecesaria: el kardex ya tenía
  `loteId`+`referenciaId`).

- **Decisión**: Ajuste manual de stock (`inventario.ajustar`) hecho **lote-aware**.
  **Por qué**: antes cambiaba `StockSucursal` agregado sin tocar lotes → drift (stock no vendible).
  Ahora: negativo = descuenta por FEFO de los lotes; positivo = **exige `loteNumero`+`vencimiento`**
  (crea/incrementa ese lote) o manda a Compras.
  **Alternativas descartadas**: quitar el ajuste (perdía funcionalidad útil).

- **Decisión**: Transferencias con FEFO que **preservan lote y vencimiento** en destino, con lógica
  propia (no reusa `consumirFefo`).
  **Por qué**: `consumirFefo` hardcodea `tipo: 'VENTA'`; usarlo etiquetaría mal el kardex. Se
  escribió un loop propio con `TRASLADO_SALIDA`/`TRASLADO_INGRESO` para **no tocar el flujo de
  venta** (regla de oro del usuario).

- **Decisión**: Inventario físico **cuenta por lote**; al cerrar, el delta se calcula contra la
  cantidad **actual** del lote (no la foto).
  **Por qué**: contar por producto (agregado) volvía a descuadrar lotes; contra la foto pisaría
  ventas ocurridas durante el conteo.

- **Decisión**: Historial de Ventas filtra/busca/ordena **en el servidor** con endpoint nuevo
  `GET /ventas/historial` (devuelve `{items,total}`); el viejo `GET /ventas` queda intacto.
  **Por qué**: la búsqueda/método eran client-side sobre las ~50 filas cargadas → no encontraba
  ventas antiguas. `GET /ventas` no se tocó para no romper Dashboard/KPIs (cero riesgo).

- **Decisión**: "Anuladas hoy" se cuenta por `Venta.anuladaEn` (campo nuevo), no por fecha de
  creación. **Por qué**: contaba ventas creadas hoy que están anuladas, no las anulaciones hechas
  hoy → daba números incorrectos.

- **Decisión**: ApexCharts vanilla. **Por qué**: ng-apexcharts choca con peer-deps de Angular 20.

- **Decisión**: Quedarse en Prisma 5 (no subir a 7). **Por qué**: major = breaking; se haría como
  tarea dedicada, no en medio del avance.

- **Decisión**: RUC del proveedor validado igual en front y back (`/^(10|15|17|20)\d{9}$/`).
  **Por qué**: el front solo validaba "11 dígitos" y el back exige prefijo → el usuario mandaba un
  RUC que el back rechazaba y parecía bug. Es la regla real del RUC peruano.

- **Decisión**: En el POS, un producto se habilita si hay **≥1 unidad base vendible**, no si hay una
  "caja" completa. **Por qué**: `stockDisponible = floor(stock/factorVenta)` deshabilitaba productos
  con stock < caja (ej. Ibuprofeno 52 und con caja mayor) aunque se vendan por unidad. El selector
  de presentación ya deja elegir la unidad más chica.

## 5. Cambios realizados en esta sesión

Front (Angular) — solo recarga con `ng serve`, salvo donde se indique rebuild:
- `src/app/core/auth/jwt.interceptor.ts` — nuevo `mensajeBackend()` que extrae el mensaje real de
  NestJS (`message` string o array) y `case 400`/`422`; antes leía `err.error.mensaje` (español)
  → mostraba "Error inesperado (400)" genérico.
- `src/app/core/services/venta.service.ts` — `listarPaginado()` → `HistorialPaginado{items,total}`;
  `contarAnuladas()`; `VentaBackend` +`devoluciones`, +`anuladaEn`; `FiltroListadoVentas` +`q`/
  `metodoPago`/`orden`.
- `src/app/features/ventas/ventas.ts` + `ventas.html` — filtros server (búsqueda con debounce 350ms,
  método, estado, fechas, **orden** por columna), señal `total`, "Mostrando X de N", badge/neto de
  **devolución** por fila, sección de devoluciones en el detalle, `anuladaEnTexto`, KPI anuladas por
  `anuladasHoy`.
- `src/app/core/services/devolucion.service.ts` — `DevolucionBackend`, `listar` tipado.
- `src/app/core/services/inventario-api.ts` — `ajustar()` +`loteNumero?`/`vencimiento?`.
- `src/app/features/inventario/inventario.ts` + `inventario.html` — **quitado el array mock**
  (~100 líneas) → señal vacía + `cargando` + skeletons + vacío; `ProductoInventario.lotes[]` +
  **vista por-lote** en el detalle (estado por lote, FEFO marcado); enlaces a Mermas/Reposición;
  ajuste con `lote`+`vencimiento` para ingresos; helpers `estadoLote`/`unidadesVencidas`/`irAMermas`/
  `irAReposicion`.
- `src/app/core/services/merma.service.ts` (NUEVO); `src/app/features/mermas/mermas.ts` +
  `mermas.html` (NUEVO) — página de mermas.
- `src/app/core/services/transferencia.service.ts` (NUEVO);
  `src/app/features/transferencias/transferencias.ts` + `.html` (NUEVO).
- `src/app/core/services/inventario-fisico.service.ts` (NUEVO);
  `src/app/features/inventario-fisico/inventario-fisico.ts` + `.html` (NUEVO) — conteo + **acta**
  imprimible.
- `src/app/core/services/caja.service.ts` — `reporteZ()` + interface `ReporteZBackend`.
- `src/app/features/caja/caja.ts` + `caja.html` — `imprimirZ()`/`renderZ()` (ticket imprimible),
  auto-imprime al cerrar, "Vista previa Z" y botón imprimir en el historial.
- `src/app/features/compras/compras.ts` (template inline) — RUC validación alineada + `rucInvalido()`
  con hint en vivo; `busquedaProv` + `proveedoresFiltrados`; muestra teléfono.
- `src/app/features/pos/pos.ts` + `pos.html` — `hayStock(p)`; `[disabled]="!hayStock(p)"` (x2);
  `grupoConStock` usa base>0.
- `src/app/app.routes.ts` — rutas `/mermas`, `/transferencias`, `/inventario-fisico`.
- `src/app/layout/sidebar/sidebar.html` — ítems Mermas, Transferencias, Inventario físico.

Backend (Nest) — **requieren `docker compose up -d --build api`** (los de schema, marcados 🔷):
- 🔷 `backend/prisma/schema.prisma` — `Venta.anuladaEn DateTime?`; enum `TipoMovimientoStock` +`MERMA`;
  modelos `Transferencia`/`TransferenciaItem` (+relaciones en Sucursal/Usuario/Producto);
  `ConteoInventario`/`ConteoItem` (+relaciones en Sucursal/Usuario).
- `backend/src/inventario/inventario.service.ts` — `consumirFefo` escribe 1 mov por lote;
  `reingresarStock()` (helper); `darDeBajaLote` categorizado; `lotesParaBaja()`; `listarMermas()`;
  `ajustar()` lote-aware.
- `backend/src/inventario/dto/baja-lote.dto.ts` — `categoria`(enum)/`nota`/`cantidadBase`.
- `backend/src/inventario/dto/ajuste-stock.dto.ts` — +`loteNumero?`/`vencimiento?`.
- `backend/src/inventario/inventario.controller.ts` — GET `lotes-para-baja/:sucursalId`,
  GET `mermas/:sucursalId`; baja con rol +FARMACEUTICO.
- `backend/src/ventas/ventas.service.ts` — `anular` setea `anuladaEn` + usa `reingresarStock`;
  `construirWhere`/`construirOrden`/`listar`/`listarHistorial`/`contarAnuladas`; `listaInclude`
  con devoluciones.
- `backend/src/ventas/ventas.controller.ts` — GET `historial`, GET `anuladas/contar` (antes de `:id`).
- `backend/src/devoluciones/devoluciones.service.ts` + `devoluciones.module.ts` — usa
  `reingresarStock` (inyecta InventarioService; módulo importa InventarioModule).
- `backend/src/transferencias/*` (NUEVO módulo) — service (FEFO lote-preserving), controller, module,
  dto.
- `backend/src/inventario-fisico/*` (NUEVO módulo) — service (abrir/actual/guardar/cerrar/obtener/
  historial), controller, module, dto.
- `backend/src/caja/caja.service.ts` — `reporteZ` +`anuladas` count.
- `backend/src/app.module.ts` — +TransferenciasModule, +InventarioFisicoModule.

## 6. Convenciones y restricciones del proyecto (citadas del usuario)

- **"cero riesgos" al flujo de venta**: toda función nueva debe ser aditiva y no tocar el registro
  de venta. Regla de oro repetida.
- **Sistema real, sin mocks**: "yo quiero que sea un sistema real en funcionamiento".
- **Marca azul (primary)**: no cambiar los colores; el usuario rechazó rediseños ("los colores que
  tenía estaba bien", "no me convence tu diseño").
- **No hacer preguntas innecesarias**; el usuario delega en mi criterio de experto ("haz lo
  recomendado tú mismo").
- **Conservar tokens / menos narración**: "hazlo pero no me digas que está haciendo ahora tokens
  también" → ejecutar con poca cháchara y resumen breve.
- **SUNAT diferido**: "el sunat facturación lo dejamos para después porque el lunes atenderán".
- Verificación (el sandbox NO compila Angular): front vía `ts.transpileModule` filtrando
  `/template literal|Invalid character|Unterminated/`; backend vía `ts.createSourceFile().parseDiagnostics`
  filtrando `/Unterminated|Invalid character|expected/`. Correr node desde `/tmp` requiriendo el
  typescript por ruta absoluta.
- **Artefacto del mount**: archivos recién editados aparecen **truncados** al leerlos por bash
  (`wc`/`tail`/parse dan falsos "'}' expected"/UNBAL). El **Read tool es la fuente autoritativa**.
- Gotcha Angular: `[class.bg-primary/5]` / `[class.hover:bg-x]` rompen (slash/dos-puntos en la key)
  → usar `[class]="cond ? 'clase a' : 'clase b'"`.
- Timezone Perú: filtros de fecha con sufijo `-05:00`.

## 7. Dependencias, entorno y comandos

- Front: Angular 20.2, TS 5.9.2, ApexCharts 3.54.1. Correr: `ng serve` (hot-reload).
- Backend: NestJS 10.4, Prisma 5.18, TS 5.5, PostgreSQL 16, Redis (compose).
- `.env` (backend): secretos JWT fuertes (64-char base64url), `NODE_ENV`, DB/Redis, vars SUNAT.
- **Rebuild backend** (tras cambios de código o schema): `docker compose up -d --build api`.
  El `CMD` del Dockerfile corre `npx prisma db push --skip-generate --accept-data-loss && node
  dist/main` (el `--accept-data-loss` se añadió para no colgar el arranque en cambios UNIQUE; los
  cambios recientes son aditivos → seguro).
- Prisma local: si `npx prisma generate` pide instalar prisma 7, responder `n` y usar el rebuild de
  docker (el cliente se genera en el build).

## 8. Problemas conocidos / errores pendientes

- **Código muerto en Inventario**: `src/app/features/inventario/inventario.html` conserva ~350
  líneas de modales inertes ("Nota de Ingreso" y "Nuevo Producto", que redirigen a Compras) + sus
  métodos TS (`confirmarNotaIngreso`, `guardarNuevoProducto`, etc., con IDs falsos `p+Date.now()`).
  No se ven (nunca se abren) pero ensucian. No se borraron porque el **mount truncado** hace
  riesgoso el borrado masivo por script; hay que hacerlo con el Read tool + Edit por bloques.
- **Datos de stock ya descuadrados** (pre-fix): productos ajustados con el ajuste viejo pueden tener
  `StockSucursal` > suma de lotes; se veían "deshabilitados" en POS. El **fix de lógica** ya está
  (POS habilita por base>0, ajuste ahora es lote-aware), pero los **datos existentes** pueden seguir
  descuadrados hasta que se corrijan con un **Inventario físico**.
- No hay error de compilación pendiente conocido; la verificación por transpile/parse pasó en todos
  los archivos tocados.
- El QA en vivo es la vía real de detección de bugs (ver §9).

## 9. Próximos pasos (prioridad)

1. **Ronda de QA en vivo** (`docker compose up -d` + `ng serve`), en orden: (a) venta → anular →
   verificar que el stock vuelve al lote correcto; (b) devolución parcial → stock + egreso caja +
   se ve en el detalle; (c) merma de un vencido → stock baja + historial + valor; (d) transferencia
   entre 2 sucursales → baja origen / sube destino mismo lote; (e) inventario físico → contar,
   cerrar (ajusta), abrir acta e imprimir; (f) inventario → ajuste(+) pide lote, vista por-lote,
   enlaces; (g) historial ventas → buscar por documento, ordenar, badge "Devuelto"; (h) POS →
   Ibuprofeno/Paracetamol ya deben dejar agregar.
2. **Limpiar el HTML muerto** del inventario (cierra el "inventario serio").
3. **Legal**: SUNAT (comprobante electrónico + nota de crédito, vía PSE) y **controlados: receta
   retenida + libro** (DIGEMID).
4. **Mejora Compras**: botón "Validar RUC" que **autocomplete razón social/dirección desde el padrón
   SUNAT** (encaja con la integración SUNAT).
5. **Producción**: despliegue a la nube (VPS + docker-compose + HTTPS/Caddy + backups + `prisma
   migrate`).

## 10. Preguntas abiertas

- ⚠️ **¿Cuántas sucursales tendrá el cliente?** Si es una sola, Transferencias queda inactivo (no
  estorba). El usuario dudó de esto ("espera... esto es boticas").
- ⚠️ ¿Se hace la limpieza del HTML muerto antes o después de SUNAT?
- ⚠️ Confirmar con el usuario el proveedor PSE/SUNAT que usará (define la integración de facturación
  electrónica).

## 11. Prompt para pegar en el chat nuevo

```
Contexto adjunto: `handoff-farmasys-2026-07-13.md`. Léelo completo antes de responder — tiene el
estado real del proyecto (FarmaSys, botica Perú, NestJS+Prisma+Angular), las decisiones tomadas y
por qué, los archivos tocados y las restricciones del usuario (cero riesgo al flujo de venta, sin
mocks, marca azul, SUNAT diferido).
Estado actual: sistema completo y conectado a datos reales; en ronda de QA en vivo tras cerrar
inventario/caja/transferencias/mermas/devoluciones. Siguiente paso concreto: terminar el QA de los
8 flujos del §9 y arreglar lo que salga (recordar: rebuild backend con `docker compose up -d --build api`).
```
