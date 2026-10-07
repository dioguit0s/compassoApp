# ADR-0017: Aulas quinzenais e período em quadrimestre

- **Data:** 2026-10-07
- **Status:** aceito
- **Envolvidos:** Diogo (autor, decisões), Claude Code (registro e implementação)

## Contexto

A grade da F5 ([ADR-0005](0005-semestre-corrente-e-grade.md)) supõe que todo horário acontece
**toda semana** no seu dia: a projeção (`aulasDoDia`) só compara o dia da semana. Em cursos
quadrimestrais (o modelo da UFABC), parte das disciplinas é **quinzenal**: a turma "quinzenal 1"
tem aula numa semana, a "quinzenal 2" na seguinte, alternando ao longo do quadrimestre. Sem
suporte, quem cursa uma disciplina assim vê aula fantasma em metade das semanas ou cancela uma
por uma.

O período letivo também só se chamava "semestre", embora a tabela já guarde início e fim livres.

## Alternativas consideradas

| Opção | Como funciona | Problema |
|---|---|---|
| RRULE no horário (`FREQ=WEEKLY;INTERVAL=2`) | Reaproveita o motor de recorrência dos itens | Traz DTSTART, COUNT/UNTIL e a expansão inteira para um dado que só precisa de "qual semana" |
| Âncora pela data da primeira aula | Cada horário guarda o dia em que começa a alternância | Não é como a universidade fala ("quinzenal 1 / 2"); exige escolher uma data por horário |
| Booleano `quinzenal` + paridade | Duas colunas booleanas | Exige outra migração no dia em que aparecer "a cada 3 semanas" |
| **`weekInterval` + `weekOffset`, contados do início do período** | `semana % weekInterval == weekOffset` | — |

## Decisão

- **`classSlots` ganha `weekInterval` (1 a 4, padrão 1) e `weekOffset` (0 a `weekInterval − 1`,
  padrão 0).** Semanal é `1/0`; quinzenal 1 é `2/0`; quinzenal 2 é `2/1`. A tela oferece só
  semanal, quinzenal 1 e quinzenal 2; o modelo aceita até "a cada 4 semanas" sem migração.
- **As semanas contam do início do período.** A semana 0 é a semana (domingo a sábado, a mesma do
  calendário do app) que contém o `startDate` do semestre/quadrimestre; a quinzenal 1 cai nela,
  mesmo que o período comece no meio da semana. Corrigir a data de início do período pode inverter
  as quinzenais — é o esperado, porque é a semana de início que as define.
- **Aula extra continua valendo em qualquer semana**, inclusive na semana de folga da quinzenal.
- **`semesters` ganha `kind`: `semester` | `quadrimester` (padrão `semester`).** O tipo só muda
  rótulos ("Quadrimestre 2026.3") e as sugestões de nome e fim na criação; as regras do ADR-0005
  (um período corrente, datas limitando a projeção) valem igual. A tabela e o código continuam
  chamando o período de semestre.
- `CHECK`s no PostgreSQL para os três campos; o esquema zod do core tem os mesmos limites e
  **defaults**, para que o push de uma versão antiga do app (sem os campos) continue válido.

## Consequências

- A projeção continua numa função só (`aulasDoDia`), então a aba Hoje, a semana, o widget, o
  `GET /agenda` e a API v1 da Luna alternam as quinzenais sem mudança própria. A API v1 não ganha
  campo: ela já entrega as aulas projetadas.
- **Atualização obrigatória.** Uma versão antiga do app, ao reenviar um período ou horário (tornar
  um período corrente, excluir uma disciplina), mandaria a linha sem os campos novos, e o default
  do esquema regravaria `semester` e "semanal" no servidor. Ela também mostraria as quinzenais
  toda semana. O commit leva `Atualizacao-obrigatoria: sim`.
- Ainda não há edição de horário na tela (só criar e excluir, como antes): trocar a quinzena é
  excluir e criar de novo. A rota `PATCH /slots/:id` aceita os campos.
- A questão aberta "Recorrência da grade acadêmica versus RRULE" (especificação §10) fica
  respondida para este caso: a grade cresce por colunas simples enquanto o que se precisa é "qual
  semana".
