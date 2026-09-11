# FarmaSys — Cómo funciona el sistema

Mapa del funcionamiento, para saber **dónde tocar** cuando haya que cambiar algo
y **qué no romper**. Escrito a partir de auditar el código, no del diseño
original: describe lo que el sistema hace de verdad.

---

## 1. El mapa en una frase

El **stock** entra por Compras, sale por Ventas, y se corrige por cuatro
desvíos (devolución, merma, transferencia, ajuste). La **plata** entra por
Caja, que envuelve cada venta. **Finanzas** no guarda nada: calcula todo a
partir de esos movimientos.

```
                    ┌── Devolución ──┐  (vuelve stock y plata)
                    │                ▼
Producto → Compra → STOCK → Venta → Caja → Finanzas
             │        ▲  │
             │        │  ├── Merma ──────►  (sale stock, es pérdida)
             │        │  ├── Transferencia ►  (mueve stock + su costo)
             │        │  └── Ajuste ──────►  (corrige diferencias)
             │        │
             └── costo promedio ponderado
```

**Regla que gobierna todo:** cada movimiento de stock deja un registro en el
**kardex** (`MovimientoStock`) con su lote **y quién lo hizo**. Si algo no
cuadra, ahí está la respuesta.

Los tres rastros que permiten reconstruir cualquier problema:

| Qué pasó | Dónde queda |
|---|---|
| Se movió mercadería | Kardex (`MovimientoStock`) — §5.2 |
| Alguien entró al sistema | Auditoría de accesos (`RegistroAcceso`) — §7 |
| Se cambió un ajuste del sistema | Bitácora de configuración (`CambioConfiguracion`) — §6 |

---

## 2. El ciclo del producto

### 2.1 Alta (Compras → Medicamentos)

Se crea el **catálogo**, no el stock. Un producto nace sin existencias.

Lo que se define:

| Campo | Para qué |
|---|---|
| `codigo` | Único. Identifica el producto. |
| `nombre` + `concentracion` | Se validan juntos contra duplicados. |
| `formaFarmaceutica` | Tableta, jarabe, ampolla… distingue productos del mismo principio activo. |
| `categoria` | Lista cerrada (con opción de crear). Alimenta los reportes por categoría. |
| `afectacionIgv` | GRAVADO / EXONERADO / INAFECTO. **Decide si el precio lleva IGV dentro.** |
| `stockMinimo` | Umbral de alerta. Si es 0, se usa el global de Configuración. |
| `presentaciones` | Al menos una. Aquí vive el **precio de venta**. |

**Presentaciones — el concepto clave.** Un producto se vende de varias formas:
caja, blíster, unidad. Cada una tiene su **factor** (cuántas unidades base
contiene) y su **precio**. La marcada como `esBase` es la unidad mínima.

Todo el stock se guarda en **unidades base**. Si vendes una caja con factor 100,
el sistema descuenta 100. Por eso el factor no se toca a la ligera.

### 2.2 Ingreso de mercadería (Compras → Ingreso)

Crea **lote + stock + costo**, todo en una transacción:

1. Valida que el proveedor exista y la factura no esté repetida.
2. Rechaza lotes que **llegan vencidos**.
3. Crea o suma al lote (mismo número + mismo vencimiento = mismo lote).
4. Recalcula el **costo promedio ponderado**:
   `(cantidadVieja×costoViejo + cantidadNueva×costoNuevo) / total`
5. Si el producto entra por primera vez a esa botica, hereda el stock mínimo.

> El costo promedio es la base de **todo** el margen en Finanzas. Cualquier cosa
> que sume stock sin actualizarlo distorsiona los reportes.

### 2.3 Venta (POS)

1. **Exige caja abierta** — validado en el front y en el backend.
2. Toma el precio de la **presentación** elegida.
3. Rechaza productos **sin precio** (a S/ 0 se despacharían gratis).
4. Descuenta por **FEFO**: primero el lote que vence antes, ignorando vencidos.
5. **Congela el costo** del momento en `VentaItem.costoUnitario` — así el margen
   histórico no cambia cuando el proveedor suba precios.
