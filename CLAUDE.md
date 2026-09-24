# CLAUDE.md

Instruções para o Claude Code neste repositório. Lidas no início de toda sessão.

## Projeto

Compasso: calendário principal + registrador de esforço num único app. **F0 a F8 e F10
implementadas** (monorepo em `apps/api`, `apps/mobile`, `packages/core`); F0–F8 validadas no
aparelho real, F9 (calibração) pendente de uso. As fontes de verdade são:

- `docs/especificacao-tecnica-v1.md` — escopo, modelo de dados, arquitetura, regras de gamificação.
- `docs/roadmap.md` — ordem de construção, fases, critérios de saída.
- `docs/adr/` — decisões isoladas e datadas (ex.: ADR-0001, PostgreSQL em vez de MongoDB).

Stack prevista: React Native / Expo com SQLite local (offline-first), API em Node.js, PostgreSQL
com Drizzle e migrações versionadas. Documentação e commits em português.

## Como trabalhar

### Profundidade de raciocínio

- Você já decide quanto pensar. Não é preciso "pensar passo a passo" — pergunta simples recebe
  resposta direta, sem preâmbulo.
- Se a tarefa pedir mais ou menos profundidade, isso se ajusta pelo nível de esforço da sessão,
  não por instruções no prompt.
- Não reproduza o raciocínio interno na resposta. Entregue a conclusão e a justificativa.

### Quando continuar

- A tarefa chega inteira numa mensagem, com a definição de "pronto". Trabalhe até atingir essa
  definição sem pedir confirmação a cada etapa.
- Se o próximo passo não precisa de mim, siga.
- Status vai na mesma mensagem da próxima ação — não pare só para reportar progresso.
- Mensagens de follow-up enviadas durante o trabalho complementam a tarefa atual; incorpore sem
  recomeçar do zero.
- Respostas anteriores já estão fechadas. Não revisite trabalho entregue a não ser que eu aponte
  um erro nele.

### Quando parar e perguntar

Pare **somente** quando:

1. Não dá para continuar sem uma decisão ou informação que só eu tenho (escopo ambíguo com
   consequências diferentes, trade-off de produto, credencial).
2. O próximo passo é destrutivo ou difícil de reverter:
   - apagar dados, arquivos ou branches;
   - `git push --force`, `git reset --hard`, reescrever histórico já publicado;
   - qualquer ação fora deste repositório (outros diretórios, serviços externos, publicação).
3. A tarefa contradiz a especificação, o roadmap ou um ADR — aponte a contradição em vez de
   escolher um lado em silêncio.

Nesses casos, pergunte uma coisa objetiva, com o contexto necessário para eu responder sem
rolar a conversa para cima. O prompt de permissão para comandos perigosos continua ligado — não
tente contorná-lo.

### Tarefas longas

- Em trabalho com várias etapas, mantenha o checklist em `TASKS.md` (modelo na raiz). O contexto
  da conversa é resumido com o tempo; o arquivo não. Atualize ao concluir cada item.
- Auditorias, migrações grandes ou revisões de muitos arquivos: divida em subagentes com fatias
  independentes. Antes de aceitar o resultado de cada um, confira a evidência que ele apresentou
  (arquivo e linha, saída de comando). Resultado sem evidência não conta como feito.

### Ao terminar

Estruture o resumo final nesta ordem:

1. **Preciso de você** — decisões pendentes, bloqueios, riscos. Se não houver, diga "nada".
2. **O que foi feito** — mudanças e onde estão.
3. **Verificação** — o que foi testado/checado e o resultado real (inclusive falhas).

Antes de eu revisar, revise o próprio diff procurando bugs, inconsistências e divergências da
especificação (`/revisar-diff`). Reporte só achados reais — evite alarme falso.

### Pesquisa e documentação

- Marque explicitamente o que **não conseguiu confirmar** e liste onde procurou.
- Em documentos longos (especificação, roadmap, ADRs), procure contradições de números, datas,
  nomes e termos entre seções e entre arquivos.
- Se o pedido é um arquivo (planilha, documento, diagrama), entregue o arquivo pronto, não um
  esboço dele.

## Convenções

- Novo ADR: `docs/adr/NNNN-titulo-em-kebab-case.md`, numeração sequencial, com contexto,
  alternativas consideradas e consequências.
- Mudança de escopo ou arquitetura atualiza a especificação **e** o roadmap no mesmo commit.
- Commits no formato `tipo: descrição` (`docs:`, `feat:`, `fix:`, `chore:`), em português.
