# ADR-0001: Usar PostgreSQL em vez de MongoDB

- **Data:** 2026-09-15
- **Status:** aceito
- **Envolvidos:** Diogo (autor)

## Contexto

A [especificação técnica v1](../especificacao-tecnica-v1.md) nasceu com MongoDB como banco, e a
própria seção 8 registrou uma ressalva: a escolha era do autor, legítima se o objetivo incluísse
aprender Mongo, mas com custo reconhecido — "quase toda consulta do Compasso é por intervalo de
datas e o modelo tem relacionamentos reais". A justificativa técnica oferecida era **flexibilidade
de schema enquanto as regras de gamificação ainda estão sendo calibradas**.

Quatro forças pressionam essa decisão, e três delas só ficaram visíveis depois que o roadmap foi
escrito.

**A calibração não toca no schema.** A seção 4.4 define a curva de nível como "constante de
configuração, não valor gravado no banco". A 4.1 define a régua de esforço como conteúdo fixo. A F9
do roadmap — a fase de calibração — diz explicitamente "não escreva código novo de mecânica aqui" e
lista apenas análise. A flexibilidade estava sendo comprada para a única fase desenhada para não
precisar dela.

**Offline-first tornou o client o lado rígido.** Com a decisão de offline-first confirmada (seção
6.2, e seção 2 do roadmap), o SQLite local passa a ter schema e migrações a partir da F1. Adicionar
um campo exige migração no SQLite, novo build e tratamento de clients antigos — nada disso
desaparece porque o servidor é schemaless. O que desaparece é o lugar onde o erro apareceria: um
client com bug escreve uma forma inesperada, o servidor aceita calado, e a sincronização propaga o
dado ruim para o outro aparelho. O roadmap classifica corromper o ledger como "irreversível na
prática".

**O modelo é relacional.** O diagrama ER da seção 5 já estava desenhado com chaves estrangeiras
(`ObjectId itemId FK`, `ObjectId refId FK`). Não existe um único agregado profundamente aninhado em
todo o modelo — `items`, `xpEntries`, `coinEntries`, `rewards`, `redemptions`, `itemOccurrences` e as
quatro tabelas da grade acadêmica são planas e normalizadas. A única relação aninhada é `courses` →
`classSlots`, um 1-N comum.

**O orçamento de aprendizado do projeto já está comprometido.** O roadmap estima 280-380 horas e
registra o abandono — não a falha técnica — como o modo de falha real. O autor já vai aprender
sincronização offline-first, expansão de RRULE, orçamento de notificação do iOS e development build
do Expo. Somar "aprender Mongo" na camada mais crítica e menos reversível do sistema gasta esse
orçamento no lugar mais caro.

Escala não é uma força aqui e não deve ser usada como argumento: a seção 2 fixa dezenas de itens por
semana e menos de dez contas. Os dois bancos são igualmente adequados nesse porte.

## Decisão

Vamos usar **PostgreSQL** como banco do Compasso, com **Drizzle** como camada de acesso e
migrações, **UUIDv7** como formato de identificador gerado no client, e **Row-Level Security**
ativado como segunda camada de isolamento por `userId`.

A decisão é tomada **antes da F0**, que é o momento mais barato em que ela pode ser tomada: depois
da F1 custaria reescrever a camada de repositório e os endpoints de sincronização; depois da F6,
isso mais o ledger, as transações e a migração de dado real.

Nenhuma regra de produto muda. Ledger append-only, tombstones, cursor pelo relógio do servidor,
ocorrências expandidas em leitura, pontos em décimos inteiros e a divisão 70/30 são idênticos nos
dois bancos.

## Alternativas consideradas

### Manter MongoDB

Descartada por quatro custos concretos, nenhum deles fatal isoladamente.

- **O `complete` transacional fica exposto a uma falha silenciosa.** No driver Node, uma operação
  dentro de `withTransaction` que não recebe `{ session }` executa **fora** da transação, sem erro e
  sem log. `POST /items/:id/complete` escreve em três tabelas e é descrito na seção 11 como um dos
  dois pontos acoplados do sistema; o modo de falha "XP creditado sem moeda" passaria a depender de
  ninguém esquecer um argumento. No Postgres a transação engloba a conexão e não há como esquecer.
- **Os invariantes ficam todos no código.** A seção 5 lista invariantes "que o banco não garante e a
  API precisa garantir". Em Postgres, cinco deles viram `CHECK` e `ON DELETE SET NULL`, e a regra
  "`courseId` aponta para disciplina do mesmo `userId`" vira uma chave estrangeira composta
  `(user_id, course_id)` — que é a única defesa estrutural contra o vazamento entre contas que a
  seção 8 se preocupa em evitar por disciplina de código.
- **Sem equivalente a RLS.** A regra da camada de repositório continua sendo apenas código, e a
  seção 8 reconhece que "disciplina manual falha uma vez só, e o custo dessa vez é vazamento entre
  contas".
- **Operação mais pesada no servidor doméstico.** Replica set de nó único, `rs.initiate()` e
  dimensionamento de oplog existem só para destravar transação multi-documento. A tabela de
  armadilhas da seção 6 do roadmap abre justamente com "MongoDB standalone".