6. Separa el IGV: `subtotal = total − igv`, y el IGV solo sobre lo GRAVADO.
7. Registra el pago (admite mixto) y suma a la caja del turno.

**Idempotencia:** el cobro lleva una clave única. Si el cajero da doble clic o
la red reintenta, **no se duplica la venta**.

### 2.4 Cobro con tarjeta, Yape y transferencia

**El sistema NO se conecta al datáfono.** El cajero pasa la tarjeta en la
maquinita física, sale el voucher, y en el POS registra el cobro. Integrarse a
un terminal (Izipay lo permite vía la plataforma AXIUM sobre terminales Android)
exige convenio comercial y terminal compatible — no está hoy y no hace falta.

Por eso cada método sin efectivo tiene su **campo de referencia**, que se guarda
en `Pago.referencia` y sale impreso en el ticket:

| Método | Qué se anota |
|---|---|
| Tarjeta | N° de operación del voucher + últimos 4 dígitos (opcional) |
| Transferencia | N° de operación |
| Yape / Plin | Celular o código de operación |

Sin esto, al cierre del día el total de tarjeta del sistema y el del datáfono
pueden no coincidir y **no hay forma de saber qué venta falta**. El caso típico:
la tarjeta se rechaza, el cajero ya marcó "Tarjeta", el cliente paga en efectivo
y nadie corrige.

En el **pago mixto** cada pata lleva su propia referencia: el voucher y el
código de Yape son documentos distintos y se cuadran por separado.

**Lo que NO entra al arqueo:** solo el efectivo cuenta para el esperado en el
cajón (§4). Tarjeta, Yape y transferencia aparecen en el reporte Z como
desglose, no como plata en la gaveta.

**Pendiente:** la **comisión del operador** (≈3,4 % + un fijo por transacción)
no se descuenta en ningún lado. La utilidad sale inflada en proporción a cuánta
tarjeta se cobre. Ver `PENDIENTES.md`.

---

## 3. Los cuatro desvíos

| Desvío | Qué hace con el stock | Qué hace con el costo |
|---|---|---|
| **Devolución** | Reingresa **al lote original** de esa venta. Admite parciales. | No lo toca (correcto: vuelve al mismo costo). |
| **Merma** | Descuenta el lote. Es pérdida definitiva. | No lo toca. Se valoriza a costo para el P&L. |
| **Transferencia** | Saca por FEFO del origen, crea/suma el mismo lote en destino. | **Lo lleva consigo** y recalcula el promedio en destino. |
| **Ajuste** | `−` descuenta por FEFO; `+` exige lote y vencimiento. | **NO lo actualiza** ← limitación conocida. |
| **Conteo físico** | Aplica la diferencia lote por lote al cerrar. | No lo toca. |

**Sobre el ajuste `+`:** suma stock sin costo ni proveedor. Si el producto nunca
se compró, esas unidades valen 0 y el margen miente. El camino correcto para
mercadería con costo es **Compras**; para diferencias de conteo, **Inventario
Físico**. Queda pendiente decidir si se restringe.

---

## 4. Caja: cómo envuelve la plata

```
Abrir turno (terminal + monto inicial)
   ↓
Ventas del turno + movimientos manuales (ingresos/egresos)
   ↓
Arqueo: esperado = inicial + ventas efectivo + ingresos − egresos
   ↓
Cerrar: se cuenta el efectivo real → diferencia → reporte Z impreso
```

Reglas que hace cumplir:

- **Un cajón físico = una sesión.** Dos personas no pueden abrir el mismo terminal.
- **Un cajero, una caja abierta**, en cualquier sucursal.
- El **terminal debe estar catalogado** (nada de texto libre que cree terminales fantasma).
- Al abrir sugiere el **fondo del cierre anterior** de ese terminal (relevo de turno).
- Las **cajas olvidadas** (+24 h) se avisan en el dashboard: bloquean su terminal.
- Solo el **dueño de la caja** puede cerrarla — o un admin, y queda registrado quién.

