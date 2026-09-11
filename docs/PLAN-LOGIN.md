# PLAN LOGIN & ACCESO — FarmaSys

Estado del flujo de login tras la auditoría: **sin bugs conocidos**. Redirect
saneado, refresh automático activo, sin escrituras de signal en lecturas, sin
credenciales muertas. Lo que sigue no son arreglos: son las piezas que le
faltan para ser un sistema de acceso serio en una botica que maneja dinero.

Regla de siempre: **cero riesgos al flujo de venta**. Cada fase indica qué toca.

---

## FASE 1 — Obligatorio antes de operar
Bajo riesgo. No toca POS ni caja. Se puede hacer de una sentada.

### L1 · Secretos JWT — el candado existe, pero no está armado  🟡 AJUSTE
**Corrección:** en una primera lectura di esto por crítico. No lo es. El
fail-fast **ya está implementado** en `backend/src/main.ts:14`
(`verificarSecretos`): rechaza secretos ausentes, conocidos o de menos de 24
caracteres. Bien hecho.

El hueco real es más estrecho: esa comprobación solo aborta **si
`NODE_ENV === 'production'`**. Y hoy:

- `backend/.env` → `NODE_ENV="development"`
- `docker-compose.yml:39` → `NODE_ENV: ${NODE_ENV:-development}`

O sea: si el día del despliegue en la botica nadie cambia esa variable, el
candado nunca se arma y los fallbacks `?? 'dev-access-secret'` de
`auth.service.ts` siguen vivos con un simple warning en el log.

**Qué hacer (pequeño):** poner `NODE_ENV=production` en el checklist de
`SEGURIDAD-PRODUCCION.md` como primer paso obligatorio, y que el arranque avise
en grande si detecta `development` con una base de datos que no es local.

### L2 · Cambiar mi propia contraseña
`UsuariosController` lleva `@Roles('SUPER_ADMIN','ADMIN')` a nivel de clase: un
cajero **no puede** cambiar su clave ni queriendo. Depende de que el admin se la
cambie, y el admin la conoce.

**Qué hacer:** `PATCH /usuarios/mi-password` fuera del guard de roles, que exija
la contraseña actual, + pantalla en el front.

### L3 · Forzar cambio de clave inicial
Sin esto, L2 no sirve de nada: nadie cambia su clave voluntariamente. Hoy todos
los usuarios del seed arrancan con claves que conoce quien instaló el sistema
(`Admin1234!`).

**Qué hacer:** campo `debeCambiarPassword` en `Usuario` (default `true` para
usuarios nuevos y para el seed). Al entrar, pantalla obligatoria antes de llegar
al dashboard.

### L4 · Política de contraseña real
Hoy: `@MinLength(8)` y nada más. `12345678` pasa.

**Qué hacer:** exigir mayúscula + número, rechazar las obvias. Sin volverse
insoportable — la usa un cajero, no un ingeniero.

### L5 · Limpiar el panel de branding
"5 Sucursales · 12k+ SKUs · 24/7" son cifras de demo en un sistema real con dos
sucursales. Dos minutos.

---

## FASE 2 — Trazabilidad
Lo que separa "funciona" de "es serio". Aditivo puro: solo escribe registros.

### L6 · Auditoría de accesos  🟠 IMPORTANTE
No existe modelo de auditoría en `schema.prisma` (revisados los 26 modelos). El
único rastro es `Usuario.ultimoAccesoEn`, **que se sobrescribe en cada login**.

Consecuencia práctica: si mañana falta plata en un arqueo, no hay forma de saber
quién entró al sistema, cuándo, ni desde qué terminal. Todo el bloque C se
construyó para que "no haya movimiento raro" — pero el acceso en sí no deja
huella.

**Qué hacer:** modelo `RegistroAcceso` (usuario, éxito/fallo, IP, terminal,
fecha). Se escribe en login y en refresh fallido.

### L7 · Bloqueo por intentos fallidos por CUENTA
Hoy el Throttler limita **por IP**, no por cuenta. Dos efectos:

- Un cajero que se equivoca 5 veces bloquea ese terminal para todos un minuto.
- Un atacante rotando IPs prueba contraseñas sin límite real contra una cuenta.

**Qué hacer:** contador de fallos por usuario, bloqueo temporal escalado
(5 fallos → 5 min). Depende de L6.

### L8 · Pantalla "Accesos recientes" para el admin
La auditoría sirve si alguien la puede mirar sin abrir la base de datos.

---

## FASE 3 — Sesión y turno
La más valiosa para tu caso y la más invasiva: toca el POS. Bloque propio.

### L9 · Bloqueo por inactividad  🟠 ALTO VALOR
El refresh dura 7 días. María abre su caja, se aleja del mostrador, y quien sea
vende bajo su nombre. Al cierre el arqueo no cuadra y la responsabilidad cae
sobre ella. **Es el hueco exacto que deja abierto todo el modelo de caja.**

**Qué hacer:** a los 10–15 min sin actividad, bloquear la pantalla y pedir
credenciales. Sin cerrar la caja, sin perder el carrito. Ese detalle es lo que
lo hace usable en vez de odiado.

### L10 · PIN de desbloqueo
Va pegado a L9: teclear email + contraseña 20 veces al día es inviable en un
mostrador. PIN de 4–6 dígitos solo para desbloquear (nunca para el login
inicial).

### L11 · Cerrar sesión al cerrar caja
Cierre de turno = fin de sesión. Encadena natural con el relevo (C9).

---

## Lo que NO recomiendo
- **2FA** — para una botica con 5 empleados es fricción sin retorno.
- **Sesiones activas / cerrar en otros dispositivos** — obliga a guardar refresh
  tokens en BD y perder el diseño stateless. No lo vale a esta escala.
- **Recuperación de contraseña por email** — requiere servidor SMTP y más
  superficie de ataque. Que la resetee el admin es lo correcto aquí.

---

## Orden sugerido
1. **L2 + L3 + L4** — contraseñas: nadie puede cambiar la suya y todos siguen
   con la clave del seed. Es lo más urgente de la Fase 1.
2. **L6 + L7** — auditoría de accesos y bloqueo por cuenta. Lo que más te
   acerca a "sistema serio"; L7 depende de L6.
3. **Fase 3** — bloqueo por inactividad. Planificar aparte: toca el POS.
4. **L1 + L5 + L8** — ajustes menores, cuando haya hueco.

## Al retomar esto en otro chat
Contexto mínimo que hay que recordar:
- El flujo de login ya está auditado y corregido (jul-2026): redirect saneado,
  refresh automático 60 s antes de expirar, `accessToken()` como lectura pura,
  interceptor que no mata sesiones recién creadas.
- Archivos del flujo: `src/app/core/auth/{auth.service.ts, jwt.interceptor.ts,
  auth.guard.ts}` y `src/app/features/auth/login/{login.ts, login.html}`.
- Backend: `backend/src/auth/auth.service.ts` (stateless, refresh por firma sin
  guardar en BD) y `backend/src/usuarios/usuarios.controller.ts`
  (`@Roles('SUPER_ADMIN','ADMIN')` a nivel de clase — ese es el bloqueo de L2).
- Restricción de siempre: **cero riesgos al flujo de venta, todo aditivo**.
