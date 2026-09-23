---
description: Auditoria ou migração grande dividida em subagentes, com checagem de evidência
---

Tarefa: $ARGUMENTS

1. Registre o objetivo, o critério de "pronto" e as fatias em `TASKS.md`.
2. Divida o trabalho em fatias independentes (por diretório, módulo ou documento) e delegue
   cada fatia a um subagente, em paralelo quando não houver dependência entre elas.
3. Cada subagente deve devolver, para cada afirmação, a evidência: arquivo e linha, trecho
   citado ou saída de comando.
4. Antes de aceitar o resultado de uma fatia, confira a evidência você mesmo. Afirmação sem
   evidência ou que não se sustenta volta para refazer ou é descartada.
5. Marque cada fatia em `TASKS.md` ao aceitá-la.
6. No resumo final: primeiro o que precisa de mim, depois os achados consolidados, depois o que
   não foi possível confirmar e onde foi procurado.

Não tome ações destrutivas nem fora do repositório sem perguntar.