> **Trampa que ya costó un bug:** en "Cierres recientes", el nombre del cajero
> se tomaba del **usuario conectado**, no del cajero de esa sesión. Las mismas
> sesiones aparecían a nombre de personas distintas según quién mirara la
> pantalla. En un módulo de arqueo de efectivo eso falsea la única pista de
> quién manejó la caja. El backend siempre devolvió `cajero` y `cerradaPor`;
> el front los ignoraba.
>
> Y la hora de cierre se mostraba **sin fecha**: una caja abierta el 25 y
> cerrada el 10 del mes siguiente se leía *"4:39 PM → 1:29 PM"*, como si hubiera
> cerrado antes de abrir.
>
> El tercero era el peor de los tres: **el vendido y los tickets del turno
> estaban puestos en 0 a mano** en el mapeo del front, porque el endpoint del
> histórico nunca los envió. Todos los cierres decían *"S/. 0.00 · 0 tickets"*,
> hubieran vendido lo que hubieran vendido. Ahora `historico()` los calcula
> —en dos consultas para todas las sesiones, no una por fila— y devuelve además
> `cajero` y `cerradaPor`.

---

## 5. Finanzas: de dónde sale cada número

**Nada está guardado.** Todo se calcula al vuelo desde ventas, compras, mermas y
gastos. Por eso importa que los movimientos estén bien.

| Número | Cómo se obtiene |
|---|---|
| Ventas netas | Suma de `Venta.subtotal` (ya sin IGV y neto de descuento) |
| Costo de ventas | `VentaItem.costoUnitario` congelado × unidades |
| Devoluciones | Se restan de ingreso **y** costo, con el costo original |
| Mermas | Unidades dadas de baja × costo promedio |
| Utilidad neta | Bruta − mermas − gastos |
| IGV | La **tasa sale de Configuración**, no está fija en el código (ver §6) |
| IGV estimado | IGV de ventas − IGV de compras (**referencial**, no es la declaración) |
| Punto de equilibrio | Costos fijos ÷ margen ÷ **días transcurridos** |
| Días de inventario | Valor del stock ÷ (costo de ventas ÷ días) |

**Trampa que ya costó un bug:** el ingreso sale de `Venta.subtotal`, **no** de
sumar `VentaItem.subtotal` — los ítems traen IGV dentro y no descuentan el
descuento del comprobante.

**La mercadería NO es un gasto.** Entra por Compras y sale como costo de ventas
cuando se vende. Cargarla además como gasto la descuenta **dos veces** de la
utilidad neta. Por eso la categoría `MERCADERIA` está bloqueada al crear gastos
(sigue en el enum solo por las filas viejas, que el P&L expone en
`gastosMercaderia` para poder avisarlas en pantalla).

### 5.1 Gastos fijos mensuales

Alquiler, sueldos e internet se cargan **una vez** como `GastoRecurrente`
(descripción, monto y día de pago, máximo 28 para que exista en febrero).

- El sistema **no los crea solo**. Calcula qué meses faltan, los muestra en un
  aviso y el dueño confirma. Un sistema que se inventa gastos no es de fiar.
- Un mes aparece pendiente solo si su día de pago **ya pasó** y es **posterior**
  a la creación de la plantilla. Ventana máxima: 12 meses atrás.
- `Gasto.recurrenteId` + `Gasto.periodo` con índice único impiden que el mismo
  mes se registre dos veces (doble clic, dos pestañas).
- Borrar una plantilla **no** borra los meses ya generados: son hechos de
  períodos cerrados (la FK es `SetNull`).

Sin esto, olvidarse del alquiler inflaba la utilidad y el P&L del mes mentía.

**Los gastos sueltos llevan la fecha real del pago**, no la de captura: el
alquiler pagado el 3 y registrado el 10 entra en su período. No se aceptan
fechas futuras. Y se **corrigen** (`PATCH /gastos/:id`) en vez de borrarse —
borrar cambia la utilidad del mes y no deja rastro de quién fue.

---

### 5.2 El kardex dice quién

