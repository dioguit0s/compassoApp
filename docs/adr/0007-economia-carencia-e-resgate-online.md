# ADR-0007: Economia — carência de preço e resgate online

- **Data:** 2026-09-23
- **Status:** aceito
- **Envolvidos:** Diogo (autor), Claude Code (implementação)

## Contexto

A F7 do [roadmap](../roadmap.md) implementa a economia da §4.6 da
[especificação](../especificacao-tecnica-v1.md): moeda ganha na conclusão, recompensas com carência
de preço até a segunda-feira seguinte, cooldown por recompensa e histórico de resgates. As issues
#78 e #79 deixaram três pontos para decidir e registrar.

## Decisões

**1. "Segunda-feira seguinte" nunca é hoje.** Criar ou alterar numa segunda vale na segunda da
semana seguinte (+7 dias); num domingo, vale amanhã. "Seguinte" é a próxima, não a atual — e a
carência mínima é de um dia, nunca zero.

**2. Aumentar o preço também espera.** A regra diz "alterar o preço"; subir e descer seguem a
mesma carência. Duas alterações na mesma semana: vale a última, na mesma segunda. Um preço
pendente que já venceu é promovido a vigente antes de uma nova alteração.

**3. O resgate exige rede.** Resgatar offline em dois aparelhos furaria saldo e cooldown, e a
carência dependeria do relógio do aparelho. O resgate é `POST /rewards/:id/redeem`: o servidor
valida recompensa ativa, preço vigente pelo relógio **dele** (em São Paulo), cooldown e saldo, e
grava resgate e lançamento negativo de moeda numa transação, com trava por conta. É idempotente
pelo header `Idempotency-Key`. É a segunda operação online-only do app (a outra é a importação de
ICS).

**4. O sync não antecipa carência.** Recompensas sincronizam por last-write-wins como as outras
tabelas, mas o servidor normaliza os preços antes de gravar: recompensa nova não vale antes da
próxima segunda do relógio dele; o preço vigente só muda por promoção de um pendente vencido;
qualquer outra mudança de preço vira pendente para a próxima segunda. A mesma função
(`normalizarPrecos`) está no core. O objetivo não é tornar a trapaça impossível (§2), é que ela
não aconteça num impulso.

**5. O histórico sobrevive à recompensa.** `redemptions` é append-only (a API só tem `SELECT` e
`INSERT`), sem FK para `rewards`, e guarda `reward_name` além de `price_paid`: o histórico continua
legível depois que uma recompensa arquivada é excluída e purgada.

**6. Estados do resgate, nesta ordem:** arquivada → em carência → em cooldown (independente de
saldo) → sem saldo → disponível (`estadoDaRecompensa` no core). Saldo negativo (ADR-0006) nunca
resgata.

## Consequências

- `redemptions` ganha `rewardName`, além dos campos da §5 da especificação (atualizada).
- A moeda da conclusão já era gerada na transação do evento de conclusão desde a F6 (ADR-0006);
  a F7 acrescenta o débito do resgate e as telas.
