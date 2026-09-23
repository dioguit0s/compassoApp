# ADR-0003: Todo horário é hora de São Paulo

- **Data:** 2026-09-23
- **Status:** aceito
- **Envolvidos:** Diogo (autor, decisão), Claude Code (registro e implementação)

## Contexto

A seção 10 da [especificação](../especificacao-tecnica-v1.md) deixava em aberto o **fuso ao
viajar**: um compromisso marcado às 14:00 em São Paulo deve aparecer às 14:00 locais ou às 14:00
de São Paulo quando o aparelho está em outro fuso? O [roadmap](../roadmap.md) (§7) exigia a resposta
até o início da F2, porque as telas da F2 são as primeiras a exibir datas. A issue #26 listou as
perguntas que a decisão precisava responder.

## Alternativas consideradas

| Opção | Comportamento | Custo |
|---|---|---|
| Hora absoluta | O evento acontece no instante gravado; em outro fuso, aparece convertido | Toda tela passa a depender do fuso do aparelho; a grade acadêmica (hora de parede) vira exceção |
| Hora de parede | O evento acontece às 14:00 onde a pessoa estiver | Um mesmo item muda de instante ao viajar; notificações precisam ser recalculadas a cada troca de fuso |
| Por item | Um dos dois como padrão, escolha no detalhe | Mais um campo na UI e duas regras em toda consulta |
| **Fuso fixo de São Paulo** | Todo horário é exibido, digitado e notificado em `America/Sao_Paulo`, independente do aparelho | Numa viagem, o calendário mostra a hora de São Paulo, não a local |

## Decisão

**Fuso fixo de São Paulo, sempre.** Escolha do autor: manter simples. O Compasso é usado por uma
pessoa que mora em São Paulo; viagem é exceção, e nela ler "14:00 (hora de São Paulo)" é
previsível, enquanto qualquer regra de conversão é uma fonte de surpresa.

Respostas às perguntas da issue #26:

- **Comportamento padrão:** hora de São Paulo. O fuso do aparelho é ignorado em toda exibição,
  entrada de dados e cálculo de dia civil (`FUSO_PADRAO` em `packages/core/src/calendario.ts`).
- **Tarefas com `dueAt`:** a mesma regra.
- **Dia inteiro:** `startAt` é a meia-noite de São Paulo do primeiro dia e `endAt` a meia-noite
  de São Paulo do dia **seguinte** ao último (fim exclusivo). O dia de um evento de dia inteiro é
  sempre o dia civil de São Paulo, então ele não muda de dia com o fuso do aparelho.
- **Campo `timezone` do item:** continua existindo e continua obrigatório; todo item novo é
  gravado com `America/Sao_Paulo`. Ele guarda o fuso em que o horário foi pensado, e é o que
  permite mudar esta regra no futuro sem migração nem perda de informação.
- **Notificações (F4):** o instante de disparo é calculado a partir da hora de São Paulo. Em
  outro fuso, o lembrete de um compromisso às 14:00 de São Paulo dispara às 14:00 de São Paulo —
  que o relógio local mostra como outra hora.
- **Grade acadêmica (F5):** `HH:mm` de `classSlots` é hora de parede de São Paulo.

## Consequências

- O app nunca usa `Intl.DateTimeFormat().resolvedOptions().timeZone` para calcular datas; a UI
  sempre formata com o fuso fixo. A tela de diagnóstico da F0 continua conferindo que o `Intl` do
  Hermes sabe formatar nesse fuso.
- A questão "Fuso ao viajar" sai da seção 10 da especificação e a linha correspondente do roadmap
  (§7) passa a "resolvida".
- Reverter é barato enquanto `timezone` for gravado em todo item: a mudança fica nas funções de
  `calendario.ts`, não nos dados.
