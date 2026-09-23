# ADR-0002: Ferramentas e convenções da Fundação (F0)

- **Data:** 2026-09-23
- **Status:** aceito
- **Envolvidos:** Diogo (autor), Claude Code (implementação)

## Contexto

A F0 do [roadmap](../roadmap.md) pede um esqueleto que autentica, grava local, fala com o servidor
e é implantável. As issues #1 a #13 deixam várias escolhas em aberto ("escolher o gerenciador de
pacotes", "escolher o framework HTTP", "decidir como mapear token → `userId`"). Nenhuma delas muda
escopo nem arquitetura da [especificação](../especificacao-tecnica-v1.md); todas mudam o que se
encontra ao abrir o repositório. Ficam registradas juntas aqui.

## Decisões

| Tema | Escolha | Alternativas consideradas | Por quê |
|---|---|---|---|
| Workspaces | **npm workspaces** | pnpm, yarn | Já vem com o Node; o Expo/Metro funciona com `node_modules` içado sem configuração extra de `node-linker` |
| Consumo do `packages/core` | **Fonte TypeScript direto** (`main: src/index.ts`), sem build | Compilar para `dist/` | Metro e `tsx` transpilam TS; sem passo de build não existe `dist` desatualizado |
| Execução da API | **`tsx`** em dev e em produção | Bundle com tsup/esbuild | Um processo num servidor doméstico; o custo de transpilar na inicialização é irrelevante |
| Framework HTTP | **Hono** sobre `@hono/node-server` | Express, Fastify | Tipado de ponta a ponta, middleware com variáveis tipadas (`c.var.userId`), `app.request()` para testar sem abrir porta |
| Validação de payload | **zod** (em `packages/core`) | valibot | O mesmo schema valida no app e na API |
| Testes | **Vitest** | Jest | Roda TS sem configuração; mesmo runner no core e na API |
| Banco nos testes | **`embedded-postgres`** (PostgreSQL 17 real, descartável) | Testcontainers, PGlite | Não exige Docker na máquina de desenvolvimento; é Postgres de verdade, então RLS e `CHECK` valem |
| Nomes de coluna | **`snake_case` no banco**, `camelCase` no código, via `casing: 'snake_case'` do Drizzle | Aspas em `camelCase` no banco | Decidido uma vez, aplicado pelo Drizzle; o `psql` fica legível |
| Chave primária | **UUIDv7 gerado pelo client**, implementação própria em `packages/core` | Biblioteca `uuid` | Bibliotecas buscam `crypto.getRandomValues` global, que o Hermes não tem; a fonte de aleatoriedade é injetada (`expo-crypto` no app, `globalThis.crypto` no Node) |
| Token → `userId` | **Tabela `api_tokens` com o SHA-256 do token**; um token por aparelho | `AUTH_TOKEN` em variável de ambiente | Revogável individualmente (`revoked_at`) sem reiniciar a API; o token em claro só aparece uma vez, na saída do script. A troca por autenticação real (F10) continua localizada no middleware |
| Papéis do banco | **`compasso_owner`** (dono: migrações, scripts, purga, backup) e **`compasso_app`** (API) | Um papel só | Dono de tabela ignora RLS; a API precisa de um papel que não seja dono nem superusuário |
| RLS | **`ENABLE`**, não `FORCE` | `FORCE ROW LEVEL SECURITY` | O papel da API nunca é dono, então `ENABLE` já o sujeita às políticas; `FORCE` bloquearia também os scripts do dono (criação de conta, purga), que rodam fora de requisição |
| Resolução do token | **Função `SECURITY DEFINER` `resolver_token(hash)`** | Dar `SELECT` em `api_tokens` à API | O middleware precisa do `userId` antes de existir `app.user_id`; a função expõe só essa consulta, e a tabela continua invisível para a API |
| App | **Expo SDK 57 com development build** e **Expo Router** (abas por arquivo) | Expo Go; React Navigation direto | Expo Go não tem alarme exato do Android 12+ (roadmap §6); o Router é a navegação padrão do SDK |
| Configuração do Metro | **Automática do Expo para monorepo** + `sourceExts` com `sql` | `watchFolders`/`nodeModulesPaths` à mão | Desde o SDK 52 o Expo detecta workspaces; configuração manual sobrescreve a automática. React duplicado é evitado com `overrides` na raiz |
| URL e token no app | **`expo-secure-store`**, digitados na primeira abertura | `EXPO_PUBLIC_*` | Variável `EXPO_PUBLIC_*` é embutida em texto puro no bundle |
| Schema do SQLite | **Em `packages/core/src/local`**, migrações em `apps/mobile/drizzle` | Schema dentro do app | O motor de sync e o repositório local rodam também nos testes em Node, sobre o mesmo schema |
| Datas no SQLite | **Inteiro, epoch ms UTC**, em toda coluna de data | Texto ISO 8601 | Um formato só; a comparação do LWW é numérica |
| Datas e fusos | **`Intl.DateTimeFormat` nativo do Hermes** para formatação com fuso; `date-fns` v4 + `@date-fns/tz` quando a F2 precisar de aritmética de calendário | Luxon, Day.js, Temporal polyfill | `@date-fns/tz` é construído sobre o mesmo `Intl`, sem base de fusos embutida. Se o diagnóstico no aparelho falhar, o plano B é `@formatjs/intl-datetimeformat` com os dados de fuso |
| Exclusão física | **A API não tem `DELETE` em nenhuma tabela** | Confiar no repositório | A purga de tombstones roda com o papel dono, fora da API |

## Consequências

- A variável `AUTH_TOKEN` da seção 9 da especificação sai; entram `DATABASE_ADMIN_URL` (papel dono,
  só para scripts) e `SYNC_CURSOR_WINDOW_SECONDS`. A seção 9 foi atualizada no mesmo commit.
- Toda tabela nova segue o checklist de [`docs/desenvolvimento.md`](../desenvolvimento.md#checklist-de-tabela-nova):
  política de RLS no schema do Drizzle, `GRANT` explícito numa migração customizada e nenhum
  `DELETE` para `compasso_app`. Um teste (`apps/api/test/rls.test.ts`) falha se uma tabela do
  schema `public` existir sem RLS ou sem política.
- Instalar a API num servidor exige rodar `apps/api/scripts/bootstrap.sql` uma vez como
  superusuário, antes da primeira migração. Está em [`docs/deploy.md`](../deploy.md).
