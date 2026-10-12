# ADR-0018: Múltiplos lembretes por item

- **Data:** 2026-10-12
- **Status:** aceito
- **Envolvidos:** Diogo (autor, pedido), Claude Code (decisões em aberto, registro e implementação)

## Contexto

Cada item tinha um único `reminderMinutesBefore`. Para uma prova ou uma consulta o que se quer é
"1 dia antes + 1 hora antes": o primeiro para se preparar, o segundo para sair de casa. Com um
lembrete só, a pessoa escolhe um dos dois e perde o outro — e o Compasso é o calendário primário
(§2): notificação perdida custa o compromisso.

Três restrições moldam a decisão:

- **Offline-first com LWW por linha** (§6.6). O item sincroniza inteiro; qualquer coisa que more
  fora da linha precisa do próprio protocolo de sync, tombstone e purga.
- **Versões antigas do app continuam em uso.** Elas só conhecem o campo único, tanto ao ler
  quanto ao escrever, e devolvem a linha inteira ao servidor a cada edição.
- **Orçamento de 60 notificações** (§6.2). Mais lembretes por item gastam o orçamento mais rápido.

## Alternativas consideradas

| Opção | Como funciona | Problema |
|---|---|---|
| Tabela `item_reminders` | Uma linha por lembrete, com `itemId` | Nona tabela sincronizada: push/pull, tombstone, purga e ordem de aplicação próprios, para guardar até 5 inteiros. Editar "os lembretes" deixa de ser atômico com o item |
| Manter os dois campos como fontes independentes | `reminderMinutesBefore` + um segundo campo "extra" | Duas fontes de verdade: qual é o "primeiro" depende de onde se olha, e três lembretes pedem outra migração |
| Trocar o campo único pela lista | `remindersMinutesBefore` substitui o antigo | Quebra as versões antigas do app: exige `Atualizacao-obrigatoria: sim` |
| **Lista na linha + campo antigo como espelho** | `remindersMinutesBefore: int[]` manda; `reminderMinutesBefore` espelha o primeiro | — |

## Decisão

- **`items` ganha `remindersMinutesBefore`**: até 5 valores, sem repetição, em ordem crescente —
  o lembrete mais próximo do compromisso vem primeiro. No PostgreSQL é `integer[]` com `CHECK` de
  cardinalidade; no SQLite do aparelho é texto JSON (`[10,60,1440]`). As migrações (0020 na API,
  0009 no app) copiam o valor atual de cada item para a lista.
- **`reminderMinutesBefore` continua existindo e é só um espelho do primeiro lembrete** (`null`
  com a lista vazia). Nunca é fonte: quem grava as duas colunas é uma função só,
  `resolverLembretes`, no aparelho e no servidor.
- **A lista é opcional no transporte**, e é isso que mantém as versões antigas funcionando sem
  atualização obrigatória:
  - *App antigo lê*: ignora o campo desconhecido e mostra o primeiro lembrete.
  - *App antigo escreve* (push sem a lista): o servidor compara o campo antigo com o primeiro
    lembrete já gravado. Igual → a versão antiga não mexeu no lembrete e a lista fica como está;
    diferente → vale o valor novo, sozinho (ou lista vazia, se veio `null`). Editar o título num
    aparelho desatualizado não apaga o "1 dia antes" criado no aparelho novo.
  - *App novo com servidor antigo* (pull sem a lista): o aparelho deriva a lista do campo antigo.
- **O lembrete fica na série, não na ocorrência.** O desvio "só esta" continua guardando horário,
  título e notas ([ADR-0004](0004-recorrencia-e-desvios-de-ocorrencia.md)); mudar os lembretes de
  uma ocorrência é "esta e as futuras". Uma ocorrência movida leva os lembretes junto, porque
  eles são relativos ao início.
- **Um disparo por lembrete, no mesmo orçamento.** `selecionarDisparos` gera um disparo para cada
  lembrete de cada entrada e corta nos 60 mais próximos, sem cota por item. O identificador
  passa a ser `compasso:<item>@<ocorrência>@<instante>@<minutos>@<resumo>`.
- **Captura rápida continua com um lembrete só** (o padrão da conta), para não ganhar um passo.
  A lista é editada no detalhe: atalhos de 10 min, 30 min, 1 h e 1 dia, mais um valor
  personalizado.
- **API v1 da Luna**: eventos e tarefas saem com `reminders_minutes_before` e a criação aceita a
  mesma lista (sem ela, vale o lembrete padrão da conta; `[]` cria sem lembrete). A v1 nunca expôs
  o campo único, então não há campo antigo para manter nesse contrato.

## Consequências

- Sem atualização obrigatória: aparelhos com a versão anterior seguem sincronizando.
- Um caso fica ambíguo de propósito: no aparelho antigo, trocar o lembrete único descarta os
  extras daquele item. É a leitura mais segura do que a pessoa fez — ela viu um lembrete e o
  trocou.
- Dois lembretes numa série diária gastam o orçamento em 30 dias em vez de 60. A janela
  deslizante cobre isso (o app reagenda a cada abertura e em background), e o diagnóstico em
  Configurações → Lembretes agendados mostra o que ficou de fora.
- A migração do servidor atualiza as linhas com lembrete, o que move `server_updated_at`: no
  primeiro sync depois dela os aparelhos recebem esses itens de novo. Inofensivo.
- Se um dia a ocorrência precisar de lembrete próprio, entra como `remindersOverride` em
  `itemOccurrences`, no mesmo molde de `titleOverride`.
