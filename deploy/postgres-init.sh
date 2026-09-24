#!/bin/sh
# Primeiro `up` do PostgreSQL de produção (deploy/compose.yml): cria os papéis e o banco com as
# senhas do admin.env. O entrypoint da imagem só roda isto com o volume de dados vazio.
set -e
: "${COMPASSO_OWNER_PASSWORD:?COMPASSO_OWNER_PASSWORD não definida no admin.env}"
: "${COMPASSO_APP_PASSWORD:?COMPASSO_APP_PASSWORD não definida no admin.env}"
psql -v ON_ERROR_STOP=1 -U postgres \
  -v senha_dono="'$COMPASSO_OWNER_PASSWORD'" -v senha_app="'$COMPASSO_APP_PASSWORD'" \
  -f /compasso/bootstrap.sql
