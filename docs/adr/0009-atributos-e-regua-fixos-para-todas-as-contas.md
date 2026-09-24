# ADR-0009: Atributos e régua de esforço fixos para todas as contas

- **Data:** 2026-09-23
- **Status:** aceito
- **Envolvidos:** Diogo (autor), Claude Code (registro)

## Contexto

A §10 da [especificação](../especificacao-tecnica-v1.md) e a F10 do [roadmap](../roadmap.md)
deixaram duas questões para quando os amigos entrassem: os cinco atributos (Corpo, Mente, Ofício,
Casa, Social) foram escolhidos para a vida de uma pessoa específica, e a régua de esforço ancora
em exemplos pessoais. Cada um poderia virar configuração por conta.

## Decisões

**1. Atributos fixos.** Todas as contas usam os mesmos cinco. Continuam sendo uma constante do core
(`ATRIBUTOS`), um CHECK no banco e uma enumeração no SQLite local.

**2. Régua fixa.** A régua de esforço (tela "Régua de esforço") é a mesma para todas as contas.
Nenhum passo novo de onboarding.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Atributos configuráveis por conta | Mexe no ledger, no radar, no core, no sync e nos CHECKs; o nome do atributo passaria a ser dado, não código |
| Régua por conta, obrigatória no cadastro | Onboarding pesado para amigos que só querem um calendário |
| Régua por conta, opcional | Tela e sincronização novas para um ganho que a F9 ainda não mediu |

## Consequências

- Nada muda no código. A F10 fica com autenticação e cadastro
  ([ADR-0008](0008-senha-propria-convite-e-sessao-por-aparelho.md)).
- Um amigo cujo dia não cabe nos cinco atributos pode deixar o item sem esforço — é compromisso
  puro (§4 da especificação) e não pontua.
- A calibração da F9 (curva de nível, exemplos da régua) vale para todas as contas. Reescrever a
  régua com a vida do autor muda o texto que os amigos também leem; se isso incomodar, a régua por
  conta volta à mesa.
