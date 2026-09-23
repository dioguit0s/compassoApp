# Guia de uso do Opus 5.5

Referência para quem trabalha com o Claude neste projeto. O `CLAUDE.md` na raiz configura o
comportamento do modelo; este guia cobre o lado humano: como pedir, o que ler quando a run
termina e quais comandos usar.

A ideia geral: o Opus 5.5 é mais autônomo. Pare de microgerenciar e entre só quando a decisão é
realmente sua.

## 1. Não peça para ele pensar

- O modelo já pensa antes de cada resposta e decide sozinho quanto pensar.
- "Pense com cuidado" e "passo a passo" só atrasam o início da resposta, sem ganho claro de
  qualidade. Remova essas frases dos prompts.
- Em pergunta simples, diga **"responde direto"**.
- Para mudar a profundidade no Claude Code, **mude o nível de esforço**, não o prompt.

## 2. Entregue a tarefa inteira

- Uma mensagem com o trabalho completo, não pedaço por pedaço.
- Diga o que é **"pronto"** de forma verificável (ex.: os testes passam, o client antigo foi
  removido).
- Diga **quando ele deve parar e te perguntar**.
- Lembrou de algo no meio? Mande follow-up enquanto ele trabalha. Reiniciar custa mais do que
  complementar.

Modelo de pedido:

```
Objetivo: <o que deve existir ao final>
Pronto quando: <critérios verificáveis>
Pare e me pergunte se: <situação em que a decisão é minha>
Contexto: <arquivos, ADRs, restrições>
```

## 3. Quando ele continua e quando para

Já configurado no `CLAUDE.md`:

- Passo que não precisa de você: ele segue.
- Status vem na mesma mensagem da próxima ação.
- Para só quando não dá para continuar sem você, ou antes de algo destrutivo: apagar dado,
  force-push, mexer fora do repositório.
- **Mantenha o prompt de permissão ligado** para comandos perigosos.

## 4. Runs longas

- **Checklist em arquivo**: peça para usar o `TASKS.md`. O contexto resume o histórico antigo; o
  arquivo não some.
- **Auditoria ou migração grande**: use `/auditoria <tarefa>` — fatia em subagentes e confere a
  evidência de cada um antes de aceitar.

## 5. Quando a run acaba

1. Leia primeiro a seção **"Preciso de você"** do resumo.
2. Depois o resto.
3. Antes de uma pessoa revisar, rode `/revisar-diff`. Relato de early tester: no esforço mais
   baixo, o 5.5 pegou mais bugs que o Opus 5 no esforço alto, com menos alarme falso.
4. Em pesquisa, peça para marcar **o que não conseguiu confirmar e onde procurou**.

## 6. No app do Claude

- **Anexe o gráfico ou a screenshot** em vez de redigitar números. Ele lê imagem melhor que o
  Opus 5, inclusive setas, calendários e o que mudou entre duas versões de um diagrama.
- Em deck ou plano longo (como a especificação e o roadmap), peça para **achar contradições de
  número, data e nome**.
- Quer planilha? Peça **o arquivo pronto**, não o outline.
- Em projeto longo com follow-ups lentos, diga nas instruções que **respostas antigas já estão
  fechadas**, a não ser que você aponte erro.

## 7. Safety e troca de modelo

- O Opus 5.5 estreia com salvaguardas de bio e cyber no nível do Fable. Mensagem sinalizada
  costuma migrar para um modelo mais antigo, e a conversa continua nele.
  - No app: aparece **"Switched to…"**.
  - No Claude Code: `/model` para voltar; **Esc duas vezes** para editar a última mensagem;
    `/config` para exigir confirmação antes da troca.
- **Não peça para ele colar o raciocínio interno na resposta** — isso entra na categoria de
  mensagem sinalizada.

## 8. Comandos úteis no Claude Code

| Comando | Uso |
| --- | --- |
| `/fast` | Ida e volta rápida (preview de pesquisa): mesmo modelo, texto chega antes, custa mais por token. |
| `/model` | Voltar ao Opus 5.5 depois de uma troca automática. |
| `/config` | Exigir confirmação antes de trocar de modelo. |
| Esc Esc | Editar a última mensagem. |
| `/revisar-diff` | Revisão do diff antes da revisão humana (comando do projeto). |
| `/auditoria` | Tarefa grande fatiada em subagentes com checagem de evidência (comando do projeto). |
