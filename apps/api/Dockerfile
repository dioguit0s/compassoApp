# Imagem da API (ADR-0011). Contexto de build: a raiz do monorepo.
#   docker build -f apps/api/Dockerfile -t compasso-api .
#
# Sem etapa de compilação: a API roda o TypeScript com tsx, como em desenvolvimento, e importa o
# @compasso/core direto do código-fonte (packages/core/package.json aponta para src/).
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    TZ=America/Sao_Paulo \
    AVATAR_DIR=/var/lib/compasso/avatares \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# O lockfile é do monorepo inteiro e o npm ci instala a árvore toda, inclusive o app (expo, react
# native). Por isso: npm ci exato pelo lockfile, depois o app sai da lista de workspaces e o prune
# remove o que só ele usava, as dependências de desenvolvimento e os peers opcionais do drizzle-orm
# (expo-sqlite puxaria o React Native inteiro).
# --ignore-scripts: o better-sqlite3 (dos testes) entra como peer opcional do drizzle-orm e tentaria
# compilar; nada em produção precisa de script de instalação (sharp e esbuild usam binários
# pré-compilados de pacotes opcionais).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/core/package.json packages/core/
RUN npm ci --ignore-scripts \
    && npm pkg set workspaces[0]=apps/api workspaces[1]=packages/core \
    && npm prune --omit=dev --omit=peer --ignore-scripts \
    && npm cache clean --force

COPY tsconfig.base.json ./
COPY packages/core/src packages/core/src
COPY apps/api/src apps/api/src
COPY apps/api/scripts apps/api/scripts
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/tsconfig.json apps/api/

# Volume das fotos de perfil: criado aqui para o volume nomeado herdar o dono.
RUN mkdir -p "$AVATAR_DIR" && chown node:node "$AVATAR_DIR"

USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["/app/node_modules/.bin/tsx", "src/main.ts"]