`MovimientoStock.registradoPor` guarda el usuario de **cada** movimiento de
stock: ajuste manual, merma, transferencia, recepción de compra, anulación de
compra, conteo físico, devolución y anulación de venta.

**Excepción a propósito:** el consumo por venta no lo lleva. No hace falta —
el movimiento apunta a la venta por `referenciaId`, y la venta ya guarda
`cajeroId`. Meter mano en el camino de la venta por un dato que ya es
recuperable no compensa el riesgo.

El campo es opcional porque los movimientos anteriores a la columna no lo
tienen. La pantalla muestra **"Sin registrar"** en esos casos en vez de dejar
un hueco mudo. Mermas usa la misma tabla, así que también muestra el autor.

Antes de esto, un ajuste que hacía desaparecer 40 cajas dejaba solo
*"AJUSTE −40, motivo: corrección"* y no había a quién preguntar.

### 5.3 Disponibilidad entre boticas

`GET /inventario/disponibilidad/:productoId` devuelve el stock del producto en
**todas** las sedes. Sale en la ficha del producto, en Inventario.

Es la única excepción deliberada al aislamiento por sucursal, y existe por una
razón de mostrador: cuando un cliente pide algo que no hay, el vendedor tiene
que poder decirle en qué sede sí está en vez de llamar por teléfono a las otras
cuatro. **No lleva restricción de rol** por eso mismo.

Lo que expone está acotado a propósito: nombre de la sede, teléfono, dirección
y cantidades. **Ningún dato financiero** — ni costo, ni precio, ni margen. Eso
sigue bajo la regla financiera de §8.

Muestra el **vendible** (lotes sin vencer), no el total: mandar a un cliente a
otra botica por mercadería vencida sería peor que decirle que no hay.

---

## 6. Configuración: los ajustes que sí mandan

Una sola fila (`id: "global"`) para las 5 boticas. **Ojo:** que sea global es
una decisión abierta — razón social y RUC sí son comunes, pero el umbral de
descuadre y el stock mínimo razonablemente varían por sede (ver `PENDIENTES.md`).

| Ajuste | Qué gobierna de verdad |
|---|---|
| `igvPorcentaje` | La tasa con la que se calcula **cada venta y cada compra** |
| `alertaVencimientoDias` | Con cuánta anticipación avisan Inventario y el dashboard |
| `stockMinimoDefault` | El mínimo que hereda un producto nuevo sin uno propio |
| `umbralDescuadreCaja` | A partir de qué diferencia el cierre **exige un motivo** |
| `razonSocial`, `ruc`, `direccionFiscal`, `pieTicket` | Salen impresos en el ticket |

El resto de campos de la pantalla **todavía no hace nada** (director técnico,
logo, moneda, tipo de impresión). Están listados en `PENDIENTES.md` con cuándo
conectar cada uno.

**Todos los números tienen techo** (IGV 0–50, alerta 1–365 días, stock mínimo
0–1000, umbral 0–1000) y se rechazan fuera de rango. Antes solo tenían mínimo:
un IGV de 180 se guardaba, la pantalla mostraba 180 % y el sistema seguía
cobrando 18 % porque descartaba el valor absurdo por su cuenta — la pantalla
decía una cosa y la realidad otra.

> Los rangos están **duplicados a propósito**: en el DTO del backend y en la
> constante `LIMITES` de `configuracion.ts`. Si cambias uno, cambia el otro, o
> el guardado falla con error del servidor en vez de avisar antes.

**Cada cambio deja bitácora** (`CambioConfiguracion`): qué campo, valor
anterior, valor nuevo, quién y cuándo — una fila por campo modificado, escrita
en la **misma transacción** que el guardado. Si no se puede registrar, el
cambio tampoco entra. Se ve en Configuración → Historial de cambios (solo
ADMIN) y no se puede editar ni borrar desde el sistema.

El motivo es `umbralDescuadreCaja`: subirlo de 20 a 900 significa que ningún
cajero vuelve a justificar un faltante. Antes eso no dejaba rastro.

