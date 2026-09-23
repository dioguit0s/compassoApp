# TASKS.md

Checklist persistente para tarefas longas. O Claude atualiza este arquivo durante o trabalho:
o histórico da conversa é resumido com o tempo, este arquivo não.

Ao iniciar uma tarefa longa, substitua o conteúdo abaixo. Ao concluí-la, limpe o arquivo ou
mova o registro para o PR/commit correspondente.

---

## Tarefa atual

**Objetivo:** executar o roadmap a partir da F0, issue por issue, na branch
`claude/dev-roadmap-issues-d913ui`.

**Pronto quando:**
- [ ] F0 (#1–#13) implementada; o que exige aparelho/servidor real está documentado
- [ ] F1 (#15–#24) implementada, com os quatro cenários de sync passando
- [ ] `npm run lint`, `npm run typecheck` e `npm test` passam da raiz

**Parar e perguntar se:** a próxima fase depende de decisão de produto (F2 abre com #26, fuso ao
viajar) ou de verificação no aparelho real (#14, #25).

### Checklist
- [ ] #1 monorepo, lint, typecheck, test
- [ ] #2 Postgres + Drizzle + migrações
- [ ] #3 RLS
- [ ] #4 API, middleware de token, /me, /health
- [ ] #5 camada de repositório
- [ ] #6 script de criação de conta
- [ ] #7 app Expo, dev build, quatro abas
- [ ] #8 core via Metro
- [ ] #9 datas com fuso no Hermes (tela de diagnóstico)
- [ ] #10 SQLite local + cache do /me
- [ ] #11 docs/deploy.md + túnel
- [ ] #12 backup pg_dump
- [ ] #13 restauração documentada
- [ ] #15 items no Postgres com CHECKs
- [ ] #16 UUIDv7
- [ ] #17 items no SQLite
- [ ] #18 CRUD local
- [ ] #19 tela provisória
- [ ] #20 /sync/push
- [ ] #21 /sync/pull
- [ ] #22 motor de sync no app
- [ ] #23 purga de tombstones
- [ ] #24 testes de integração dos 4 cenários
- [ ] revisar o próprio diff

### Decisões tomadas
- (preenchido durante o trabalho)

### Pendências para o usuário
- #14 e #25 exigem aparelho real, túnel e servidor doméstico
- #26 (fuso ao viajar) bloqueia a F2

### Não confirmado
- (preenchido durante o trabalho)
