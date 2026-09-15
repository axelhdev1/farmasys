# Módulo de IA — análisis de reposición

> Estado: funcional. Añadido al backend sin tocar venta, caja ni inventario.

## Qué hace

La pantalla de **Reposición** ya calcula, para cada producto de una botica:
velocidad de venta (unidades/día de los últimos N días), días de cobertura que
quedan con el stock actual y cuánto pedir para cubrir el objetivo. Con 300
productos, eso es una tabla de 300 filas que alguien tiene que leer entera.

El módulo de IA convierte esa tabla en un **plan de compra**: 3–6 grupos
accionables, ordenados por urgencia, cada uno con una frase que explica por qué
importa, más avisos sobre los casos raros.

```
GET /api/v1/ia/reposicion/:sucursalId?dias=30&objetivo=30
GET /api/v1/ia/estado
```

## La decisión de diseño: el LLM no calcula

Esta es la regla que ordena todo el módulo.

| | Quién lo hace |
|---|---|
| Velocidad de venta, días de cobertura, cantidad sugerida | **PostgreSQL + `ReportesService.reposicion()`** |
| Agrupar, priorizar, explicar en castellano | **El modelo** |

Un LLM alucinando "pide 500 cajas de Amoxicilina" es plata real: mercadería
parada o un quiebre de stock en una botica. El modelo recibe la tabla **ya
calculada** y solo devuelve texto y **códigos de producto**. No hay un solo
número en la respuesta que no venga de la base de datos.

### Tampoco escribe cifras

En la primera corrida real el modelo escribió "26.63 un/día" sobre una fila que
decía **27.63**. No calculó mal: transcribió mal. Los números ya están en la
tabla, a dos centímetros del texto, así que el prompt le prohíbe escribir
cifras — que las repita solo añade una superficie donde equivocarse. Dice "el
de mayor rotación", y el número lo pone la tabla.

### Y aun así no se le cree

El prompt le prohíbe inventar códigos. `sanear.ts` comprueba que obedeció:
cada código que cita el modelo se valida contra la tabla que se le envió, y el
que no existe se descarta y se cuenta. Si descartó alguno, aparece en los avisos
de la respuesta. Hay tests unitarios de eso (`sanear.spec.ts`).

Además se recortan longitudes: la salida de un modelo es entrada no confiable.

## Degradación: nunca un 500

El endpoint **siempre devuelve la tabla**. El análisis es lo opcional:

| Situación | Respuesta |
|---|---|
| Todo bien | `analisis` con los grupos, `ia.disponible: true` |
| Sin `GEMINI_API_KEY` | tabla + `motivo: "SIN_API_KEY"` |
| Proveedor caído, saturado, sin cuota, timeout (30 s) o JSON ilegible | tabla + `motivo: "ERROR_PROVEEDOR"` |
| Nada que reponer | tabla vacía + `motivo: "SIN_DATOS"` |

El encargado de almacén tiene que poder hacer su pedido aunque la IA no esté.

## Caché

Redis ya estaba levantado en `docker-compose.yml` y no lo usaba nadie. Ahora
cachea el análisis 15 minutos.

La clave incluye una **huella (SHA-1) de los propios datos**, no solo la
sucursal y los parámetros: en cuanto cambia el stock o la venta de cualquier
producto de la lista, cambia el hash y el análisis se regenera solo. No hay que
invalidar nada a mano desde ventas ni compras.

Si Redis no está, se avisa una vez en el log y todo sigue sin caché. Una caché
que tumba la aplicación cuando falla es peor que no tener caché.

## Seguridad

- **La clave vive solo en `backend/.env`** (gitignorado) y se lee con
  `process.env`. En `.env.example` hay un placeholder vacío.
- **El frontend nunca ve la clave.** El navegador llama a `/api/v1/ia/...`; a
  Google llama el backend. Una clave de IA en el front es una clave pública.
- **Scoping por sucursal idéntico al de la tabla que resume**
  (`verificarSucursal`): un almacenero solo puede analizar SU botica. Si no,
  la IA sería un rodeo para leer datos de otra sede.
