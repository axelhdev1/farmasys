# FarmaSys — Guías rápidas por rol (imprimir y dejar junto a la caja)

---

## 🧾 CAJERO / VENDEDOR — Tu día en 1 página

**Al llegar:** Caja → **Abrir caja** → cuenta el fondo inicial y digítalo.
Sin caja abierta el POS no cobra.

**Vender (sin mouse):**
1. `F1` → escribe el nombre, el compuesto o escanea el código.
2. `↓` `↑` para moverte entre resultados → `Enter` agrega.
   (productos con caja/blíster/unidad: elige con `1` `2` `3`)
3. Método de pago: `F6` Efectivo · `F5` Tarjeta · `F7` Yape/Plin.
   Efectivo: digita cuánto te dio el cliente → el vuelto sale solo
   (y se imprime en el ticket).
4. `F12` → cobrar e imprimir.

**Cliente pide boleta con sus datos:** escribe su DNI en el panel derecho →
buscar; si no existe, "+ Nuevo cliente" (30 segundos). Factura = requiere RUC.

**Cliente olvidó la billetera:** botón **En espera** (guarda su carrito) →
atiende al siguiente → recupera el chip ámbar cuando vuelva.

**Producto con marco rojo "Receta":** pide la receta física ANTES de agregar.

**Se fue el internet:** el POS avisa "Sin conexión" y bloquea el cobro.
NO reintentes a ciegas: cuando vuelva la señal, presiona COBRAR otra vez —
el sistema NO duplica la venta.

**Al salir:** Caja → **Cerrar caja** → cuenta el efectivo real → digítalo →
imprime el **Reporte Z** y entrégalo con el dinero. Si hay diferencia grande,
explica el motivo en el campo obligatorio.

---

## 💊 QUÍMICO FARMACÉUTICO — Control diario

**Dashboard → "Qué atender hoy":** vencimientos próximos, stock bajo y
alertas. Revisar al abrir; es tu lista de tareas.

**Vencidos:** el POS bloquea solo los lotes vencidos (candado). Darlos de
baja formalmente en **Mermas** (queda valorizado y con historial).

**Recepción de mercadería:** SIEMPRE por **Compras** (crea el lote con su
vencimiento). Nunca "ajustar stock" para meter mercadería nueva.

**Ajustes de inventario:** Inventario → Ajustar. Sumar stock exige N° de
lote y vencimiento (trazabilidad). Todo ajuste queda en el kardex.

**Alternativas por principio activo:** el POS agrupa equivalentes y muestra
"Genérico ahorra S/. X" — úsalo para no perder la venta cuando falta la marca.

**Conteo periódico:** Inventario Físico 1 vez al mes (o por categoría cada
semana). El acta impresa es tu respaldo.

---

## 👔 DUEÑO / ADMINISTRADOR — Los 5 números de cada noche

1. **Reporte Z de cada caja**: ¿la diferencia es S/. 0? Descuadres repetidos
   del mismo cajero = conversación.
2. **Dashboard**: venta del día vs ayer; tickets; anuladas hoy (¿quién y
   por qué? — cada anulación registra el autor).
3. **Alertas**: vencimientos y stock bajo — decide compras a tiempo.
4. **Finanzas**: margen y gastos de la semana.
5. **Backup**: verifica que el archivo de respaldo de hoy existe (carpeta
   backups/ del servidor).

**Reglas que te protegen (ya activas):**
- Vendedor: descuento máx. 10% (farmacéutico 15%) — el servidor lo bloquea
  aunque manipulen la pantalla.
- Vendedor solo ve y registra ventas de SU sucursal.
- Anular ventas: solo ADMIN, con motivo y autor registrados.
- Los correlativos de boleta/factura son sagrados: los tickets internos usan
  su propia serie (T001).

**Cuentas:** cada persona con SU usuario (nunca compartir claves) — si no,
el arqueo y la auditoría no sirven de nada.