---

## 6.1 Inicio (dashboard): tres zonas, una sola fuente

El inicio no es una pantalla por rol, son **tres zonas**:

| Zona | Quién la ve |
|---|---|
| Torre de control (ranking de las 5 boticas) | Solo SUPER_ADMIN |
| Hero personal + venta del día | Solo usuario no-super-admin |
| KPIs, gráfico, alertas, top productos, ventas recientes | **Los dos** |

**La regla:** la zona común lee los **mismos KPIs del backend** que alimentan la
torre de control (`reportes/kpis/:sucursalId`). Antes los recalculaba por su
cuenta con otras reglas —valor de inventario a precio de venta en vez de a
costo, 90 días fijos en vez de los configurados— y la misma pantalla se
contradecía: la tarjeta de una botica arriba decía un número y la zona de abajo,
otro, para esa misma sucursal.

> Si añades un indicador a la zona común y ya existe en el KPI del backend,
> **úsalo de ahí**. No lo recalcules.

**"Valor inventario" exige permiso de `finanzas`.** Es capital inmovilizado:
dato de dueño, no de mostrador. Un cajero ve en su lugar el estado de su turno,
que es lo que sí necesita al entrar. Se usa `tienePermiso('finanzas')`, el mismo
que protege la pantalla de Finanzas, no una lista de roles aparte.

### 6.1.1 Cada cifra vive en un solo sitio

El inicio llegó a decir lo mismo tres veces. Los cuatro números de alerta
—agotados, bajo mínimo, vencidos, por vencer— salían en la banda "Qué atender
hoy", **otra vez** como tarjetas KPI y **otra vez** en los paneles laterales:
casi 900 px de pantalla para cuatro cifras, en tres lenguajes visuales
distintos. Y no coincidían entre sí: la tarjeta decía "Por vencer 14" mientras
el panel de al lado decía "24 lotes", porque uno excluía los ya vencidos y el
otro los sumaba sin avisar.

**La regla:** cada cifra tiene **un dueño** en la pantalla.

| Cifra | Dónde vive | Quién NO debe repetirla |
|---|---|---|
| Alertas de stock y vencimiento | Banda "Qué atender hoy" (chips) | Tarjetas KPI |
| Vencidos vs. por vencer | Panel de vencimientos, **por separado** | Cualquier badge que los sume |
| Venta, ticket promedio, inventario | Tarjetas de la sucursal activa | Hero |

> Antes de añadir una tarjeta al inicio, busca el número en la pantalla. Si ya
> está, no hace falta la tarjeta: hace falta que la que existe lleve a la
> acción.

**El alcance se rotula, no se adivina.** Las cifras globales (las tres boticas
sumadas) y las de la sucursal activa usan tarjetas idénticas a propósito; lo que
las separa es el rótulo de sección —"Todas las boticas" / "Botica Central"—. Sin
él eran ocho tarjetas seguidas y nada decía que las de arriba sumaban tres
sucursales.

**El gráfico por hora tiene escala.** Las barras se miden contra un techo
redondeado (`techoGrafico`), no contra el máximo del día. Escalar contra el
máximo hace que la hora pico siempre llegue arriba del todo: se ve una
proporción, pero no se puede leer un valor sin pasar el ratón. Con techo redondo
las cuatro marcas del eje caen en cifras legibles y el pico lleva su importe
escrito.

**Símbolo de moneda: `S/`, sin punto**, en toda la aplicación —pantalla y
comprobante impreso—. Convivían las dos formas y llegaban a verse juntas en la
misma pantalla.

### 6.1.2 El sistema visual

Cuatro decisiones que valen para todas las pantallas, no solo para el inicio.

**La fuente se carga.** `tailwind.config.js` declaraba Manrope y el layout
aplicaba `font-display`, pero en `index.html` el único `<link>` de fuentes era el
de los iconos: el sistema entero se dibujaba con la de serie del sistema
operativo. Ahora se pide Inter en la misma petición que los iconos, con
`preconnect`. Inter además tiene el peso 900 de verdad — Manrope topa en 800, así
que el `font-black` de las cifras grandes se lo inventaba el navegador engordando
trazos.

