# FarmaSys — Stack para el portafolio

Versiones reales leídas de los `package.json`, no de memoria (ago-2026).

---

## Versión corta (para una tarjeta de proyecto)

> **Angular 21 · NestJS 10 · PostgreSQL 16 · Prisma 5 · TypeScript · Docker**
>
> Sistema de gestión para una cadena de farmacias: punto de venta, inventario
> por lotes con vencimiento, arqueo de caja y contabilidad operativa
> multi-sucursal.

---

## Versión mediana (para la página del proyecto)

**Frontend** — Angular 21 con componentes *standalone* y **signals** (sin NgRx:
el estado vive en servicios con `signal` y `computed`), Tailwind CSS 3,
ApexCharts, RxJS y TypeScript 5.9.

**Backend** — NestJS 10 con arquitectura modular, **Prisma 5** como ORM sobre
**PostgreSQL 16**, autenticación **JWT** (access + refresh con rotación) vía
Passport, validación por DTOs con class-validator, documentación **OpenAPI /
Swagger**, rate limiting con Throttler y cabeceras de seguridad con Helmet.

**Infraestructura** — Docker Compose (API, PostgreSQL y Nginx), build
multi-etapa, respaldos automatizados con rotación.

---

## Lista para la sección "Tecnologías"

```
Frontend   Angular 21 · TypeScript · RxJS · Tailwind CSS · ApexCharts
Backend    NestJS 10 · Prisma 5 · PostgreSQL 16 · JWT · Passport · Swagger
Infra      Docker · Docker Compose · Nginx
Testing    Jest (backend) · Karma + Jasmine (frontend)
```

---

## Versiones exactas

| Frontend | | Backend | |
|---|---|---|---|
| Angular | 21.2 | NestJS | 10.4 |
| TypeScript | 5.9 | Prisma | 5.18 |
| RxJS | 7.8 | PostgreSQL | 16 |
| Tailwind CSS | 3.4 | class-validator | 0.14 |
| ApexCharts | 3.54 | Swagger | 7.4 |
| Karma / Jasmine | 6.4 / 5.9 | Jest | 29.7 |

---

## Números del proyecto

Sirven para dar escala sin exagerar:

| | |
|---|---|
| Archivos TypeScript | 194 (83 front · 111 back) |
| Endpoints REST | 121 |
| Modelos de base de datos | 29 |
| Módulos NestJS | 17 |
| Pantallas | 19 |

---

## Lo que conviene destacar (y no es una tecnología)

Estas frases pesan más que la lista de librerías, porque describen decisiones:

- **Signals en vez de una librería de estado.** El estado vive en servicios con
  `signal` y `computed`; no hace falta NgRx para una app de este tamaño.
- **Operaciones transaccionales.** Una venta descuenta lotes por FEFO, actualiza
  el stock, escribe el kardex, genera el correlativo del comprobante y registra
  el pago — todo dentro de una transacción, con clave de idempotencia para que
  un doble clic no cobre dos veces.
- **Dinero en `Decimal`, nunca en coma flotante.** Costo promedio ponderado
  congelado en cada línea de venta.
- **Autorización en dos niveles**: rol como plantilla y permisos por usuario,
  más aislamiento por sucursal con una regla común y otra financiera más
  estricta.
- **Auditoría en tres tablas**: movimientos de stock, accesos al sistema y
  cambios de configuración.
- **Localización real** (es-PE): IGV configurable, formatos de fecha peruanos,
  validación de RUC con dígito verificador módulo 11.

---

## Palabras clave para el perfil

`Angular` `TypeScript` `NestJS` `Node.js` `PostgreSQL` `Prisma` `REST API`
`JWT` `Docker` `Tailwind CSS` `RxJS` `Swagger` `Jest` `Arquitectura modular`
`Multi-tenant` `Punto de venta` `ERP`
