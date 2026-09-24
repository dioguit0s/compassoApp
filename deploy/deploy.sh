#!/usr/bin/env bash
# Deploy da API no homeserver (ADR-0011). Roda no runner self-hosted, a partir do checkout:
#   deploy/deploy.sh
#
# 1. constrói compasso-api:<commit>
# 2. copia compose e scripts para ~/compasso (onde ficam os .env, fora do repositório)
# 3. sobe o PostgreSQL, se ainda não estiver no ar, e aplica as migrações
# 4. troca o container da API e confere GET /health
# 5. se o /health falhar, volta para a versão anterior e sai com erro
#
# As migrações são aditivas (especificação §6.1), então a versão anterior continua funcionando
# sobre o banco já migrado — é isso que torna o rollback seguro.
set -euo pipefail

DESTINO="${COMPASSO_DIR:-$HOME/compasso}"
PORTA="${COMPASSO_PORTA:-8090}"
raiz="$(cd "$(dirname "$0")/.." && pwd)"
novo="$(git -C "$raiz" rev-parse --short=12 HEAD)"

for f in api.env admin.env; do
  if [[ ! -f "$DESTINO/$f" ]]; then
    echo "deploy: falta $DESTINO/$f (docs/deploy.md, instalação inicial)" >&2
    exit 1
  fi
done

anterior=""
if [[ -f "$DESTINO/.env" ]]; then
  anterior="$(sed -n 's/^COMPASSO_TAG=//p' "$DESTINO/.env")"
fi

compose() {
  local tag="$1"
  shift
  COMPASSO_TAG="$tag" docker compose --project-directory "$DESTINO" -f "$DESTINO/compose.yml" "$@"
}

saudavel() {
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$PORTA/health" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

echo "deploy: construindo compasso-api:$novo (no ar: ${anterior:-nenhuma})"
docker build --pull -f "$raiz/apps/api/Dockerfile" -t "compasso-api:$novo" "$raiz"

install -m 644 "$raiz/deploy/compose.yml" "$DESTINO/compose.yml"
install -m 755 "$raiz/deploy/postgres-init.sh" "$DESTINO/postgres-init.sh"
install -m 644 "$raiz/apps/api/scripts/bootstrap.sql" "$DESTINO/bootstrap.sql"
install -m 755 "$raiz/deploy/manutencao.sh" "$DESTINO/manutencao.sh"

compose "$novo" up -d --wait postgres
echo "deploy: migrações"
compose "$novo" run --rm -T admin npm run db:migrate
compose "$novo" up -d --no-deps api

if saudavel; then
  printf 'COMPASSO_TAG=%s\n' "$novo" >"$DESTINO/.env"
  echo "deploy: compasso-api:$novo no ar"
  # Guarda só a versão nova e a anterior (alvo de rollback).
  docker image ls compasso-api --format '{{.Tag}}' |
    grep -vxF -e "$novo" -e "${anterior:-$novo}" |
    xargs -r -I{} docker image rm "compasso-api:{}" >/dev/null || true
  exit 0
fi

echo "deploy: /health não respondeu com compasso-api:$novo" >&2
compose "$novo" logs --tail 80 api >&2 || true
if [[ -n "$anterior" && "$anterior" != "$novo" ]]; then
  echo "deploy: voltando para compasso-api:$anterior" >&2
  compose "$anterior" up -d --no-deps api
  if saudavel; then
    echo "deploy: rollback concluído, compasso-api:$anterior no ar" >&2
  else
    echo "deploy: rollback também falhou — API fora do ar" >&2
  fi
fi
exit 1
