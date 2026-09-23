# ADR-0006: Congelamento do esforço, conclusão idempotente e estorno de moeda

- **Data:** 2026-09-23
- **Status:** aceito
- **Envolvidos:** Diogo (autor, decisões das issues #64 e #65), Claude Code (desenho da conclusão
  e implementação)

## Contexto

A F6 do [roadmap](../roadmap.md) põe a gamificação em operação e tinha duas decisões marcadas
como do autor, mais uma de desenho que o roadmap aponta como armadilha:

1. **Como o congelamento do esforço é gravado** (#64). Derivar o travamento só da data é errado:
   adiar um item de hoje para a semana que vem o destravaria.
2. **Estorno de moeda com saldo já gasto** (#65), questão aberta da §10 da
   [especificação](../especificacao-tecnica-v1.md).
3. **Conclusão idempotente** (#71). Com sync e retry, a mesma conclusão chega mais de uma vez; e
   com dois aparelhos, duas conclusões do mesmo item podem chegar. Sem cuidado, o ledger credita
   em dobro e corrompe sem alarme.

## Decisões

### 1. Congelamento: gravação preguiçosa (escolha do autor)

- `effortLockedAt` é **gravado**, e é o campo gravado — não a data — que trava.
- O app grava na abertura e na virada do dia (`congelarEsforcosDoDia`), offline; o campo
  sincroniza como qualquer outro. Item criado ou movido para hoje já nasce congelado.
- O servidor também grava, ao receber o item num push em que o dia já chegou.
- "Dia corrente" é o dia civil de **São Paulo** (ADR-0003).
- O congelamento trava o **esforço e a distribuição entre atributos** (principal e secundário):
  mudar o secundário depois de começar redistribuiria o XP.
- A UI mostra o valor congelado e explica; a API recusa com 409 no `PATCH /items/:id`. No push do
  sync, se a linha do servidor já está congelada, esforço e atributos ficam os do servidor e o
  congelamento nunca é desfeito — sem derrubar o push inteiro.
- **Adiar não destrava**: `effortLockedAt` continua preenchido.
- **Série**: o esforço é da série e congela quando a primeira ocorrência chega. Mudar o esforço
  das próximas é "esta e as futuras", que cria uma série nova (ADR-0004) — futura, então livre.

### 2. Estorno com saldo gasto: o saldo pode ficar negativo (escolha do autor)

Desfazer uma conclusão sempre estorna XP e moeda, com lançamentos opostos exatos do que foi
creditado. Se a moeda já foi gasta, o saldo fica negativo e nenhum resgate é possível até voltar a
zero (F7). É correção de registro, não punição (§4.3, §4.7): o histórico fica honesto e nada é
bloqueado.

### 3. Conclusão como evento append-only; ledger gerado no servidor

- Concluir e desfazer gravam um **evento** em `completions`: `{ id, itemId, occurrenceDate,
  action, at }`. O `id` é gerado no aparelho no toque e é a **chave de idempotência** (também
  aceito no header `Idempotency-Key` das rotas `POST /items/:id/complete|uncomplete`).
- O servidor processa cada evento **novo** com a máquina de estados do core
  (`efeitoDaConclusao`): concluir o que já tem XP líquido é no-op; desfazer o que não tem é no-op;
  estorno devolve os opostos exatos do creditado (não recalcula pelo esforço de hoje). Evento
  repetido (retry) é ignorado pelo `id`. Uma trava por conta (`pg_advisory_xact_lock`) serializa
  requisições simultâneas — dois eventos diferentes para o mesmo alvo não creditam duas vezes.
- `xp_entries` e `coin_entries` são **gerados só pelo servidor**, append-only: o papel da API tem
  apenas `SELECT` e `INSERT` nelas. O aparelho nunca envia lançamentos; recebe pelo pull.
- **O status do item é derivado do ledger** no servidor: depois de cada push, item simples ou
  ocorrência com XP líquido creditado é `done`, sem XP é `open`. Assim um aparelho desatualizado
  que edite o título (LWW da linha inteira) não "desconclui" nada.
- O app mostra o resultado na hora, offline: aplica a mesma máquina de estados sobre o ledger já
  recebido mais os eventos locais ainda não enviados. O servidor continua sendo a fonte da verdade.
- `earnedAt` = o instante do toque no aparelho, limitado ao relógio do servidor (nada no futuro).
- O ledger não tem FK para `items`: sobrevive à purga do item.

## Alternativas consideradas

- **Congelamento por tarefa diária no servidor:** mais simples, mas um aparelho offline não saberia
  do travamento até sincronizar — a UI ofereceria editar o que a API recusaria.
- **Bloquear o "desfazer" com saldo insuficiente / estornar só o XP** (#65): a primeira pune a
  correção de um registro; a segunda deixa moeda que não corresponde a nenhum esforço.
- **Ledger gerado no aparelho, com ids determinísticos:** duas fontes de lançamentos, e dois
  aparelhos concluindo offline gerariam dois conjuntos válidos.
- **Status do item só por LWW:** uma edição de título atrasada desfaria a conclusão.

## Consequências

- A especificação ganha a tabela `completions` (§5), o fluxo da §6.4 passa a ser o do evento, e as
  questões "Estorno de moeda" e o congelamento saem da §10 e do roadmap §7.
- `postponeCount` segue LWW no sync: dois aparelhos adiando o mesmo item offline contam um
  adiamento (rotas da API somam no banco, `postpone_count + 1`). Aceito: é informação, não regra
  de pontuação.
- A **régua de esforço** (`REGUA_DE_ESFORCO` em `packages/core/src/gamificacao.ts`) está com
  exemplos genéricos, provisórios: a issue #66 pede exemplos escritos pelo autor.
