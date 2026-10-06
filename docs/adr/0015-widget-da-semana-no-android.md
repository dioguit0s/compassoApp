# ADR-0015: Widget da semana na tela inicial do Android

- **Data:** 2026-10-06
- **Status:** aceito
- **Envolvidos:** Diogo (autor), Claude Code (implementação)
- **Altera:** especificação §3 (o widget saía em "Fora", como feature desejada)

## Contexto

O Compasso substituiu o calendário antigo, e o que mais faz falta dele é olhar a semana sem abrir
app nenhum. A especificação deixava o "Widget de home screen" fora da v1 como feature desejada, não
descartada. Com todas as fases concluídas e o app em uso, o autor decidiu trazê-lo.

O app só é distribuído como APK pelo próprio servidor ([ADR-0013](0013-atualizacoes-do-app-pelo-proprio-servidor.md));
não existe build nem distribuição iOS. Não há pastas `android/` versionadas: toda mudança nativa
vive em config plugin (`plugins/apk-release.js`).

O que o widget mostra (decisão do autor): a **semana corrente, de domingo a sábado, em 7 colunas**,
com **eventos, tarefas e aulas** — o mesmo conteúdo da visão de semana do Calendário — no visual do
códice (`tema.ts`).

## Alternativas consideradas

1. **`react-native-android-widget`** (escolhida). O widget é JSX (`FlexWidget`, `TextWidget`)
   desenhado por uma tarefa headless em JS e convertido em `RemoteViews`. Tem config plugin para o
   Expo (receiver, XML do provider, prévia e fontes próprias) e lê o SQLite pelo mesmo
   `RepositorioLocal` e a mesma `projetarAgenda` do app — nenhuma regra em duas versões.
2. **Widget em Kotlin (Glance ou `RemoteViews`) via config plugin próprio.** Sem dependência nova,
   mas a projeção da agenda (recorrência, desvios, aulas, fuso de São Paulo) teria de ser
   reescrita em Kotlin ou exportada pronta pelo JS para um arquivo. É exatamente a regra em duas
   versões que a especificação proíbe (§6.3).
3. **iOS (WidgetKit).** Exige extensão em Swift, App Group para compartilhar o banco e um build iOS
   que o projeto não tem. Fica fora.

## Decisão

- Widget `SemanaCompasso` (4×2 células, mínimo 250×110 dp, redimensionável), só Android.
- A montagem da semana é pura e testada no core (`resumirSemana`, `packages/core/src/semana.ts`):
  domingo a sábado, faixa (dia inteiro, vários dias, tarefa) antes dos horários, aulas
  intercaladas pelo horário, aula cancelada fora, corte em N itens com contador de excedentes —
  N calculado pela altura atual do widget.
- Mesma linguagem visual do app: compromisso em contorno, pontuável preenchido, não cumprido
  tracejado e cinza (concluído fica esmaecido, sem o riscado do app: o `TextWidget` não risca
  texto); barra à esquerda na cor do atributo ou da disciplina; hoje em destaque;
  Cinzel nos títulos e Archivo nos itens.
- Tocar em qualquer parte abre o app na aba Calendário (`compasso://calendario`).
- Atualização: ao abrir o app, depois de qualquer escrita em `items`, `item_occurrences` ou nas
  tabelas da grade (o mesmo listener que reagenda as notificações), depois do sync em background,
  e a cada 30 min pelo próprio Android (`updatePeriodMillis`, o mínimo permitido) — o que cobre a
  virada do dia e da semana.
- Se o banco não puder ser lido (app atualizado e ainda não aberto para migrar), o widget pede para
  abrir o Compasso em vez de mostrar uma semana vazia.

## Consequências

- **Não roda no Expo Go.** A biblioteca exige o módulo nativo já no import, então ela só é
  carregada sob demanda (`src/widget/index.ts`) fora do Expo Go; lá o resto do app funciona e o
  widget fica desligado. Testar o widget exige development build ou APK.
- **Exige APK novo** (0.4.0, versionCode 4): é módulo nativo, então o fingerprint muda e a
  atualização não chega por OTA. Quem não instalar o APK continua sem o widget.
- A virada da meia-noite pode aparecer com até 30 min de atraso se o app não for aberto — o limite
  do `updatePeriodMillis`. Um alarme exato só para isso não compensa.
- Títulos ficam curtos: numa coluna de 1/7 da largura cabem poucas letras. É o preço da semana
  inteira de relance, escolhido em vez de uma lista por dia.
- Dependência nova de terceiros no caminho nativo; se ela parar de acompanhar o Expo, a saída é a
  alternativa 2 reaproveitando `resumirSemana` como contrato.
