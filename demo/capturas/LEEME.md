# Capturas

Las siete que usa el [README](../../README.md). Todas tomadas con la semilla de
demostración (`npm run db:seed:demo`): backend real, datos ficticios.

| Archivo | Pantalla | Qué demuestra |
|---|---|---|
| `dashboard.png` | Inicio (super admin) | Comparativa entre las tres boticas, alertas accionables, venta por hora |
| `pos.png` | Punto de venta | Tres presentaciones, pago mixto, atajos de teclado |
| `inventario.png` | Inventario | Lotes con estado por vencimiento, valor a costo |
| `ficha-producto.png` | Ficha de producto | Orden FEFO, margen del lote, stock en otras sedes |
| `reposicion.png` | Reposición | Sugerencia de compra sobre demanda de 30 días |
| `mermas.png` | Mermas | Bajas con motivo y costo perdido |
| `finanzas.png` | Finanzas | Estado de resultados, punto de equilibrio, IGV |

---

## Si hay que rehacerlas

1. Sembrar la demo y entrar como `dueno@demo.pe` — es el único rol que ve las
   tres sucursales y Finanzas.
2. Navegador a **1920×1080**, sin zoom. Las capturas se reescalan a 1600 px de
   ancho: por debajo de eso el texto de 11 px se vuelve ilegible en GitHub.
3. **Salir del modo pantalla completa antes de capturar.** Chrome deja un aviso
   flotante *"Para salir de la pantalla completa…"* durante unos segundos y sale
   en la imagen.
4. Guardar en PNG y pasarlas por un optimizador. Las siete juntas pesan ~2,3 MB;
   por encima de eso el README tarda en cargar.

Ojo con el reloj: el saludo del inicio y el icono de la hora cambian con el
momento del día. Para la captura de portada conviene una hora con la botica
abierta y ventas ya registradas — a media tarde el gráfico por hora tiene forma.
