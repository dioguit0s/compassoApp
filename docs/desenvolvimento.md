# Desenvolvimento

Como rodar, testar e evoluir o Compasso localmente. Decisões de ferramenta estão no
[ADR-0002](adr/0002-ferramentas-e-convencoes-da-fundacao.md); deploy e backup em
[`deploy.md`](deploy.md).

## Pré-requisitos

- Node.js 22+ (o npm que vem com ele gerencia os workspaces)
- Docker, **só** para o PostgreSQL de desenvolvimento. Os testes não precisam dele: sobem um
  PostgreSQL descartável sozinhos (`embedded-postgres`)
- Para o app: Android Studio e/ou Xcode, e um aparelho (ver [App](#app))

## Primeiros passos

```sh
npm install                          # instala os três pacotes
npm run lint && npm run typecheck && npm test

docker compose up -d                 # PostgreSQL 17 com os papéis compasso_owner e compasso_app
cp apps/api/.env.example apps/api/.env
npm run db:migrate -w @compasso/api  # banco vazio → schema atual
npm run conta:criar -w @compasso/api -- "Seu Nome"   # imprime o token uma vez
npm run dev -w @compasso/api         # http://localhost:3000
curl -H "Authorization: Bearer <token>" localhost:3000/me
```

## Estrutura

```
apps/api         API Node (Hono + Drizzle + node-postgres)
  drizzle/       migrações versionadas — geradas, nunca editadas depois de commitadas
  scripts/       bootstrap dos papéis, migração, criação de conta, purga, backup
  src/db/        ÚNICO lugar que fala com o banco: schema, repositórios, admin
apps/mobile      app Expo (development build), SQLite local
packages/core    lógica pura, sem Node nem React Native: IDs, validação, sync, (F3) RRULE, (F6) XP
```

## Banco

### Papéis

| Papel | Quem usa | Sujeito ao RLS |
|---|---|---|
| `compasso_owner` | migrações, `conta:criar`, purga de tombstones, backup | não (dono das tabelas) |
| `compasso_app` | a API em execução | **sim** |

A API conecta com `DATABASE_URL` (papel `compasso_app`). Scripts usam `DATABASE_ADMIN_URL`
(papel `compasso_owner`). A API em execução nunca lê `DATABASE_ADMIN_URL`.

### Fluxo de mudança de schema

1. Alterar `apps/api/src/db/schema.ts`
2. `npm run db:generate -w @compasso/api -- --name descricao-curta` → gera `drizzle/NNNN_*.sql`
3. Se precisar de SQL que o Drizzle não expressa (GRANT, função, trigger):
   `npm run db:generate -w @compasso/api -- --custom --name descricao-curta` e escrever o SQL
4. `npm run db:migrate -w @compasso/api` — aplica as pendentes
5. Commitar o SQL e `drizzle/meta/` juntos

Nunca usar `drizzle-kit push`: o schema chega ao banco só por migração versionada.

### Checklist de tabela nova

Toda tabela nova do servidor segue estes passos, na mesma migração ou em migrações do mesmo commit:

- [ ] coluna `user_id uuid not null` com FK para `users` e índice (exceto `users`, cujo dono é o `id`)
- [ ] `pgPolicy` no `schema.ts`, `to: papelApp`, com `using` **e** `withCheck` comparando
      `user_id = app_user_id()` — o Drizzle gera o `ENABLE ROW LEVEL SECURITY`
- [ ] migração customizada com `GRANT SELECT, INSERT, UPDATE ON <tabela> TO compasso_app` —
      **nunca** `DELETE`
- [ ] se for sincronizável: `deleted_at`, `updated_at` (relógio do client, para LWW) e
      `server_updated_at` com o trigger `carimbar_servidor` (relógio do servidor, para o cursor)
- [ ] acesso só pelo repositório escopado em `src/db/repositorios.ts`
- [ ] `npm test -w @compasso/api` — o teste `rls.test.ts` falha se a tabela ficar sem RLS ou sem política

## Testes

`npm test` na raiz roda o core e a API. A API sobe um PostgreSQL 17 descartável por execução,
reproduz o bootstrap dos papéis e aplica as migrações — sem passo manual. Para apontar para um
servidor existente, defina `TEST_POSTGRES_URL` com um superusuário (o banco `compasso_teste` é
recriado a cada execução).
