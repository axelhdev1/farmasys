# Guión de Reunión — FarmaSys
**Para:** Axel Huamán (desarrollador)
**Uso:** Presentación del sistema al cliente de la botica
**Duración estimada:** 45 – 60 minutos

---

## ANTES DE LA REUNIÓN

Prepara esto antes de llegar:
- El sistema corriendo en tu laptop con `ng serve`
- Tres pestañas abiertas: login listo para ingresar
- Anota el nombre del dueño para personalizar el saludo del demo
- Lleva papel y lapicero — vas a anotar decisiones importantes

---

## 1. APERTURA (5 minutos)

**Objetivo:** romper el hielo y establecer que esto es una conversación, no solo una presentación.

> *"Antes de mostrarte el sistema, quiero hacerte un par de preguntas rápidas para asegurarme de que lo que ves hoy refleja exactamente cómo funciona tu negocio. ¿Está bien?"*

**Preguntas de calentamiento:**
- ¿Cómo manejan las ventas ahora? ¿Boletas en papel, Excel, algún sistema?
- ¿Las 5 boticas tienen el mismo catálogo de productos o cada una maneja los suyos?
- ¿Hay un almacén central que abastece a las boticas, o cada botica compra por su cuenta?

> 💡 **Por qué importa:** Sus respuestas te dirán si el sistema actual encaja o si necesitas ajustar algo antes de mostrar la demo.

---

## 2. DEMO DEL SISTEMA (25 minutos)

### 2a. Ingresa como SUPER ADMIN (tú — el dueño)

```
Email:    super@farmasys.com
Password: super123
```

> *"Esta es tu vista. Como dueño, entras aquí y ves el resumen de todas tus 5 boticas en tiempo real."*

**Muestra:**
- El hero dorado con "Vista Global · 5 sucursales activas"
- Los KPIs consolidados: venta total, tickets, alertas
- El ranking de boticas por venta del día

> *"Desde aquí puedes hacer clic en cualquier botica para entrar a verla en detalle. Mira..."*

- Haz clic en "Botica Central" → muestra cómo el sistema cambia al contexto de esa sucursal

---

### 2b. La sección "Mis Sucursales"

- Ve a **Mis Sucursales** en el sidebar

> *"Aquí tienes las 5 boticas con sus datos del día: cuánto vendió cada una, cuántos tickets, cuántos productos tienen, y si hay alertas de stock o vencimiento."*

**Puntos clave a mencionar:**
- La botica "Los Olivos" aparece como "En mantenimiento" — muéstrale que el sistema ya lo distingue
- *"Cuando el sistema esté conectado a tus datos reales, estos números se actualizan solos — tú no tienes que hacer nada."*

---

### 2c. Ingresa como ADMIN (gerente de una botica)

> *"Ahora te muestro cómo ve el sistema el administrador de cada botica."*

```
Email:    admin@farmasys.com
Password: admin123
```

**Muestra en orden:**
1. **Dashboard** → *"Solo ve su botica, no las demás."*
2. **POS** → registra una venta rápida de ejemplo
   - Agrega 2 productos al carrito
   - Selecciona método de pago: Yape
   - Muestra el vuelto / QR
   - *"Esto es lo que hace el cajero en cada venta."*
3. **Inventario** → muestra la lista de productos con alertas de stock
4. **Historial de Ventas** → muestra el registro del día
5. **Clientes** → muestra la lista con búsqueda
6. **Finanzas** → muestra los KPIs del mes, el gráfico de barras
7. **Usuarios** → muestra las cuentas del personal

---

### 2d. Configuración

> *"Aquí configuras los datos de tu farmacia: RUC, nombre, director técnico, series de comprobante y opciones del sistema."*

- Muestra la sección "Datos de la Farmacia"
- Muestra la sección "Sistema" con IGV, alertas

---

### 2e. Facturación Electrónica (IMPORTANTE)

- Ve a **Facturación** en el sidebar (badge morado "Pendiente")

> *"Este módulo es el de las boletas y facturas electrónicas que van a SUNAT. Te lo muestro porque quiero que sepas que está planificado, pero funciona diferente a los demás módulos — hay dos costos separados."*

**Explica claramente:**
> *"Primero: tú contratas un servicio llamado OSE — como Nubefact — que cuesta alrededor de S/ 40 al mes. Ese es un costo del negocio, como pagar el internet. Segundo: yo desarrollo la conexión entre el sistema y ese servicio, que es un cobro adicional de desarrollo. No está incluido en lo que acordemos hoy."*

**Espera su reacción. Preguntas posibles del cliente y cómo responder:**

