# ADR-0005: Semestre corrente e regras da grade acadêmica

- **Data:** 2026-09-23
- **Status:** aceito
- **Envolvidos:** Diogo (autor, decisão da issue #55), Claude Code (registro e implementação)

## Contexto

A seção 10 da [especificação](../especificacao-tecnica-v1.md) deixava em aberto o **fim de
semestre**: nada marca um semestre como encerrado quando `endDate` passa, e a aba Hoje não sabia o
que mostrar num dia sem semestre ativo. O [roadmap](../roadmap.md) (§7) exigia a resposta até a F5.
A implementação da grade (issues #56 a #62) também precisou fechar alguns detalhes do modelo.

## Alternativas consideradas (issue #55)

| Opção | Comportamento |
|---|---|
| Manual | O semestre ativo projeta aulas até ser desativado, mesmo depois de `endDate` |
| Automático pelas datas | Todo semestre cujo intervalo contém o dia projeta; `active` vira só arquivamento |
| **Híbrido** | `active` define qual é o semestre corrente; as datas limitam a projeção |

## Decisão

**Híbrido** (escolha do autor):

- **Um semestre corrente por vez.** Criar um semestre novo o torna o corrente e arquiva os outros
  (`active = false`); um arquivado pode voltar a ser o corrente pela tela Semestre.
- **As datas limitam a projeção.** O semestre corrente só projeta aulas entre `startDate` e
  `endDate`. **Nas férias a faixa de aulas da aba Hoje some** — nada de aula fantasma depois do
  fim do semestre, e nenhuma ação manual para "encerrar".
- **Dois ativos ao mesmo tempo** só acontecem se dois aparelhos criarem semestres diferentes
  offline. Não há restrição no banco (um índice único derrubaria o push inteiro); vale o de início
  mais recente que contém o dia (`semestreDoDia` no core).
- **Feriado e recesso são `classExceptions` de cancelamento**, uma por aula do dia. A tela da aula
  tem o atalho "Sem aula nenhuma neste dia", que cancela todas as aulas regulares daquela data.

## Detalhes do modelo fechados na implementação

- `classExceptions` ganha `startTime`/`endTime` opcionais, **só** para `type = extra`: reposição
  costuma acontecer em outro horário. Sem eles, a reposição usa o horário regular do slot.
- `classExceptions` ganha `deletedAt`, como as outras tabelas sincronizadas: desfazer um
  cancelamento no aparelho precisa chegar aos outros, e sem tombstone a exceção ressuscitaria.
- Troca de sala exige a sala nova (`CHECK`); horário é texto `HH:mm` de `00:00` a `23:59` com
  `CHECK` de formato e fim depois do início.
- FKs compostas com `user_id` entre todas as tabelas da grade (`ON DELETE CASCADE` na purga). Em
  `items`, `(user_id, course_id) → courses` com `ON DELETE SET NULL (course_id)` (PostgreSQL 15+):
  o `SET NULL` comum anularia `user_id` também. Excluir a disciplina é tombstone (um `UPDATE`), que
  não dispara a FK — o repositório anula o `courseId` dos itens ligados, no app e na API.
- Excluir uma disciplina tira junto os horários e as exceções dela; excluir um horário tira as
  exceções dele.
- No push, disciplina de semestre inexistente, horário de disciplina inexistente e exceção de
  horário inexistente são ignorados; item com `courseId` de disciplina inexistente entra com o
  vínculo anulado.
- A semana mostra as aulas ao fundo; aula cancelada **não** aparece nela (a aba Hoje é quem mostra
  o cancelamento, riscado).

## Consequências

- "Fim de semestre" sai da seção 10 da especificação; a linha do roadmap §7 passa a resolvida.
- O protocolo de sync transporta seis tabelas; a ordem de aplicação é
  semestres → disciplinas → horários → exceções → itens → desvios.
- `GET /agenda` devolve `{ entradas, aulas }`; as aulas vêm da mesma função (`aulasDoDia`) que o
  app usa offline, e nenhuma ocorrência de aula é gravada em lugar nenhum.
