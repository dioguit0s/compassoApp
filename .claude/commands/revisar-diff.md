---
description: Revisa o diff atual antes da revisão humana
---

Revise as mudanças ainda não integradas (`git diff` do working tree e dos commits desta branch
em relação à branch principal) como se fosse o revisor do PR.

Procure:

- bugs e casos de borda não tratados;
- divergências da `docs/especificacao-tecnica-v1.md`, do `docs/roadmap.md` e dos ADRs em `docs/adr/`;
- contradições de números, datas, nomes e termos introduzidas pelo diff;
- código ou texto morto, duplicado ou inconsistente com o restante do repositório.

Regras:

- Reporte só o que você confirmou lendo o código/texto. Cada achado com arquivo, linha e o
  cenário concreto que quebra.
- Separe **bloqueante** de **sugestão**. Sem achados, diga isso em uma linha.
- Não altere arquivos; apenas reporte. $ARGUMENTS