- *"¿No puedes incluirlo?"* → "Puedo, pero tiene un costo de desarrollo adicional porque es una integración técnica con SUNAT. Lo cotizamos por separado."
- *"¿Es obligatorio?"* → "Sí, legalmente sí. Toda venta necesita comprobante electrónico válido. Pero lo activamos cuando estés listo para producción."

---

## 3. PREGUNTAS CLAVE PARA DEFINIR EL ALCANCE (15 minutos)

Estas preguntas son **imprescindibles**. Anota las respuestas.

---

### Sobre el Almacén

> *"Antes hablamos de tu almacén central. Necesito entender cómo funciona para saber si lo incluimos en el sistema."*

- ¿El almacén central recibe la mercadería de los proveedores y luego la distribuye a las boticas?
- ¿O cada botica compra directamente a sus propios proveedores?
- ¿Necesitas transferir stock entre boticas? Por ejemplo: si la Central tiene Paracetamol de sobra y San Juan se queda sin, ¿las boticas se transfieren entre ellas?

> 💡 **Si dice que sí al almacén central:** El módulo de Almacén es necesario y va en el contrato. Es 3-4 semanas adicionales de desarrollo.
> **Si dice que cada botica compra sola:** El módulo de Almacén puede esperar o no ser necesario.

---

### Sobre los usuarios y roles

- ¿Cuántas personas trabajan en total en las 5 boticas?
- ¿Hay un director técnico por botica o uno para todas?
- ¿Los turnos son fijos (mañana/tarde/noche) o rotativos?
- ¿Necesitas que el sistema registre a qué hora entró y salió cada empleado?

---

### Sobre los productos

- ¿El catálogo de productos es el mismo para las 5 boticas o cada una tiene el suyo?
- ¿Los precios son iguales en todas las boticas o pueden variar por zona?
- ¿Cuántos productos aproximadamente tienen en total?

> 💡 **Si los precios varían por botica:** hay que desarrollar "precios por sucursal" — anótalo para la cotización.

---

### Sobre el hardware

- ¿Ya tienen computadoras en cada botica o hay que considerar eso?
- ¿Tienen impresoras térmicas para los tickets?
- ¿Usan lectores de código de barras?
- ¿Tienen internet estable en todas las boticas?

> 💡 **Si no tienen internet estable:** El sistema necesita modo offline — es un módulo adicional importante.

---

### Sobre el tiempo

- ¿Cuándo necesitan tener el sistema funcionando?
- ¿Empezamos con una sola botica y luego ampliamos, o todas a la vez?

> 💡 **Recomendación a darle:** Siempre es mejor empezar con 1 botica piloto (la Central), ajustar en 2-3 semanas, y luego replicar a las demás. Reduce riesgos.

---

## 4. CIERRE Y PRÓXIMOS PASOS (5 minutos)

> *"Perfecto. Basado en lo que me dijiste, voy a prepararte una propuesta formal con el detalle de módulos, tiempos y costos. ¿Te parece bien que te la envíe en [X días]?"*

**Compromisos que debes salir con:**
- [ ] Fecha de envío de la propuesta formal
- [ ] ¿Almacén va en el primer contrato o en una segunda fase?
- [ ] ¿Empiezan con 1 botica piloto o todas a la vez?
- [ ] ¿Quién es el contacto técnico del cliente (si hay alguien de TI)?

---

## RESUMEN — QUÉ ESTÁ INCLUIDO VS. QUÉ ES ADICIONAL

Deja esto claro antes de terminar:

| Módulo | Estado |
|--------|--------|
| Dashboard multi-sucursal | ✅ Incluido |
| Punto de Venta (POS) | ✅ Incluido |
| Inventario y alertas | ✅ Incluido |
| Historial de Ventas | ✅ Incluido |
| Clientes | ✅ Incluido |
| Finanzas y reportes | ✅ Incluido |
| Usuarios y roles | ✅ Incluido |
| Configuración del sistema | ✅ Incluido |
| Gestión de Sucursales | ✅ Incluido |
| **Almacén / Compras** | ⏳ A definir (cotización aparte) |
| **Facturación electrónica SUNAT** | ⏳ Cotización aparte + OSE del cliente |
| **Transferencias entre sucursales** | ⏳ Depende del almacén |
| **Modo offline** | ⏳ Solo si el internet es inestable |

---

## NOTAS PARA ANOTAR DURANTE LA REUNIÓN

**Almacén central:** _______________________________________________

**Precio por sucursal (¿igual o diferente?):** _______________________

**Cantidad de empleados:** _________________________________________

**Hardware disponible:** ___________________________________________

**Fecha inicio deseada:** __________________________________________

**Botica piloto o todas a la vez:** __________________________________

**Otras peticiones del cliente:** ____________________________________

---

*Documento interno — FarmaSys · Axel Huamán*
