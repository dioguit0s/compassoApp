#!/bin/sh
# Usado só pelo docker-compose de desenvolvimento. Senhas de dev, nunca de produção.
set -e
psql -v ON_ERROR_STOP=1 -U postgres \
  -v senha_dono="'dev-dono'" -v senha_app="'dev-app'" \
  -f /compasso/bootstrap.sql