### SQLite também no servidor

Tecnicamente adequado: dezenas de itens por semana, menos de dez contas, um único processo escritor.
Teria a propriedade atraente de usar o mesmo engine dos dois lados, permitindo que `packages/core`
compartilhasse migrações e queries literalmente idênticas entre API e client.

Descartada porque a história operacional é mais fraca para uma API Node de longa duração — backup
consistente exige `VACUUM INTO` ou Litestream, escrita concorrente exige cuidado com WAL e
`busy_timeout` — e porque o ganho real (compartilhar código de query) é entregue pelo Drizzle sem
abrir mão do Postgres. Fica registrada como opção viável caso a operação do Postgres se mostre
desproporcional ao projeto.

### Prisma como camada de acesso

Descartada em favor do Drizzle por um motivo específico deste projeto: o Prisma não roda sobre o
SQLite do React Native, então client e API ficariam com camadas de acesso diferentes. O Drizzle expõe
o mesmo query API sobre `node-postgres` e sobre `expo-sqlite`, o que permite que a lógica de consulta
compartilhada viva em `packages/core` — exatamente o que a F1 e a F3 precisam, e que a tabela de
armadilhas do roadmap já sinaliza como risco ("`packages/core` no Metro", F0).

O que o Prisma ganharia — schema declarativo e o Prisma Studio para inspecionar dado à mão — não paga
a divergência entre os dois lados num sistema cuja fase mais delicada é justamente a sincronização.

## Consequências

**Positivas**

- Transação multi-documento é o comportamento padrão. A exigência de replica set some da F0, e com
  ela a primeira linha da tabela de armadilhas do roadmap.
- Cinco dos invariantes da seção 5 passam a ser garantidos pelo banco, valendo inclusive contra
  retry com bug e contra edição manual no `psql`.
- `GET /stats/attributes` vira uma consulta só, com as duas medidas do radar — acumulado e janela de
  30 dias — no mesmo `SELECT` via `FILTER`, em vez de um pipeline de agregação ou duas viagens.
- RLS entra como rede de segurança abaixo da camada de repositório.
- `ObjectId` gerado no client exigiria polyfill de `crypto.getRandomValues` no Hermes
  (`react-native-get-random-values`). UUIDv7 é ordenável por tempo, serve de chave primária direto e
  elimina essa dependência nativa na F1.
- Uma camada de acesso só entre API e client, com queries compartilhadas em `packages/core`.

**Negativas**

- O autor não aprende MongoDB neste projeto. É o custo real e consciente da decisão: o objetivo de
  aprendizado era legítimo, e foi trocado por redução de risco na camada menos reversível.
- **Perde-se o change stream como cursor de sincronização.** Esta é a única perda técnica concreta.
  Change streams dão um cursor resumível e ordenado por commit; um cursor por `updatedAt` tem uma
  corrida silenciosa em qualquer banco — uma linha escrita com `updatedAt = T1` que faz commit depois
  de um pull em `T2 > T1` é perdida para sempre, sem erro e sem log. A mitigação é uma janela de
  segurança de alguns segundos no cursor, e ela precisa entrar na F1, não ser descoberta depois. Ver
  a questão em aberto correspondente na seção 10 da especificação.
- `courses` com seus `classSlots` aninhados (`GET /courses?semesterId=`) passa a exigir `json_agg` ou
  uma segunda consulta, em vez de um documento embutido lido de uma vez.
- Os campos esparsos de `itemOccurrences` (`titleOverride`, `startAt` só quando `type = "moved"`)
  viram colunas nuláveis. Funciona, sem elegância.

**Neutras / a observar**

- **A estimativa da F0 não muda.** A configuração do replica set sai (~1-2h) e a configuração de
  migrações entra (~2h). Registrado para que a ausência de mudança na tabela de totais não pareça
  esquecimento.
- Schema passa a exigir migração versionada desde a F0. Na prática isso já era verdade no client por
  causa do offline-first; agora os dois lados seguem a mesma disciplina.
- O modelo continua permitindo `jsonb` onde um campo realmente for heterogêneo. A flexibilidade não
  foi perdida, foi rebaixada de padrão para exceção explícita.

## Gatilho de revisão

Esta decisão deve ser reconsiderada se qualquer uma destas condições aparecer:

- **Aprender MongoDB virar objetivo declarado do projeto**, e não efeito colateral da escolha de
  banco. Nesse caso a decisão correta provavelmente não é trocar o banco do Compasso, e sim escrever
  outra coisa em Mongo — o custo aqui não é o banco, é onde ele fica.
- **O modelo adquirir um agregado genuinamente aninhado e de forma variável** — algo como o caderno
  de anotações por aula, hoje deliberadamente fora da v1 pela seção 10. Um campo `jsonb` resolveria o
  primeiro caso; vários resolveriam mal.
- **A operação do Postgres no servidor doméstico se mostrar desproporcional** ao porte do projeto.
  Nesse caso o movimento é para SQLite no servidor, não de volta para Mongo.

O que **não** é gatilho: volume de dados. A seção 2 fixa o teto em menos de dez contas e dezenas de
itens por semana, e nenhum dos dois bancos chega perto de sofrer nesse porte.
