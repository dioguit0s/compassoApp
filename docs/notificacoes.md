# Notificações e importação — como a F4 implementou a §6.2 e a §6.5

## Lembretes locais

| Peça | Onde |
|---|---|
| Seleção pela janela deslizante (pura, testada) | `packages/core/src/notificacoes.ts` |
| Agendador, permissões, canal, tarefa de background | `apps/mobile/src/notificacoes.ts` |
| Lembrete de aula e resumo da manhã (preferências do aparelho) | `apps/mobile/src/preferenciasDeNotificacao.ts`, Configurações |
| Lista de pendentes e o que ficou de fora (diagnóstico) | Configurações → Lembretes agendados |

**Orçamento: 60 de 64.** O iOS guarda no máximo 64 notificações pendentes por app; o Compasso usa
60 e deixa folga. A agenda é projetada 45 dias à frente, os disparos (início − lembrete) já no
passado, concluídos e cancelados saem, e ficam os 60 mais próximos.

**Vários lembretes por item** ([ADR-0018](adr/0018-multiplos-lembretes-por-item.md)). Cada item
tem até 5 lembretes (`remindersMinutesBefore`), editados no detalhe; a captura rápida cria com um
só, o padrão da conta. Cada lembrete vira um disparo e todos disputam o mesmo orçamento, sem cota
por item: uma série diária com dois lembretes gasta os 60 em 30 dias, e o resto entra conforme a
janela anda. Numa série os lembretes são da série; a ocorrência movida leva os dela junto.

**Texto.** O título é o do item e o corpo é o horário ("14:00–15:00"). Quando o lembrete dispara
em outro dia que não o do compromisso — o de véspera — o corpo diz também o dia
("qua 14/10 · 14:00–15:00"). Se o item tem observações, a primeira linha delas vai na linha de
baixo ("levar exames"). Na tela bloqueada nada disso aparece: o canal esconde o conteúdo.

**Três origens, um orçamento.** Além dos lembretes de item, entram no mesmo orçamento de 60:

- **Lembrete de aula.** A grade não é item (ADR-0005), então aula não tem lembrete próprio: vale
  uma regra só, "X minutos antes de cada aula", ligada em Configurações e silenciável por
  disciplina. O corpo traz horário e sala ("19:00–20:40 · sala B-204"); com exceção de troca de
  sala, ela vem na frente ("Sala trocada: C-301 · 19:00–20:40"). Aula cancelada não avisa;
  reposição avisa e diz que é reposição. Tocar abre a aula daquele dia.
- **Resumo da manhã.** Uma notificação por dia, num horário escolhido em Configurações:
  "Hoje — 3 aulas, 2 compromissos, 1 tarefa · esforço 8 · 5 h ocupadas" (a carga é a mesma da aba
  Hoje, `cargaDoDia`). Só o **próximo** resumo fica agendado — uma vaga fixa do orçamento, não uma
  por dia; o de amanhã entra no reagendamento seguinte. Dia sem nada marcado não gera resumo.

Itens e aulas disputam as vagas por proximidade, sem cota para nenhum dos dois; o resumo tem a
vaga dele garantida (`aplicarOrcamento`). As duas preferências são do aparelho, não sincronizam
e nascem desligadas.

**Quando o orçamento enche.** Configurações → Lembretes agendados mostra quantos disparos ficaram
de fora e qual é o primeiro deles (título e horário). Não é erro: eles entram sozinhos conforme os
mais próximos disparam e o app reagenda.

**Concluir pelo lembrete.** A notificação de item pontuável (tarefa ou evento com esforço) tem o
botão "Concluir" (categoria `compasso-concluivel` do `expo-notifications`). Ele não abre o app:
chama o mesmo `repositorio.concluir` da lista, que grava o evento de conclusão no SQLite — offline
e com o app fechado — e o envia no próximo sync
([ADR-0006](adr/0006-congelamento-conclusao-idempotente-e-estorno.md)). É idempotente: a resposta
pode chegar pelo listener (app vivo) e pela tarefa de background (`compasso-acao-da-notificacao`,
registrada no `index.ts`), e a segunda não credita nada. Numa série, conclui a ocorrência do
lembrete. Compromisso sem esforço, aula e resumo não têm o botão. Na tela bloqueada o botão não
aparece, porque o conteúdo fica escondido.

**Ícone.** O ícone pequeno da notificação é a rosa dos ventos do app
(`assets/notification-icon.png`, gerado por `scripts/icones.mjs`), tingido de ouro. É recurso
nativo: muda com APK novo, não por OTA.

