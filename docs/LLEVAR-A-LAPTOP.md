# Llevar FarmaSys a la laptop (demo para el cliente)

Objetivo: que en la laptop TODO el sistema (pantalla + servidor + base de datos)
arranque con **un solo comando**, sin instalar Node ni Angular, y con los datos
que ya cargaste en esta computadora.

Todo corre dentro de Docker. La laptop solo necesita **Docker Desktop**.

---

## En ESTA computadora (antes de copiar)

### 1. Deja el sistema sano y haz un respaldo con datos

Primero reconstruye todo y comprueba que entra bien:

    cd H:\sistema-botica\backend
    docker compose up -d --build
    docker compose ps

Los cuatro servicios (postgres, redis, api, frontend) deben quedar `Up`. Abre
`http://localhost:4200`, entra con tu admin y verifica que ves tus datos.

Ahora genera un respaldo fresco de la base (queda en `backend\backups\`):

    docker compose exec backup sh /scripts/backup.sh

Anota el nombre del archivo que crea (algo como `farmasys_2026-07-21_....dump`).

### 2. Apaga los contenedores

    docker compose down

(Esto NO borra tus datos ni el respaldo; solo detiene los contenedores.)

---

## Copiar a la laptop

Copia **toda la carpeta** `H:\sistema-botica` a la laptop (USB, disco externo o
red). Asegúrate de que se copien también:

- `backend\.env`  ← tiene las claves; sin él la API no arranca.
- `backend\backups\`  ← ahí está el respaldo con tus datos.

No hace falta copiar `node_modules`, `dist` ni `.angular` (se regeneran solos y
solo hacen la copia más pesada).

---

## En la LAPTOP

### 3. Instala Docker Desktop

Descárgalo de docker.com, instálalo y **ábrelo** (debe quedar corriendo el
ícono de la ballena). En Windows puede pedir activar WSL2 — acepta.

### 4. Levanta todo el sistema

Abre una terminal en la carpeta copiada:

    cd <ruta>\sistema-botica\backend
    docker compose up -d --build

La primera vez tarda unos minutos (descarga imágenes y compila el frontend).
Cuando termine, verifica:

    docker compose ps

Los cuatro servicios deben estar `Up`.

### 5. Restaura tus datos

En este punto la base está vacía (recién creada). Restaura el respaldo que
trajiste (usa el nombre real del archivo):

    docker compose exec backup sh /scripts/restore.sh farmasys_2026-07-21_....dump

Te pedirá escribir `RESTAURAR` para confirmar. Al terminar, tus productos,
usuarios y stock ya están en la laptop.

> ¿No sabes el nombre exacto? Lista los respaldos disponibles con:
>
>     docker compose exec backup sh /scripts/restore.sh
>
> OJO: la laptop crea respaldos propios (vacíos) al arrancar. Restaura el que
> trajiste de tu PC (por su fecha/hora), NO uno recién creado en la laptop.

### 6. Abre el sistema

En el navegador de la laptop:

- **Sistema:** http://localhost:4200
- Usuario: `admin@farmasys.pe` · Contraseña: la que tengas (por defecto `Admin1234!`)

Listo para mostrarle al cliente.

---

## Direcciones útiles

| Qué | Dónde |
|-----|-------|
| Sistema (pantalla) | http://localhost:4200 |
| API | http://localhost:3000/api/v1 |
| Documentación API (Swagger) | http://localhost:3000/api/docs |

## Apagar y volver a encender

- Apagar al terminar el demo:  `docker compose down`
- Volver a encender (ya construido, arranca en segundos):  `docker compose up -d`

Los datos quedan guardados entre apagados (viven en el volumen de Docker), y el
respaldo diario sigue corriendo solo mientras el sistema esté encendido.

---

## Si algo falla

- **"Sin conexión" en el login** → la API no está arriba. Mira `docker compose ps`;
  si el `api` está `Restarting`, revisa `docker compose logs api --tail 40`.
- **La pantalla no carga (localhost:4200)** → mira `docker compose logs frontend`.
  Si el build falló, vuelve a correr `docker compose up -d --build frontend`.
- **Docker no levanta nada** → confirma que Docker Desktop esté abierto y corriendo.
- **Quieres empezar de cero (sin tus datos)** → en vez del paso 5, corre
  `docker compose exec api npm run db:seed` para una base limpia con el admin.
