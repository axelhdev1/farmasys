# Respaldos de la base de datos — FarmaSys

Los respaldos protegen todo lo que vale del sistema: ventas, inventario, caja,
clientes, historial. Sin ellos, un disco dañado o un borrado accidental =
negocio perdido sin vuelta atrás.

## Cómo funciona

Al levantar el sistema (`docker compose up -d`) arranca también un contenedor
`backup` que:

1. Hace **un respaldo inmediato** al iniciar (para que veas que funciona).
2. Luego respalda **una vez al día a las 23:00**, cuando la botica está cerrada.
3. Conserva los **últimos 30 respaldos** y borra los más viejos solos.

Los archivos quedan en tu PC, en:

    H:\sistema-botica\backend\backups\

Cada uno se llama `farmasys_AAAA-MM-DD_HHMMSS.dump`.

## Verificar que está corriendo

    docker compose ps                 # debe aparecer el servicio "backup"
    docker compose logs backup        # muestra cada respaldo y cuándo es el próximo

Y mira que en `backend\backups\` vayan apareciendo archivos `.dump`.

## Hacer un respaldo AHORA mismo (manual)

Antes de una actualización grande o de tocar algo delicado, conviene uno fresco:

    docker compose exec backup sh /scripts/backup.sh

## Restaurar (recuperar tras una pérdida)

⚠ La restauración **borra los datos actuales** y los reemplaza por los del
respaldo. Úsala solo para recuperarte de una pérdida.

Ver los respaldos disponibles:

    docker compose exec backup sh /scripts/restore.sh

Restaurar uno concreto (pide escribir RESTAURAR para confirmar):

    docker compose exec backup sh /scripts/restore.sh farmasys_2026-07-21_230000.dump

## Ajustes (opcionales, en el .env)

    BACKUP_HOUR=23     # hora del respaldo diario (0-23)
    BACKUP_KEEP=30     # cuántos respaldos conservar

Tras cambiarlos:  `docker compose up -d backup`

## ⚠ IMPORTANTE: copia fuera del disco (hazlo antes de operar)

Un respaldo que vive en el MISMO disco que la base **no es un respaldo**: te
salva de un borrado accidental, pero no de que ese disco se dañe, te roben la
PC o un ransomware la cifre. Con 5 boticas, perder la base es perder el negocio.

El sistema ya sabe copiar cada respaldo a un segundo lugar. Solo hay que
decirle dónde. **Dos pasos:**

**1. En `docker-compose.yml`**, dentro del servicio `backup`, descomenta la
línea del volumen y pon tu carpeta sincronizada con la nube:

```yaml
    volumes:
      - ./backups:/backups
      - ./scripts:/scripts:ro
      - "C:/Users/TU_USUARIO/Google Drive/FarmaSys:/espejo"
```

**2. En `backend\.env`**, agrega:

```
BACKUP_ESPEJO=/espejo
BACKUP_ESPEJO_KEEP=90
```

Luego `docker compose up -d backup`. Desde ese momento, cada respaldo se copia
solo a esa carpeta y Google Drive (o el que uses) lo sube a la nube.

Para comprobar que funciona:

    docker compose exec backup sh /scripts/backup.sh

Debe imprimir `Copia espejo → /espejo`, y el archivo aparecer en tu carpeta de
la nube.

> ¿No usas nube? Sirve igual un disco externo o una carpeta de red. Lo único
> que NO sirve es otra carpeta del mismo disco.

**Nota sobre la retención:** en el disco se guardan 30 respaldos y en el espejo
90, porque fuera suele convenir más historia (un error puede detectarse semanas
después).
