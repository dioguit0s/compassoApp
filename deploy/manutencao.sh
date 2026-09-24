#!/usr/bin/env bash
# Manutenção diária (especificação §6.7, ADR-0010, ADR-0011): dump do PostgreSQL com retenção e,
# depois, purga dos tombstones com mais de TRASH_RETENTION_DAYS. O deploy.sh instala este script
# em ~/compasso; o cron do usuário ash o dispara às 04:00:
#
#   0 4 * * * $HOME/compasso/manutencao.sh >> $HOME/compasso/manutencao.log 2>&1
#
#   BACKUP_DIR         destino dos dumps (padrão ~/backups/compasso)
#   BACKUP_KEEP_DAILY  quantos dumps manter (padrão 7)
#
# Falha alto: qualquer erro sai com código ≠ 0 e mensagem no log.
set -euo pipefail
umask 077

DESTINO="${COMPASSO_DIR:-$HOME/compasso}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/compasso}"
KEEP="${BACKUP_KEEP_DAILY:-7}"

if ! [[ "$KEEP" =~ ^[1-9][0-9]*$ ]]; then
  echo "backup: BACKUP_KEEP_DAILY precisa ser inteiro >= 1 (recebido: $KEEP)" >&2
  exit 2
fi

echo "manutenção: $(date -Is)"
mkdir -p "$BACKUP_DIR"
carimbo="$(date -u +%Y%m%dT%H%M%SZ)"
destino="$BACKUP_DIR/compasso-$carimbo.dump"
parcial="$destino.parcial"

trap 'rm -f "$parcial"' EXIT

# Dentro do container, pelo socket local (a imagem oficial confia nele): nenhuma senha aqui.
# Formato custom (-Fc): comprimido e restaurável seletivamente com pg_restore.
if ! docker exec compasso-postgres pg_dump -U compasso_owner -Fc --no-owner compasso >"$parcial"; then
  echo "backup: pg_dump falhou" >&2
  exit 1
fi
if [[ ! -s "$parcial" ]]; then
  echo "backup: dump vazio" >&2
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

# Purga depois do backup: o dump do dia ainda carrega os tombstones que saem agora.
docker compose --project-directory "$DESTINO" -f "$DESTINO/compose.yml" \
  run --rm -T admin npm run db:purgar
