#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Bucle del contenedor de respaldo.
#
# 1. Hace UN respaldo al arrancar (así compruebas al instante que funciona y
#    quedas protegido desde el primer minuto).
# 2. Luego espera hasta la hora fijada (BACKUP_HOUR, por defecto 23:00) y
#    respalda una vez al día, indefinidamente.
#
# Se ejecuta a la hora en que la botica suele estar cerrada para no competir
# con las ventas.
# ─────────────────────────────────────────────────────────────────────────────
set -eu

HORA_OBJETIVO="${BACKUP_HOUR:-23}"
DIR="$(dirname "$0")"

echo "[backup] Contenedor de respaldo iniciado. Respaldo diario a las ${HORA_OBJETIVO}:00."

# Respaldo inmediato de arranque (no tumba el contenedor si falla una vez).
sh "${DIR}/backup.sh" || echo "[backup] Aviso: el respaldo de arranque falló; se reintenta a la hora programada."

while true; do
  ahora_h="$(date +%H)"
  ahora_m="$(date +%M)"
  ahora_s="$(date +%S)"
  # Normaliza a base 10 (evita que 08/09 se interpreten como octal).
  ahora_seg=$(( 10#$ahora_h * 3600 + 10#$ahora_m * 60 + 10#$ahora_s ))
  objetivo_seg=$(( 10#$HORA_OBJETIVO * 3600 ))

  faltan=$(( objetivo_seg - ahora_seg ))
  # Si ya pasó la hora de hoy, apunta a la de mañana.
  [ "$faltan" -le 0 ] && faltan=$(( faltan + 86400 ))

  echo "[backup] Próximo respaldo en $(( faltan / 3600 ))h $(( (faltan % 3600) / 60 ))m."
  sleep "$faltan"

  sh "${DIR}/backup.sh" || echo "[backup] ERROR: el respaldo programado falló; se reintenta mañana."
done
