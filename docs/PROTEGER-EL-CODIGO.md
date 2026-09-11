# Proteger el código publicándolo igual

La pregunta era: *quiero publicar en GitHub pero que no me roben el código.*

**No hay forma de impedir la copia.** Código público = código copiable, un botón
de "Download ZIP" y ya está. Cualquier medida técnica —ofuscar, minificar,
trocear— arruina justo lo que hace que el repositorio sirva de portafolio: que
se pueda leer.

Lo que sí se puede es **dejar rastro, poder demostrar la autoría y conseguir que
bajen la copia cuando aparezca**. Eso es lo que cubre este documento.

---

## 1. Registrar la obra en INDECOPI

Es lo más sólido y lo más barato de todo lo que hay aquí.

El derecho de autor sobre el software es **automático desde que lo creas** — no
hace falta registrar nada para tenerlo. Pero el registro te da un **certificado
oficial con fecha**, y eso es lo que sirve cuando hay que demostrar quién lo hizo
primero.

| | |
|---|---|
| Dónde | Dirección de Derecho de Autor del INDECOPI, trámite **virtual** |
| Costo | **S/ 390.50** por la plataforma virtual · **S/ 357.70** por la plataforma SEL |
| Qué entregas | Formulario + el código como ejemplar de obra, en PDF o JPG (digital) |
| Qué recibes | Resolución y certificado de registro **con firma digital**, al correo |

No hay que ir presencialmente ni esperar a una fecha concreta: se hace desde casa
cualquier día del año, y el pago va por Banco de la Nación o Págalo.pe.

> Con eso en la mano, un caso de copia deja de ser tu palabra contra la suya.

---

## 2. Que la licencia se vea, no que esté

Ya tienes `LICENSE` con todos los derechos reservados. El problema es que nadie
lee el `LICENSE`. Así que:

- **Aviso arriba del README**, antes de cualquier explicación técnica. Hecho.
- **Cabecera de copyright en los archivos que más valen** — `ventas.service.ts`
  (FEFO + transacción), y conviene ponerla también en los de caja, inventario y
  finanzas.

La cabecera no impide copiar. Hace algo más útil: si alguien copia el archivo tal
cual, **se lleva tu nombre dentro**. Y si la borra, ya no puede alegar
desconocimiento: quitar un aviso de copyright es un acto deliberado, y eso pesa.

Cabecera a usar:

```ts
/**
 * FarmaSys — Sistema de gestión para cadena de boticas
 * Copyright (c) 2026 Axel Huatuco Bravo <axelhdev@gmail.com>
 * Todos los derechos reservados. Código propietario — ver LICENSE.
 *
 * Publicado para lectura y evaluación profesional. Prohibido el uso comercial,
 * la redistribución y las obras derivadas sin autorización escrita.
 */
```

---

## 3. Tu mejor marca de agua ya está escrita

Este repositorio tiene una peculiaridad que juega a tu favor: **los comentarios**.

No son comentarios normales. Son párrafos en español que cuentan qué bug había
antes y por qué se resolvió así:

> *"Antes esta zona los recalculaba por su cuenta con otras reglas —valor de
> inventario a precio de venta en vez de a costo— y la misma pantalla se
> contradecía."*

Eso no lo genera nadie por casualidad, y nadie que copie el proyecto va a
molestarse en reescribirlos. Si algún día encuentras un repositorio sospechoso,
busca una frase literal de las tuyas: es una prueba de copia más clara que
cualquier comparación de código.

**No los borres pensando que "ensucian" el repo.** Son tres cosas a la vez:
prueba de autoría, demostración de criterio ante quien te entrevista, y
documentación real del sistema.

---

## 4. Cuando encuentres una copia: DMCA

GitHub retira contenido que infringe copyright. El trámite es gratuito y no hace
falta abogado:

1. Buscas el repositorio copiado y guardas capturas y URLs.
2. Vas a **github.com/contact/dmca** y presentas el aviso.
3. Indicas qué archivos tuyos se copiaron y dónde está el original.

GitHub avisa al infractor y normalmente el repositorio desaparece en días. Aquí
es donde el certificado de INDECOPI y las cabeceras de copyright hacen su
trabajo: convierten el aviso en algo documentado.

---

## 5. Lo que NO hay que hacer

| Idea | Por qué no |
|---|---|
| Ofuscar o minificar el código | Destruye el valor de portafolio. Un recruiter no puede leer código ofuscado, y es justo lo que viene a hacer |
| Subirlo sin `LICENSE` | **Peor**, no mejor. Sin licencia queda ambiguo; con la tuya, la prohibición es explícita |
| Publicar solo fragmentos | Se nota, y quien evalúa desconfía de lo que no puede ver completo |
| Licencias "open source" (MIT, Apache) | Permiten justo lo que quieres evitar: uso comercial y derivados |

---

## 6. El riesgo que de verdad conviene mirar

No es que un recruiter te copie el proyecto — eso no pasa. Es que **tu cliente
todavía no ha firmado**.

Publicas el sistema completo para boticas peruanas; otro desarrollador en Lima lo
clona, le cambia el nombre y lo ofrece a cadenas de boticas, más barato porque a
él no le costó meses. Ese escenario es bastante más plausible, y te toca el
bolsillo.

Dos formas de reducirlo sin renunciar a publicar:

- **Publicar después de firmar**, no antes. Mientras tanto, el portafolio vive de
  las capturas y de la historia técnica, que es lo que convence igual.
- **Dejar fuera la integración con SUNAT** cuando la tengas. Es la pieza que
  convierte el proyecto en un producto vendible en Perú, y la que más trabajo
  cuesta replicar.

---

## Resumen

| Medida | Esfuerzo | Qué te da |
|---|---|---|
| Registro en INDECOPI | S/ 390.50, virtual | Prueba oficial de autoría con fecha |
| Aviso visible en el README | Hecho | Nadie puede alegar que lo creyó libre |
| Cabeceras de copyright | 10 min | Tu nombre viaja dentro de los archivos copiados |
| Historial de git limpio | Hecho | Commits con tu nombre y fecha verificable |
| Comentarios como huella | Ya está escrito | Prueba de copia difícil de discutir |
| DMCA cuando aparezca | Gratis | Retirada efectiva del repositorio copiado |

Nada de esto impide la copia. Todo esto hace que la copia te salga a favor.

---

**Nota:** esto es información práctica, no asesoría legal. Si algún día tienes un
caso real, consúltalo con un abogado de propiedad intelectual.

---

## Fuentes

- [Registrar una obra en el Indecopi — Plataforma del Estado Peruano](https://www.gob.pe/83358-registrar-una-obra-en-el-indecopi)
- [Guía de Derecho de autor para creadores de software — INDECOPI](https://repositorio.indecopi.gob.pe/backend/api/core/bitstreams/ba3dab55-ecce-4edc-8497-f477f144ef37/content)
- [Indecopi habilita servicio para el registro virtual de obras — Diario Oficial El Peruano](https://www.elperuano.pe/noticia/235970-protegen-creaciones-de-software-indecopi-habilita-servicio-para-el-registro-virtual-de-obras)
