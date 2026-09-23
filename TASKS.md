# TASKS.md

Checklist persistente para tarefas longas. O Claude atualiza este arquivo durante o trabalho:
o histórico da conversa é resumido com o tempo, este arquivo não.

Ao iniciar uma tarefa longa, substitua o conteúdo abaixo. Ao concluí-la, limpe o arquivo ou
mova o registro para o PR/commit correspondente.

---

## Tarefa atual

**Objetivo:** seguir o roadmap além da F1 (autorizado pelo usuário em 2026-09-23), com fuso fixo
de São Paulo (ADR-0003). Commits quando fizer sentido.

**Parar e perguntar se:** decisão de produto ou contradição com especificação/roadmap/ADR.
→ **Parado no fim da F8**: a F9 é calibração com semanas de uso real, e a F10 é pós-v1.

### Checklist
- [x] F0, F1 (ADR-0002, docs/sincronizacao.md)
- [x] F2 — calendário (ADR-0003, fuso fixo de São Paulo)
- [x] F3 — recorrência (ADR-0004)
- [x] F4 — notificações e ICS (docs/notificacoes.md)
- [x] F5 — grade acadêmica (ADR-0005)
- [x] F6 — gamificação (ADR-0006)
- [x] F7 — economia (ADR-0007)
- [x] F8 — perfil, foto, configurações, lixeira, histórico, estados
- [ ] revisão do diff F2–F8 em três fatias (core, API, app) — em andamento

### Decisões do usuário
- #26 fuso: sempre São Paulo → ADR-0003
- #55 semestre: híbrido (um corrente, datas limitam) → ADR-0005
- #64 congelamento: gravação preguiçosa → ADR-0006
- #65 estorno: saldo pode ficar negativo → ADR-0006

### Pendências para o usuário
- Critérios de saída no aparelho/servidor real: #14, #25, #36, #46, #54, #63, #76, #82, #89
- #66: escrever a régua de esforço com exemplos da própria vida (hoje é provisória, genérica)
- F9 (#90–#93): só depois de 3–4 semanas de uso com a gamificação ligada

### Não confirmado
- Nenhuma tela foi vista rodando: sem emulador/aparelho neste ambiente; só typecheck,
  `expo export` (bundle Hermes) e `expo config --type prebuild`
- `Intl` com `timeZone` e zod v4 no Hermes do aparelho real
- Notificações, tarefa de background, seletor de data/foto: nada disparou de verdade
- Se o alarme exato foi negado no Android: o app não consegue saber (expo-notifications não expõe)