**Los acentos tienen dos tonos, y no son intercambiables.**

| Token | Para qué |
|---|---|
| `accent-red` / `accent-orange` / `accent-green` | Rellenos y bordes: `bg-*`, `border-*` |
| `…-ink` | Texto e iconos sobre fondo claro |

Se usaban con un solo valor para ambas cosas y como texto no se leían: el ámbar
`#F59E0B` sobre blanco da **2.15:1** y sobre su propio badge baja a 1.87:1, con
4.5:1 de mínimo. El color de alerta del sistema era el peor de todos. **Al
escribir texto de color, siempre `-ink`.**

**Las tarjetas no llevan borde.** El lienzo (`canvas`, tintado hacia el azul de
marca) va lo bastante oscuro para que una superficie blanca se lea sola;
`shadow-card` hace el resto. El borde de 1px repetido 331 veces en el front es lo
que le daba aire de plantilla administrativa. *Nota: el barrido está hecho en el
inicio; el resto de pantallas sigue con borde y conviene igualarlas.*

**Nada de tamaños arbitrarios.** `text-[11px]` aparecía 18 veces solo en el
inicio, junto a otros siete valores sueltos. El paso de 11px se llama `text-2xs`.
Si hace falta un tamaño que no está en la escala, se añade al tema con nombre; no
se escribe entre corchetes.

---

## 7. Accesos: roles y permisos

- El **rol** es una plantilla: al crear un usuario, pre-marca sus módulos.
- Los **permisos** por usuario son la verdad: se ajustan con checkboxes.
- Los **pisos** no son negociables: Finanzas, Usuarios y Configuración exigen
  rol ADMIN; Sucursales exige SUPER_ADMIN. Da igual lo que se marque.
- Un usuario **sin lista** de permisos usa la plantilla de su rol
  (compatibilidad: nadie se queda sin acceso).
- Todo ingreso —y todo intento fallido— queda en **auditoría de accesos**.


---

## 8. Multi-sucursal: la regla que más se olvida

Hay **dos** conceptos de sucursal y confundirlos causó varios bugs:

- `auth.usuario()?.sucursalActualId` → la sucursal **del token**. Es a la que
  pertenece el usuario. **No cambia nunca durante la sesión.**
- `sucursalSvc.sucursalActivaId()` → la sucursal **activa**, la del selector del
  header. El super admin la cambia para ver otra botica.

> **Regla:** toda pantalla que muestre o modifique datos de una botica usa la
> **ACTIVA**. La del token solo sirve para decir "tu sucursal" en un saludo.
>
> Ignorar esto hacía que el dueño cambiara a "Norte", entrara a Inventario y
> **ajustara el stock de Central** sin enterarse.

El backend refuerza el alcance por su cuenta: un no-admin no puede leer ni
escribir datos de otra sucursal aunque manipule la URL.

**Hay DOS reglas de alcance, no una** (`auth/scope-sucursal.util.ts`):

| Util | Quién cruza sucursales | Dónde se usa |
|---|---|---|
| `verificarSucursal` | SUPER_ADMIN **y** ADMIN | Inventario, ventas, caja, KPIs del dashboard |
| `verificarSucursalFinanciera` | **Solo** SUPER_ADMIN | P&L, márgenes, IGV, flujo de caja, gastos |

El motivo: con 5 boticas lo normal es que cada sede tenga un encargado con rol
ADMIN. Con la regla común, ese encargado podía leer el estado de resultados de
las otras cuatro cambiando el id en la URL. La regla financiera está **aparte a
propósito**: tocar `esAdmin` habría afectado inventario, ventas y caja.

---

## 9. Reglas de oro al agregar algo

Aprendidas a golpes en este proyecto:

