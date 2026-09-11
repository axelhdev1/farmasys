# FarmaSys — Demostración

Cómo levantar el sistema **completo** para enseñarlo: en una entrevista, por
pantalla compartida, o para tomar las capturas del portafolio.

---

## La decisión de fondo

**Backend real, datos ficticios.** No es un backend simulado.

Es el mismo NestJS, el mismo PostgreSQL y el mismo esquema que usa la botica;
lo único inventado son las boticas, los productos y las ventas. Un backend
falso —donde el frontend finge las respuestas— se nota enseguida y además
esconde lo que más vale del proyecto: las transacciones, el FEFO, el costo
promedio ponderado y el aislamiento por sucursal, que viven todos en el servidor.

**Un solo código, dos semillas.** No hay copia del proyecto en otra carpeta:
dos copias se desincronizan y una se queda vieja. Lo que cambia es qué datos se
siembran.

### Qué siembra

3 boticas · 94 productos en 18 categorías · ~1.600 ventas en 30 días · mermas,
gastos y gastos fijos con meses pendientes.

**Tres presentaciones, no dos.** El seed solo creaba unidad y caja, y así se veía
en el POS: al elegir presentación salían dos opciones donde una botica peruana
tiene tres. Ahora las 46 tabletas y cápsulas del catálogo llevan blíster —las
otras 48 no, porque un jarabe, una crema o una ampolla no vienen en blíster—.

El precio del blíster no es un descuento fijo: se coloca al 55 % del trecho que
va del precio por unidad de la caja al de la unidad suelta, así la escalera
*unidad > blíster > caja* se cumple en los 46 sin excepción. Con un porcentaje
plano la simvastatina salía más barata por blíster que por caja, porque su caja
tiene un descuento más flojo que la media.

| | Unidad | Blíster x10 | Caja x100 |
|---|---|---|---|
| Paracetamol 500mg | S/ 0.30 | S/ 2.77 | S/ 25.00 |
| Amoxicilina 500mg | S/ 0.90 | S/ 8.46 | S/ 78.00 |

En las ventas simuladas el blíster es el 40 % de las líneas de los productos que
lo tienen: es lo que más se despacha de verdad — el paciente que sale con
tratamiento para una semana no se lleva pastillas sueltas ni una caja de cien.

**Los estados de inventario están repartidos a propósito**, no todos iguales.
Por cada 20 productos: 12 sanos, 3 por vencer, 2 con lote vencido, 2 con stock
bajo y 1 agotado — y **distintos en cada botica**, así el ranking de alertas
tiene sentido y "En otras boticas" sirve de verdad.

Antes todos los productos recibían un lote corto y las 20 filas salían "por
vencer": una alerta que aplica a todo el catálogo no avisa de nada.

El kardex arranca con un movimiento de **carga inicial** por producto y sede,
calculado como *lo que queda hoy + todo lo vendido*. Sin él, el saldo bajaba
desde cero y la ficha mostraba "stock resultante: −450".

| | Para qué |
|---|---|
| `backend/prisma/seed.ts` | Arranque real: admin y catálogo mínimo |
| `backend/prisma/seed-demo.ts` | Demostración: sucursales, catálogo y un mes de movimiento |

> **Por qué el seed vive en `backend/prisma/` y no aquí:** necesita el cliente de
> Prisma, y Node resuelve las dependencias desde la carpeta del archivo. Fuera de
> `backend/` no las encontraría. En esta carpeta va todo lo demás: instrucciones,
> guion y credenciales.

---

## Levantarlo

```bash
cd backend
docker compose up -d --build
docker compose exec api npm run db:seed:demo
```

Front: `ng serve` desde la raíz → http://localhost:4200

## Credenciales de la demostración

> Solo válidas con datos ficticios. **Nunca** usar estas claves en una
> instalación real.

| Rol | Correo | Qué enseña |
|---|---|---|
| Dueño (Axel Huatuco Bravo) | `dueno@demo.pe` | Torre de control con las 3 boticas, Finanzas, Configuración |
| Encargado | `encargado@demo.pe` | Solo su botica: no ve el P&L de las otras |
| Cajera | `cajera@demo.pe` | POS y caja. No ve el valor del inventario |

Las contraseñas se imprimen al terminar el seed.

---

## Guion sugerido (4 minutos)

1. **Entrar como cajera** → el inicio muestra "Mi turno", no cifras financieras.
2. **POS**: vender con pago mixto (efectivo + tarjeta) y anotar el voucher.
3. **Entrar como dueño** → torre de control con las 3 boticas comparadas.
4. **Finanzas**: estado de resultados, punto de equilibrio, aviso de gastos fijos pendientes.
5. **Inventario** → ficha de un producto: kardex con autor, y "En otras boticas".
6. **Configuración → Historial de cambios**: quién tocó qué ajuste.

El paso 3 vale la pena hacerlo con el mismo producto del paso 5: se ve el stock
bajando en una botica y disponible en otra.

---

## Pendiente (si algún día se publica en línea)

Plan gratuito verificado en ago-2026, conviene revisarlo antes:

- **Front** estático (Netlify / Vercel / Cloudflare Pages) — sin coste ni arranque lento.
- **API** en Render, plan gratuito: duerme a los 15 min, despierta en 30–60 s.
- **Base** en Neon, plan gratuito sin caducidad. *No* usar el Postgres gratuito
  de Render: **caduca a los 30 días** y el demo moriría solo.
- **Redis se puede quitar**: está en el `docker-compose` pero ningún archivo del
  código lo usa.
- Hace falta **resembrar cada noche**: si es público, cualquiera anula ventas y
  el siguiente visitante encuentra el sistema roto.
