#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Restauración de un respaldo de FarmaSys.
#
# ⚠  BORRA los datos actuales y los reemplaza por los del respaldo elegido.
#    Úsalo solo para recuperar tras una pérdida, no en operación normal.
#
# Uso (desde tu PC, con el stack levantado):
#   docker compose run --rm backup sh /scripts/restore.sh              → lista los respaldos
#   docker compose run --rm backup sh /scripts/restore.sh <archivo>    → restaura ese
# ─────────────────────────────────────────────────────────────────────────────
set -eu

DB_HOST="${DB_HOST:-postgres}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-farmasys}"
DIR="${BACKUP_DIR:-/backups}"
export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"

if [ "$#" -lt 1 ]; then
  echo "Respaldos disponibles en ${DIR}:"
  echo
  ls -1t "${DIR}"/farmasys_*.dump 2>/dev/null | while read -r f; do
    printf "  %s   (%s)\n" "$(basename "$f")" "$(du -h "$f" | cut -f1)"
  done
  echo
  echo "Para restaurar:"
  echo "  docker compose run --rm backup sh /scripts/restore.sh farmasys_AAAA-MM-DD_HHMMSS.dump"
  exit 0
fi

archivo="$1"
# Acepta tanto el nombre suelto como la ruta completa.
case "$archivo" in
  /*) ruta="$archivo" ;;
  *)  ruta="${DIR}/${archivo}" ;;
esac

if [ ! -f "$ruta" ]; then
  echo "ERROR: no se encontró el respaldo: $ruta" >&2
  echo "Ejecuta el comando sin argumentos para ver la lista." >&2
  exit 1
fi

echo "─────────────────────────────────────────────────────────────"
echo "  Vas a RESTAURAR: $(basename "$ruta")"
echo "  Sobre la base:   ${DB_NAME} en ${DB_HOST}"
echo "  Esto BORRA los datos actuales y los reemplaza."
echo "─────────────────────────────────────────────────────────────"
printf "  Escribe RESTAURAR para continuar: "
read -r confirma
[ "$confirma" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

# --clean --if-exists: elimina los objetos antes de recrearlos, así la
# restauración parte de cero aunque la base tenga datos.
echo "Restaurando..."
pg_restore -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner "$ruta"
echo "✓ Restauración completada desde $(basename "$ruta")."
