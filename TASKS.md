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
- [x] F0 (#1–#13) implementada; o que exige aparelho/servidor real está documentado
- [x] F1 (#15–#24) implementada, com os quatro cenários de sync passando
- [x] `npm run lint`, `npm run typecheck` e `npm test` passam da raiz

**Parar e perguntar se:** a próxima fase depende de decisão de produto (F2 abre com #26, fuso ao
viajar) ou de verificação no aparelho real (#14, #25). → **Parado aqui.**

### Checklist
- [x] #1 monorepo, lint, typecheck, test
- [x] #2 Postgres + Drizzle + migrações
- [x] #3 RLS
- [x] #4 API, middleware de token, /me, /health
- [x] #5 camada de repositório
- [x] #6 script de criação de conta
- [x] #7 app Expo, dev build, quatro abas (código; build no aparelho pendente)
- [x] #8 core via Metro (bundles Android/iOS exportam; aparelho pendente)
- [x] #9 datas com fuso — tela de diagnóstico (resultado no aparelho pendente)
- [x] #10 SQLite local + cache do /me (código; modo avião no aparelho pendente)
- [x] #11 docs/deploy.md + units + cloudflared (execução no servidor pendente)
- [x] #12 backup pg_dump (testado localmente: retenção 9→7, falha alta)
- [x] #13 restauração documentada com comandos testados localmente (servidor real pendente)
- [x] #15 items no Postgres com CHECKs
- [x] #16 UUIDv7
- [x] #17 items no SQLite
- [x] #18 CRUD local
- [x] #19 tela provisória
- [x] #20 /sync/push
- [x] #21 /sync/pull
- [x] #22 motor de sync no app
- [x] #23 purga de tombstones
- [x] #24 testes de integração dos 4 cenários
- [x] revisar o próprio diff

### Decisões tomadas
- Ferramentas da F0 — ver docs/adr/0002-ferramentas-e-convencoes-da-fundacao.md
- Protocolo de sync (janela 60 s, cursor, LWW, purga, aparelho parado) — ver docs/sincronizacao.md
- F2 cria só `event` (compromisso puro), porque `task` exige `effort` e a UI de esforço é da F6
  (contradição apontada na #15; sugestão do próprio roadmap)
- Token por aparelho em `api_tokens` (hash), no lugar de `AUTH_TOKEN` em variável de ambiente

### Pendências para o usuário
- #14 e #25: executar no aparelho real, túnel e servidor doméstico
- #26 (fuso ao viajar) bloqueia a F2

### Não confirmado
- `Intl` com `timeZone` no Hermes do aparelho real — só no Node; a tela de diagnóstico confere
- zod v4 no Hermes — o bundle compila, execução não verificada em aparelho
- build nativo (`expo run:android/ios`) — sem Android SDK/Xcode neste ambiente; só `expo export`