1. **Verifica con `ngc`, no con `tsc`.** `tsc --noEmit` **no revisa las
   plantillas** de Angular; los errores aparecen recién en el build de Docker.
   ```
   node node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js -p tsconfig.app.json --noEmit
   ```
   **Y `ngc` no ve NestJS.** Un `import` que falte en el backend pasa `ngc` sin
   una queja y revienta en `docker compose up --build`. Para cambios de backend
   la única verificación real es el build. Ya pasó: se usó `obtenerTasaIgv` en
   `reportes.service.ts` sin importarlo y el error salió recién en Docker.
2. **Cambios de base: `db push`, nunca `migrate dev`.** No hay carpeta de
   migraciones; `migrate` quiere resetear y **borra los datos**.
3. **El schema de Prisma solo admite `//`.** Un bloque `/* */` da error P1012.
4. **Todo campo del formulario debe enviarse.** Hubo dos campos que se escribían
   y se descartaban en silencio. Si se muestra, o se guarda o se pone solo lectura.
5. **Si sumas stock, actualiza el costo.** Es el error que más caro sale y el más
   difícil de ver: no falla, solo miente en los reportes.
6. **Imprime siempre por iframe oculto** (`ComprobanteService.imprimir`), nunca
   con `window.open`: los bloqueadores de emergentes lo matan.
7. **Fechas por día LOCAL, nunca UTC.** Perú va 5 horas atrás: comparar con
   `toISOString()` hacía desaparecer las ventas después de las 7 pm.
   Y para **mostrarlas**: la app registra `es-PE` en `app.config.ts`. Sin eso
   Angular usa `en-US` y el pipe `date` imprime mes/día/año — un cierre del
   10 de agosto salía "8/10/26", que en Perú se lee 8 de octubre. En pantallas
   de dinero conviene además el formato explícito `dd/MM/yy HH:mm`, que no
   depende del idioma del navegador.
8. **En plantillas, `[class.bg-primary/5]` no funciona.** Usa
   `[class]="cond ? 'a' : 'b'"`.
9. **El precio vive en la presentación**, no en el producto. `PATCH /productos/:id`
   no lo toca a propósito (para no romper referencias de ventas históricas).
10. **Toda operación que mueva stock y plata va dentro de una transacción.**
11. **Un número que no valida arriba, miente.** Si el backend descarta un valor
    absurdo por su cuenta pero la pantalla lo muestra guardado, el usuario ve una
    cosa y el sistema hace otra. Rechaza en el DTO, no corrijas en silencio.
12. **Regla duplicada = las dos se cambian juntas.** Los rangos de Configuración
    viven en el DTO y en `LIMITES` del front; el criterio de vencimiento vive en
    un único `clasificarVencimiento()` justo porque antes estaba copiado en
    cuatro sitios y arreglar uno no arreglaba los otros.
13. **Lo que borra y no deja rastro, mejor que se corrija.** Editar un gasto
    conserva quién lo cargó; borrarlo y recrearlo, no. Y lo que sí se borra pide
    confirmación con un modal propio — nunca `confirm()` del navegador.
14. **Nada de datos de mentira en el código.** Los mocks con nombres inventados
    sobreviven a los rediseños y algún día aparecen en la pantalla del cliente.
15. **Todo lo que cruza boticas es del DUEÑO.** `SUPER_ADMIN` = el dueño;
    `ADMIN` = el encargado de UNA sede. Cualquier endpoint que devuelva datos de
    más de una sucursal en la misma respuesta va con `@Roles('SUPER_ADMIN')`,
    **no** con `'SUPER_ADMIN', 'ADMIN'`.
    Y ojo con `sucursalEfectiva`: si un admin no manda `sucursalId`, devuelve
    **todas**. Para lo que cruza sedes eso es una fuga, no una comodidad.
    Comprobación al añadir un endpoint: *¿puede alguien ver aquí una botica que
    no es la suya?* Si la respuesta es sí y no es el dueño, está mal.
16. **Ocultarlo en la pantalla no es protegerlo.** La torre de control ya estaba
    limitada al super admin en el HTML, pero el endpoint aceptaba ADMIN: un
    encargado veía la venta de las otras cuatro boticas llamando a la API.
    El guard va en el backend; el `@if` es solo cosmética.
