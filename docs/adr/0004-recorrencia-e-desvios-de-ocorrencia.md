# ADR-0004: Recorrência e desvios de ocorrência

- **Data:** 2026-09-23
- **Status:** aceito
- **Envolvidos:** Diogo (autor), Claude Code (implementação)

## Contexto

A F3 do [roadmap](../roadmap.md) implementa as séries recorrentes da
[especificação](../especificacao-tecnica-v1.md) §5.1 e a tabela `itemOccurrences`. As issues #37 a
#44 deixaram decisões em aberto: aceitar ou não `WKST`, como dois aparelhos que desviem a mesma
ocorrência offline convergem, o que `type` significa quando a mesma ocorrência é movida **e**
editada, e o que acontece com os desvios futuros quando uma série é dividida.

## Decisões

**1. `WKST` entra no subconjunto aceito.** A especificação lista `FREQ`, `INTERVAL`, `BYDAY`,
`BYMONTHDAY`, `BYMONTH`, `UNTIL`/`COUNT`. O Google Calendar exporta quase toda série semanal com
`WKST=SU`; recusá-lo mandaria essas séries para a expansão em ocorrências isoladas da importação
(F4) sem necessidade. `WKST` só muda o resultado em `FREQ=WEEKLY` com `INTERVAL > 1` e está
implementado. Padrão da RFC: segunda-feira. A §5.1 da especificação foi atualizada.

**2. `BYDAY` em `FREQ=YEARLY` exige `BYMONTH`.** "20ª segunda do ano" é RFC válida, mas fora do que
a v1 precisa; "4ª quinta de novembro" (com `BYMONTH`) está coberto.

**3. Identidade da ocorrência é `(itemId, occurrenceDate)`, não o `id`.** Dois aparelhos que criem
offline o desvio da mesma data geram `id`s diferentes e colidiriam no índice único. O push faz
last-write-wins por `(item_id, occurrence_date)`: a linha do servidor mantém o `id` que chegou
primeiro, e o aparelho que perdeu troca o seu pelo do servidor no pull. `occurrenceDate` é a data
**original** da ocorrência segundo a regra, mesmo quando ela é movida.

**4. Os campos do desvio se somam; `type` registra o último desvio aplicado.** Movida e editada ao
mesmo tempo é comum ("treino na quarta, e mais leve"). A projeção lê os campos, não o `type`:
`startAt`/`endAt` preenchidos = movida; `titleOverride`/`notesOverride` = editada;
`status = done` = concluída; `type = cancelled` esconde a ocorrência e ignora o resto.

**5. Dividir a série ("esta e as futuras") move os desvios futuros para a série nova.** A série
original termina em `UNTIL` = início da última ocorrência antes da data escolhida (um `COUNT` vira
`UNTIL`); a nova começa na data escolhida com as mudanças e recebe o que restava do `COUNT`. Os
desvios da data escolhida em diante saem da série antiga (tombstone) e são recriados na nova quando
a data continua sendo ocorrência dela — um feriado cancelado continua cancelado. O desvio da própria
data escolhida é descartado: as mudanças pedidas passam a ser a regra.

**6. Excluir "esta e as futuras"** encerra a série na ocorrência anterior; se a data escolhida é a
primeira ocorrência, a série inteira vai para a lixeira.

**7. `recurrenceEndsAt` é recalculado pelo servidor** em todo push (fim da última ocorrência, ou
nulo se a série não termina), em vez de confiar no valor do aparelho.

**8. A projeção considera todas as séries ativas.** `GET /agenda` e o app buscam os itens simples
do intervalo e **todas** as séries não excluídas, e a mesma função (`projetarAgenda` do core)
decide o que entra — inclusive ocorrências movidas de fora para dentro do intervalo. No volume da
especificação (dezenas de séries), expandir todas custa milissegundos. Um teste de paridade compara
`GET /agenda` com a projeção local, entrada por entrada.

## Alternativas consideradas

- **`id` determinístico (hash de `itemId` + data):** resolveria a colisão sem LWW especial, mas
  exige UUIDv5 (SHA-1) no core e esconde a regra no formato do identificador.
- **Descartar os desvios futuros ao dividir a série:** mais simples, mas perde cancelamentos
  legítimos (feriado) sem avisar — o tipo de surpresa que faz alguém voltar para o calendário antigo.
- **Um `type` exclusivo por linha:** obrigaria escolher entre "movida" e "editada".

## Consequências

- O protocolo de sync passa a transportar duas tabelas por requisição
  (`{ itens, ocorrencias }` no push e no pull). Itens vão antes dos desvios, que dependem deles.
- Desvio de item que não existe no servidor é ignorado no push, não derruba a requisição.
- Purgar um item purga os desvios dele (`ON DELETE CASCADE` na FK composta `(user_id, item_id)`).
