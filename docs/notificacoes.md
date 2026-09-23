# Notificações e importação — como a F4 implementou a §6.2 e a §6.5

## Lembretes locais

| Peça | Onde |
|---|---|
| Seleção pela janela deslizante (pura, testada) | `packages/core/src/notificacoes.ts` |
| Agendador, permissões, canal, tarefa de background | `apps/mobile/src/notificacoes.ts` |
| Lista de pendentes (diagnóstico) | Perfil → Ver lembretes agendados |

**Orçamento: 60 de 64.** O iOS guarda no máximo 64 notificações pendentes por app; o Compasso usa
60 e deixa folga. A agenda é projetada 45 dias à frente, os disparos (início − lembrete) já no
passado, concluídos e cancelados saem, e ficam os 60 mais próximos.

**Identificador estável** `compasso:<itemId>@<ocorrência|unico>@<instante-ms>`. Mudar o horário de
um item muda o identificador: o reagendamento cancela o antigo e agenda o novo. O que não mudou é
reconhecido e não é refeito. Identificadores que não começam com `compasso:` nunca são tocados.

**Quando reagenda:** na abertura do app; 1,5 s depois de qualquer escrita em `items` ou
`item_occurrences` no SQLite (edição local, conclusão, ou dado vindo do sync — pelo
`addDatabaseChangeListener` do expo-sqlite); e na tarefa periódica de background
(`expo-background-task`, intervalo mínimo pedido de 60 min — quem decide o momento é o sistema),
que também sincroniza.

**Fuso:** o instante de disparo sai da hora de São Paulo (ADR-0003).

**Permissões:**
- A permissão de notificação é pedida quando a pessoa escolhe um lembrete no detalhe do item ou
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

**Tocar no lembrete** abre o detalhe do item (ou da ocorrência).

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