- **Guard de permiso por módulo**, no solo por rol (`PermisoModuloGuard`): el
  rol es una plantilla, la lista `permisos` del usuario es la que manda. Si no
  puedes ver la tabla de reposición, tampoco puedes pedir que una IA te la
  resuma.
- **Rate limit** de 6 llamadas/minuto por encima del límite global: cada
  llamada consume cuota.

## Por qué Gemini, y qué haría distinto en producción

Gemini (Google AI Studio) es hoy el único proveedor con tier gratuito y **sin
tarjeta**. El límite medido en este proyecto fue de **20 peticiones al día** por
modelo: alcanza para desarrollar y demostrar, no para una botica en marcha.

**Limitación consciente:** en el tier gratuito Google puede usar el contenido
enviado para mejorar sus modelos. Para una botica en producción eso no es
aceptable — se iría a tier de pago (sin entrenamiento) o a un **modelo local
con Ollama**, que además quita la dependencia de internet en un local con
conexión mala.

Por eso el proveedor está detrás de una interfaz:

```ts
export interface AnalizadorIA {
  readonly nombre: string;
  disponible(): boolean;
  analizarReposicion(entrada: EntradaAnalisis): Promise<AnalisisIA>;
}
```

Cambiar a Claude o a Ollama es escribir otra clase y tocar **una línea** de
`ia.module.ts`. Ni el servicio ni el controlador se enteran.

## Sin SDK

Se llama a la API por HTTP con el `fetch` nativo de Node 20. Cero dependencias
nuevas para hablar con el modelo, cero superficie de supply chain, y el día que
cambie el contrato se ve en un solo archivo (`gemini.service.ts`).

La configuración de la llamada se prueba **en cascada**, de la más controlada a
la más básica: JSON forzado (`responseMimeType`) con el "pensamiento" apagado
(`thinkingBudget: 0`), luego sin ese campo, luego sin formato forzado, y por
último sin `generationConfig`. La razón es concreta: `gemini-2.5` acepta
`thinkingConfig` y `gemini-3.6` lo rechaza con un 400. Clavar una sola
configuración es garantizar que el módulo se rompa con la próxima versión del
modelo. Si aun así el modelo responde con texto en vez de JSON puro,
`extraerJson` lo recupera.

**El modelo se configura por entorno** (`GEMINI_MODEL`), no está clavado en el
código. Google retira versiones: `gemini-2.5-flash` dejó de aceptar claves
nuevas en septiembre de 2026 y la API respondía 404 indicando el reemplazo.
Cambiar de modelo es editar el `.env` y reiniciar el contenedor — sin
recompilar, sin tocar código. Por defecto: `gemini-3.6-flash`.

## Archivos

```
backend/src/ia/
├── ia.module.ts                   módulo (aditivo, importa ReportesModule)
├── ia.controller.ts               endpoints + scoping + rate limit
├── ia.service.ts                  orquestación, caché, degradación
├── analizador-ia.interface.ts     el contrato del proveedor
├── gemini.service.ts              implementación Gemini (fetch nativo)
├── prompt-reposicion.ts           instrucción de sistema + tabla en CSV
├── sanear.ts                      valida la salida del modelo
├── sanear.spec.ts                 tests de esa validación
├── cache-ia.service.ts            Redis con degradación
└── guards/permiso-modulo.guard.ts permiso por módulo, no solo por rol
```

## Probarlo

```bash
cd backend
# 1. Poner GEMINI_API_KEY en .env (ver .env.example)
docker compose up -d --build
docker compose exec api npm run db:seed:demo

# 2. Login y llamada (o desde Swagger: http://localhost:3000/api/docs)
curl -s http://localhost:3000/api/v1/ia/estado -H "Authorization: Bearer <token>"
curl -s "http://localhost:3000/api/v1/ia/reposicion/<sucursalId>?dias=30" \
     -H "Authorization: Bearer <token>"
```

Sin clave, la segunda llamada devuelve igualmente la tabla con
`ia.motivo: "SIN_API_KEY"`. Eso también es una prueba válida del módulo.
