# TASKS.md

Checklist persistente para tarefas longas. O Claude atualiza este arquivo durante o trabalho:
o histórico da conversa é resumido com o tempo, este arquivo não.

Ao iniciar uma tarefa longa, substitua o conteúdo abaixo. Ao concluí-la, limpe o arquivo ou
mova o registro para o PR/commit correspondente.

---

## Tarefa atual

**Objetivo:** seguir o roadmap além da F1 (autorizado pelo usuário em 2026-09-23), com fuso fixo
de São Paulo (ADR-0003). Commits quando fizer sentido.

**Parar e perguntar se:** decisão de produto (#55 fim de semestre na F5; #64 congelamento e #65
estorno na F6) ou contradição com especificação/roadmap/ADR.

### Checklist
- [x] F0 e F1 (ver commits até 53f6b11)
- [x] #26 decisão de fuso → ADR-0003
- [x] #27 consulta por intervalo + funções de calendário no core
- [x] #28 semana, #29 mês, #30 alternância, #31 Hoje, #32 captura, #33 detalhe, #34 dia inteiro,
      #35 distinção visual (código; aparelho pendente)
- [ ] F3 #37–#45 recorrência
- [ ] F4 #47–#53 notificações e ICS
- [ ] revisar o próprio diff

### Decisões tomadas
- F0/F1: ADR-0002 e docs/sincronizacao.md
- Semana começa no domingo (calendário brasileiro e `classSlots.weekday`)
- Dia inteiro: `startAt` = 00:00 SP do primeiro dia, `endAt` = 00:00 SP do dia seguinte ao último
- Mês: evento de vários dias repetido em cada dia (não faixa contínua)
- Última visão do calendário guardada em `metadados` com prefixo `ui.` (não sincroniza)
- Tela provisória da F1 removida; Perfil mostra a última sincronização

### Pendências para o usuário
- #14, #25, #36: critérios de saída no aparelho real (captura < 3 s cronometrada)

### Não confirmado
- Telas não foram vistas rodando: sem emulador neste ambiente; só typecheck e `expo export`
- `Intl` com `timeZone` e zod v4 no Hermes do aparelho