**Identificador estável** `compasso:<itemId>@<ocorrência|unico>@<instante-ms>@<minutos>@<resumo>`
(`minutos` é o lembrete que gerou o disparo; `resumo`, um hash curto do texto). No lembrete de
aula o começo é `compasso:aula.<slotId>@<dia>`; no resumo da manhã, `compasso:resumo@<dia>`. Mudar o horário, o
lembrete ou o título de um item muda o identificador: o reagendamento cancela o antigo e agenda o novo. O que não mudou é
reconhecido e não é refeito. Identificadores que não começam com `compasso:` nunca são tocados.

**Quando reagenda:** na abertura do app; ao mudar uma preferência de notificação; 1,5 s depois de
qualquer escrita na agenda ou na grade no SQLite (edição local, conclusão, ou dado vindo do sync — pelo
`addDatabaseChangeListener` do expo-sqlite); e na tarefa periódica de background
(`expo-background-task`, intervalo mínimo pedido de 60 min — quem decide o momento é o sistema),
que também sincroniza.

**Fuso:** o instante de disparo sai da hora de São Paulo (ADR-0003).

**Permissões:**
- A permissão de notificação é pedida quando a pessoa adiciona um lembrete no detalhe do item ou
  toca em "Ativar lembretes" no Perfil — nunca na primeira abertura sem contexto.
- Negada: o Perfil mostra um aviso fixo de que os lembretes não vão disparar. O app não trava nem
  perde dado; só não agenda.
- Android 12+: o `expo-notifications` usa `setExactAndAllowWhileIdle` quando
  `AlarmManager.canScheduleExactAlarms()` permite, e cai para o alarme inexato quando não
  (conferido no código do módulo, `ExpoSchedulingDelegate.kt`). O app declara `USE_EXACT_ALARM`
  (concedida na instalação a apps de calendário no Android 13+; o Compasso não passa pela Play
  Store, então a política de uso da loja não se aplica) e `SCHEDULE_EXACT_ALARM` (Android 12). O
  `expo-notifications` não expõe `canScheduleExactAlarms()` ao JavaScript, então o app não sabe se
  o alarme exato foi negado. Só no Android 12 (API 31–32) isso é possível: ali o Perfil explica e
  leva à tela "Alarmes e lembretes" do sistema. Do 13 em diante a `USE_EXACT_ALARM` não se revoga
  (a chave aparece cinza e ligada — visto no emulador), e o Perfil não mostra o aviso.
- Canal Android `lembretes`, importância alta, visível na tela bloqueada sem o conteúdo.

**Tocar no lembrete** abre o detalhe do item (ou da ocorrência); no de aula, a aula; no resumo,
o app na aba Hoje.

## Importação de ICS

| Peça | Onde |
|---|---|
| Conversão .ics → plano (pura) | `apps/api/src/ics.ts` |
| Aplicação idempotente no banco | `apps/api/src/db/repositorios.ts` (`importacao.aplicar`) |
| Rota | `POST /import/ics`, multipart, campo `arquivo`, até 20 MB |
| Tela | Perfil → Importar calendário |

- Todo item importado é `event` sem esforço nem atributos.
- `VALUE=DATE` = dia inteiro (o `DTEND` do ICS já é exclusivo, como o do Compasso); `Z` = UTC;
  `TZID` = hora de parede daquele fuso, guardado em `timezone` para a série expandir certo;
  sem fuso = hora de São Paulo.
- RRULE aceita pelo validador → série; `EXDATE` → ocorrência cancelada; `RECURRENCE-ID` → desvio
  (movida/editada; `STATUS:CANCELLED` = cancelada).
- RRULE fora do subconjunto → itens avulsos de **1 ano para trás a 2 anos para frente** da data da
  importação, listados no resumo com a regra e o motivo. Cada um tem `source_uid = UID#AAAAMMDD` ou
  `UID#AAAAMMDDTHHMMSS` (hora de parede da origem), estável entre reimportações.
- **Idempotência:** `items.source_uid`, índice único por `(user_id, source_uid)`. Reimportar
  atualiza só o que mudou (e só os campos que vêm do arquivo — esforço e atributos que a pessoa
  tenha dado depois ficam); não duplica. Item excluído no Compasso não volta.
- Tudo numa transação: arquivo inválido ou erro no meio não grava nada.
- **Limite conhecido:** dividir uma série importada ("esta e as futuras") e depois reimportar o
  mesmo arquivo devolve a regra original à série antiga, e as ocorrências futuras aparecem
  duplicadas. A importação é pensada para a migração inicial, não para ser repetida depois de
  editar as séries no Compasso.