17. **Un dato, un sitio en la pantalla.** Repetir una cifra no la refuerza: la
    pone a discutir consigo misma. En cuanto el mismo número sale en dos
    bloques, tarde o temprano uno se calcula distinto del otro y la pantalla se
    contradice sola (ver §6.1.1). Si algo ya está arriba, lo que falta abajo no
    es la cifra, es el camino a la acción.
18. **Dos plantillas casi iguales acaban siendo dos plantillas distintas.** El
    inicio tenía el hero duplicado —una versión para el dueño y otra para el
    resto— y se habían ido separando solas: botones contiguos con radios
    distintos, texto de una paleta anterior. Un solo bloque con la paleta en una
    función (`claseAcceso`) y eso no vuelve a pasar.
19. **El ámbar solo avisa.** La marca es azul (`#0055FF`). Cuando el ámbar se usa
    de adorno —barras de ranking, iconos de sección— acaba siendo el color
    dominante y deja de significar "mira esto". Ámbar y rojo se reservan para
    alerta; todo lo demás va en azul o en gris.

---

## 10. Qué revisar cuando algo no cuadra

| Síntoma | Dónde mirar |
|---|---|
| El stock no coincide | Kardex del producto (Inventario → detalle → movimientos). **Dice quién** hizo cada movimiento |
| Un margen imposible (100%) | El producto no tiene costo: revisa si entró por ajuste o transferencia |
| La caja no cuadra | Reporte Z del turno + movimientos manuales de esa sesión |
| No aparece una venta | ¿La sucursal activa es la correcta? ¿La venta está anulada? |
| No suena la alerta de stock | El producto tiene `stockMinimo` en 0 en **esa** sucursal |
| Alguien entró y no debía | Usuarios → pestaña Accesos |
| **La utilidad neta sale muy baja** | ¿Hay gastos cargados como MERCADERIA? Se descuentan dos veces. Finanzas avisa en el P&L |
| **Falta el alquiler / los sueldos del mes** | Finanzas → Gastos fijos. El aviso amarillo lista los meses sin registrar |
| **No avisa de los vencimientos** | Configuración → `alertaVencimientoDias`. Inventario y el dashboard usan ese número |
| **El IGV salió distinto** | Configuración → IGV %. Ya no está fijo en el código |
| **Alguien cambió un ajuste del sistema** | Configuración → Historial de cambios: qué campo, valor anterior y quién |
| **El cajero no justificó un faltante** | Revisa `umbralDescuadreCaja` y **cuándo se cambió** (mismo historial) |
| Un cliente pide algo que no hay | Inventario → ficha del producto → "En otras boticas" |

---

## 11. Lo que el sistema todavía NO hace

- **Facturación electrónica SUNAT** — el proveedor es un stub. Los comprobantes
  que imprime no tienen validez ante SUNAT.
- **Guías de remisión** — obligatorias desde julio 2026 para mover stock entre
  boticas.
- **Modo offline** — sin internet, esa botica no puede vender.
- **Almacén central** — hoy cada botica tiene su stock; no hay un local que
  compre y distribuya.
- **Bloqueo por inactividad** — el refresh dura 7 días: si el cajero se aleja del
  mostrador, cualquiera vende bajo su nombre. Se llegó a implementar y **se
  retiró a pedido**; si se rehace, la decisión clave es bloquear la pantalla sin
  cerrar sesión, para no perder el carrito a media venta.
- **Comparar las 5 boticas en una pantalla** — Finanzas es de una sede a la vez;
  para comparar hay que entrar sede por sede.
- **Rastro al borrar un gasto** — se puede eliminar y no queda registro de quién
  fue. Lo correcto sería anularlo, como las ventas.
- **Paginar y exportar el inventario** — la tabla renderiza todas las filas de
  golpe y no hay salida a CSV. En espera del catálogo real para saber si molesta.

Detalle y prioridades en `PLAN-MAESTRO.md`; lo decidido y lo pendiente por
sección, en `PENDIENTES.md`.
