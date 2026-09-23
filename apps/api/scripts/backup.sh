#!/usr/bin/env bash
# Dump diário do PostgreSQL com retenção (especificação §6.7).
#
# Conexão pelas variáveis padrão do libpq (PGHOST, PGPORT, PGUSER, PGDATABASE) e senha no
# ~/.pgpass do usuário que roda o script — nunca no crontab nem na unit do systemd.
#
#   BACKUP_DIR         destino dos dumps (obrigatória)
#   BACKUP_KEEP_DAILY  quantos dumps manter (padrão 7)
#
# Falha alto: qualquer erro sai com código ≠ 0 e mensagem em stderr (vai para o journal).
set -euo pipefail

: "${BACKUP_DIR:?BACKUP_DIR não definida}"
KEEP="${BACKUP_KEEP_DAILY:-7}"
DB="${PGDATABASE:-compasso}"
export PGUSER="${PGUSER:-compasso_owner}"

if ! [[ "$KEEP" =~ ^[1-9][0-9]*$ ]]; then
  echo "backup: BACKUP_KEEP_DAILY precisa ser inteiro >= 1 (recebido: $KEEP)" >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"
carimbo="$(date -u +%Y%m%dT%H%M%SZ)"
destino="$BACKUP_DIR/compasso-$carimbo.dump"
parcial="$destino.parcial"

trap 'rm -f "$parcial"' EXIT

# Formato custom (-Fc): comprimido e restaurável seletivamente com pg_restore.
if ! pg_dump -Fc --no-owner --dbname="$DB" --file="$parcial"; then
  echo "backup: pg_dump falhou para o banco $DB" >&2
  exit 1
fi
if [[ ! -s "$parcial" ]]; then
  echo "backup: dump vazio para o banco $DB" >&2
  exit 1
fi
mv "$parcial" "$destino"
echo "backup: $destino ($(du -h "$destino" | cut -f1))"

# Retenção por quantidade, não por idade: o nome carrega o carimbo UTC, então a ordem
# lexicográfica é a cronológica. Dumps parciais nunca entram na conta.
mapfile -t antigos < <(find "$BACKUP_DIR" -maxdepth 1 -name 'compasso-*.dump' -printf '%f\n' | sort | head -n "-$KEEP")
for f in "${antigos[@]}"; do
  rm -f -- "$BACKUP_DIR/$f"
  echo "backup: removido $f"
done
