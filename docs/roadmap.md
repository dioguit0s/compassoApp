# Compasso — Roadmap de Desenvolvimento — v1

> Companheiro de [`especificacao-tecnica-v1.md`](especificacao-tecnica-v1.md). A especificação diz
> **o que** o Compasso é; este documento diz **em que ordem** ele é construído e **por quê** nessa
> ordem. Nenhuma regra de produto nova é introduzida aqui — quando este documento e a especificação
> divergirem, a especificação vence e este arquivo é que está desatualizado.

---

## 1. Como ler este documento

Cada fase tem quatro coisas: um **objetivo** em uma frase, uma lista de **entregas**, um **critério
de saída** verificável e uma **estimativa em horas**. O critério de saída é a parte que importa —
ele existe para impedir a fase de terminar "quase pronta", que é o modo de falha real de projeto
pessoal.

As estimativas são grosseiras e assumem um desenvolvedor sozinho, sem experiência prévia com a
metade das peças. Trate-as como ordem de grandeza: se uma fase estimada em 40h levar 60h, o
roadmap está funcionando. Se levar 200h, a fase estava mal fatiada e precisa ser quebrada.

**Nenhuma fase pode terminar com o app quebrado.** Cada uma leva o Compasso de um estado utilizável
a outro estado utilizável. Isso custa um pouco de trabalho extra de integração e paga por si na
primeira vez que o projeto ficar três semanas parado.

## 2. Decisões que este roadmap assume

Quatro decisões foram tomadas para escrever este documento. Elas resolvem ambiguidades da
especificação e mudam a ordem das fases.

| Decisão | Valor | Efeito no roadmap |
|---|---|---|
| Offline-first | **Na v1, desde o início** `DECIDIDO` | A camada de sincronização vira a F1, antes de qualquer tela real |
| Banco | **PostgreSQL + Drizzle** `DECIDIDO` | Sai a configuração de replica set da F0; entram migrações e RLS. Ver [ADR-0001](adr/0001-postgresql-em-vez-de-mongodb.md) |
| Ritmo | ~8-12h/semana, sozinho | Fases de 2 a 5 semanas, cada uma entregando algo utilizável |
| Prioridade | **Calendário confiável primeiro** | Gamificação e economia só entram depois do marco de migração |

**A primeira resolve uma contradição da especificação.** A seção 6.2 marca offline-first como
`DECIDIDO`; a seção 10 lista "offline-first — decisão de arquitetura ainda não confirmada" entre as
questões em aberto. A partir daqui, vale a 6.2, e o item correspondente da seção 10 deve sair.

### O custo dessa escolha, registrado uma vez

Offline-first antes de qualquer tela significa que a parte mais difícil e menos visível do sistema
vem primeiro. Pelas estimativas abaixo, são **~170 a 235 horas até o marco de migração** — algo
entre quatro e seis meses no ritmo previsto. A alternativa (online-first, sync na v1.5) chegaria ao
mesmo marco em cerca de metade do tempo, ao custo de reescrever a camada de dados do client depois.

A escolha é legítima: sincronização retrofitada em cima de uma camada de dados que não foi pensada
para ela é notoriamente pior que sincronização feita desde o começo, e o retrabalho não é pequeno.
Mas o risco a vigiar **não é técnico, é de abandono** — um projeto pessoal que passa cinco meses
sem ser usado de verdade morre com mais frequência do que um que nasce imperfeito e é usado.

Por isso a F1 tem um **ponto de corte explícito** (seção 5.2): um subconjunto da sincronização que
preserva o desenho e corta semanas. Se em algum momento o prazo incomodar, é ali que se corta, e
não na F0 nem na F3.

## 3. Por que esta ordem

A sequência não segue a ordem da especificação nem a ordem de valor percebido. Ela segue **ordem de
risco decrescente**: o que pode invalidar o desenho vem primeiro, enquanto ainda é barato mudar de
ideia.

Os três riscos que podem forçar retrabalho grande são, nesta ordem:

1. **A sincronização estar errada.** Um bug de sync não aparece como erro; aparece como dado que
   some ou duplica semanas depois, e corromper o ledger de XP é irreversível na prática. É a F1.
2. **A expansão de RRULE divergir entre client e servidor.** É a única lógica deliberadamente
   duplicada do sistema (seção 6.6 da especificação). Se as duas versões discordarem, o calendário
   mostra um evento no aparelho e outro no servidor. É a F3, e a mitigação é ela sair de uma
   biblioteca compartilhada com testes próprios — não de duas implementações escritas à mão.
3. **O orçamento de notificações do iOS.** 64 pendentes por app é um teto que costuma ser descoberto
   quando já existe uma série diária consumindo tudo. É a F4.

Gamificação vem depois de tudo isso não porque vale menos, mas porque é a parte **mais fácil de
mudar depois** — o ledger é reprocessável do zero a partir dos itens concluídos (seção 11 da
especificação). Errar a curva de nível custa uma constante; errar a sincronização custa o histórico.

## 4. Marcos

| Marco | Fase | O que muda na sua vida |
|---|---|---|
| **M1 — Dado sobrevive** | fim da F1 | Criar item sem rede, reabrir em outro aparelho, e ele está lá |
| **M2 — Agenda utilizável** | fim da F2 | Dá para marcar compromisso único e consultar a semana |
| **M3 — Google Calendar desligado** | fim da F4 | O Compasso é o calendário primário. É o marco que importa |
| **M4 — O radar diz algo verdadeiro** | fim da F6 + 30 dias | A janela de 30 dias tem dado suficiente para não mentir |
| **M5 — v1 completa** | fim da F8 | Todo o escopo da seção 3 da especificação está de pé |

---

## 5. As fases

### F0 — Fundação

**Objetivo:** ter um esqueleto que autentica, grava local, fala com o servidor e é implantável —
sem nenhuma funcionalidade de produto.

**Entregas**

- Monorepo com `apps/api`, `apps/mobile`, `packages/core`
- PostgreSQL com **Drizzle e migrações versionadas**, schema aplicado por migração desde o primeiro commit
- **Row-Level Security ativado em todas as tabelas**, com a conexão da API definindo `app.user_id`
- API Node: middleware de token estático → `userId`, e a **camada de repositório que injeta
  `userId` e filtra `deletedAt`** em toda consulta
- Script manual de criação de conta
- Expo com **development build** (não Expo Go), quatro abas vazias, SQLite aberto e migrado
- Cloudflare Tunnel apontando para a API; deploy manual documentado em quatro comandos
- Cron de `pg_dump` diário, retenção de sete dias
- **Uma restauração manual de dump em banco descartável, conferida à mão**

**Critério de saída:** o app instalado no aparelho abre, autentica, faz `GET /me` pelo túnel, grava
a resposta no SQLite e a lê de volta depois de fechar e reabrir sem rede. E um dump restaurado abriu.

**Por que as migrações e o RLS agora:** as duas coisas são baratas num banco vazio e caras num banco
com dado dentro. Migração aplicada desde o primeiro commit significa que o schema do servidor e o do
SQLite evoluem pelo mesmo ritual, que é o que a F1 precisa. O RLS ligado depois exige auditar toda
consulta que já existe para descobrir quais quebram — ligado agora, quebra na hora em que a consulta
errada é escrita, que é quando o conserto custa minutos.

**O que saiu daqui:** a configuração de replica set do MongoDB, que existia só para destravar
transação multi-documento. No PostgreSQL a transação é padrão. Ver
[ADR-0001](adr/0001-postgresql-em-vez-de-mongodb.md). A estimativa da fase não muda: o replica set
saiu, as migrações entraram, e as duas custam mais ou menos o mesmo.

**Por que development build agora:** notificações locais com alarme exato no Android 12+ não
funcionam no Expo Go. Começar no Expo Go e migrar na F4 é retrabalho garantido.

**Por que a restauração manual agora:** um backup nunca restaurado é uma suposição, e a F1 já
começa a gerar dado que dói perder.

**Estimativa:** 25-35h

---

### F1 — Sincronização, com uma entidade só

**Objetivo:** provar o protocolo de sincronização inteiro contra `items`, antes de existirem mais
oito tabelas para consertar junto.

**Entregas**

- Tabela local de `items` no SQLite com colunas de controle: `dirty`, `deletedAt`, `updatedAt`
- **IDs gerados no client em UUIDv7** — sem polyfill de `crypto.getRandomValues` no Hermes
- CRUD local completo, escrita imediata, exclusão lógica por tombstone
- `POST /sync/push` e `GET /sync/pull?cursor=`
- **Cursor pelo relógio do servidor**, nunca pelo do aparelho
- **Janela de segurança no cursor**: o pull pede desde `cursor - N segundos` para não perder escrita
  que fez commit fora de ordem de `updatedAt`
- Conflito por last-write-wins comparando `updatedAt`
- Purga de tombstones dos dois lados aos 30 dias
- Disparo da sincronização na abertura do app e em "puxar para atualizar"
- Testes de integração cobrindo: criar offline → sincronizar; editar nos dois lados → LWW;
  excluir de um lado → não ressuscita; push repetido → não duplica

**Critério de saída:** com o aparelho em modo avião, criar três itens, editar um e excluir outro;
religar a rede; o servidor termina com exatamente o estado certo. E o mesmo item editado em dois
clientes offline converge para a escrita mais recente, nos dois sentidos.

**Riscos:** esta é a fase que mais estoura estimativa. O erro clássico é tratá-la como "salvar e
enviar" — o difícil não é o caminho feliz, é o retry, a exclusão concorrente e a ordem de aplicação.

**Estimativa:** 40-60h

#### 5.2 Ponto de corte da F1

Se o prazo até o M3 incomodar, corte **aqui** e em nenhum outro lugar. O subconjunto abaixo
preserva o desenho e pode ser completado a qualquer momento depois, sem migração:

| Fica na F1 | Vai para depois da F4 |
|---|---|
| IDs no client, tombstones, cursor do servidor | Sincronização em tarefa de background |
| Push/pull na abertura e em pull-to-refresh | Resolução de conflito com aviso na UI |
| LWW silencioso | Fila de retry com backoff |
| Testes dos quatro cenários acima | Sincronização parcial por tabela |

O que **não** pode ser cortado é o trio IDs-no-client, tombstone e cursor-do-servidor: os três
mudam o formato do dado, e adicioná-los depois exige migração e auditoria.

---

### F2 — Calendário legível

**Objetivo:** o Compasso vira uma agenda utilizável para compromissos únicos.

**Entregas**

- Visões de **semana** e **mês** na aba Calendário, com alternância
- Eventos de dia inteiro e de vários dias
- Aba Hoje com a lista do dia (ainda sem aulas)
- **Captura rápida** como modal acessível de qualquer aba
- Detalhe do item: edição completa, notas, lembrete
- Distinção visual entre compromisso puro e item pontuável — a regra de apresentação já existe
  mesmo antes de a gamificação existir
- No máximo três linhas por dia na visão de mês, com contador de excedentes
- Arrastar tarefa da faixa para a grade da semana e agendá-la (especificação §7). Acrescentado em
  2026-09-23, depois da F8: estava na especificação mas faltava nesta lista

**Critério de saída:** uma semana inteira de compromissos reais cadastrada à mão e consultável sem
rede. A captura rápida leva menos de três segundos do toque ao item salvo — cronometrada, não
estimada.

**Nota:** `effort` e atributos já existem no schema desde a F1, mas a UI não os coleta ainda. Todo
item criado nesta fase nasce como compromisso puro.

**Estimativa:** 35-45h

---

### F3 — Recorrência

**Objetivo:** séries recorrentes que se comportam igual nos dois lados.

**Entregas**

- Em `packages/core`: validador do subconjunto RRULE e **expansor de ocorrências em um intervalo**,
  consumido pela API e pelo app a partir do mesmo código
- Testes do expansor cobrindo explicitamente os dois casos de borda da especificação:
  `BYMONTHDAY=31` em mês de 30 dias é **pulado**, e 29 de fevereiro só ocorre em ano bissexto
- Tabela `itemOccurrences` com índice único em `(itemId, occurrenceDate)`
- Rotas de ocorrência: concluir, cancelar, mover, editar
- `GET /agenda?from=&to=` projetando no servidor
- Na UI, toda edição de série pergunta o alcance: **só esta ocorrência** ou **esta e as futuras**
- Ocorrências cumpridas e não cumpridas visíveis na grade do calendário

**Critério de saída:** um treino semanal e uma conta mensal cadastrados; cancelar uma terça
específica não afeta as outras; editar "esta e as futuras" não toca no passado; e a mesma janela de
datas expandida no client e na API devolve exatamente o mesmo conjunto de ocorrências — verificado
por teste, não por inspeção visual.

**Por que o pacote compartilhado é inegociável:** duas implementações da mesma regra divergem. Não
é uma possibilidade, é uma questão de quando.

**Estimativa:** 40-55h

---

### F4 — Notificações e importação de ICS → **M3**

**Objetivo:** tornar o Compasso confiável o bastante para ser o único calendário, e trazer o
histórico para dentro.

**Entregas**

- Agendador de notificações com **janela deslizante**: só as próximas ocorrências dentro do
  orçamento, priorizadas por proximidade
- Reagendamento na abertura do app e em tarefa periódica de background
- Tratamento explícito do teto de **64 notificações pendentes no iOS** e da permissão de **alarme
  exato do Android 12+**, com o app se comportando corretamente quando a permissão é negada
- `POST /import/ics`: `VEVENT` → item, `RRULE` → série
- Importação **idempotente por `UID`**: reimportar o mesmo arquivo atualiza, não duplica
- Todo item importado nasce **sem `effort`**
- Recorrências fora do subconjunto suportado entram **expandidas em ocorrências isoladas**, com
  aviso na tela ao fim da importação
- Tela de importação alcançada pelas configurações

**Critério de saída — este é o marco M3:** o `.ics` real exportado do Google Calendar importado sem
perder evento; reimportado, não duplicou nada; os lembretes da semana seguinte dispararam todos, no
horário certo, com o aparelho sem rede. **A partir daqui o Google Calendar pode ser desligado.**

**Não desligue antes deste critério.** A especificação é explícita: se um compromisso só existe
aqui, uma notificação perdida custa o compromisso. Rode as duas agendas em paralelo por uma semana
antes de confiar.

**Estimativa:** 30-40h

---

### F5 — Grade acadêmica

**Objetivo:** responder "que aula eu tenho hoje e em que sala?" sem materializar nada.

**Entregas**

- Tabelas `semesters`, `courses`, `classSlots`, `classExceptions`, todas na sincronização
- **Horário como string `HH:mm`**, hora de parede, nunca `Date`
- Tela Semestre, alcançada pelo cabeçalho da aba Calendário, não por uma quinta aba
- Aulas do dia **projetadas** na aba Hoje: horário, disciplina, sala, na cor da disciplina, sem
  caixa de marcar e sem conclusão
- Aulas ao fundo na visão de semana do calendário
- Exceções: cancelamento, troca de sala e reposição, refletidas na linha do dia
- `courseId` opcional em `items`, com selo da disciplina em prova e trabalho
- Excluir disciplina **anula** `courseId` dos itens ligados, não os apaga

**Critério de saída:** a grade do semestre corrente cadastrada; a aba Hoje mostra as aulas certas em
cada dia da semana, incluindo uma sala trocada e uma aula cancelada; e nenhum documento de ocorrência
de aula foi gravado no banco.

**Puxe esta fase para antes da F4 se** um semestre novo começar antes de a migração ficar pronta. É
a única fase do roadmap com dependência de calendário externo, e ela não bloqueia nada que venha
depois.

**Estimativa:** 25-35h

---

### F6 — Gamificação: esforço, XP e radar

**Objetivo:** a camada de medição entra em operação e começa a acumular dado verdadeiro.

**Entregas**

- `effort` na escala fixa 1, 2, 3, 5, 8 na captura rápida, com a **régua de referência** exibida no
  momento da estimativa
- Atributo principal e secundário opcionais, com a invariante de nunca serem iguais
- **Congelamento de `effort`** quando o item entra no dia corrente, aplicado de forma idêntica na
  UI e na API
- Ledger `xpEntries` em **décimos inteiros**, com a divisão 70/30
- `POST /items/:id/complete` **transacional** e **idempotente**, com chave de idempotência —
  obrigatória, porque com sync e retry a mesma requisição vai chegar duas vezes
- `POST /items/:id/uncomplete` estornando os lançamentos
- `POST /items/:id/postpone` incrementando o contador, exibido sem julgamento
- `GET /stats/attributes`: acumulado, janela de 30 dias e nível derivado
- Radar dos cinco atributos e faixas de nível na aba Perfil

**Critério de saída:** concluir um item credita XP exatamente uma vez, mesmo com a requisição
enviada três vezes; desfazer estorna; a soma do ledger bate com o radar; e um item que entrou no
dia corrente recusa edição de esforço tanto na UI quanto por chamada direta à API.

**Duas decisões a tomar dentro desta fase** — tomadas em 2026-09-23, ver [ADR-0006](adr/0006-congelamento-conclusao-idempotente-e-estorno.md).

- **Como o congelamento é gravado.** Derivar o travamento só da data é errado: adiar um item de hoje
  para a semana que vem o destravaria, que é exatamente a trapaça que a regra impede. Precisa de
  escrita — tarefa diária ou gravação preguiçosa na primeira leitura do dia. Escolha uma e registre.
- **Estorno de moeda com saldo já gasto** (questão aberta da seção 10). Ela para de ser teórica no
  primeiro `uncomplete` desta fase.

**Estimativa:** 30-40h

---

### F7 — Economia

**Objetivo:** fechar o único ciclo do sistema que termina fora do Compasso.

**Entregas**

- `coinEntries` e saldo derivado por soma, sem campo materializado
- Aba Recompensas: lista com preço, cooldown, saldo e botão de resgate
- `rewards` com `pendingPrice`/`pendingFrom` e a **carência até a segunda-feira seguinte**
- Cooldown por recompensa, independente de saldo
- `redemptions` com `pricePaid` gravado no resgate e nunca recalculado
- Histórico de resgates permanente e visível

**Critério de saída:** criar uma recompensa e tentar resgatá-la no mesmo dia falha pela carência;
baixar o preço de uma existente não tem efeito até a segunda-feira; resgatar duas vezes dentro do
cooldown falha mesmo com saldo sobrando; e o histórico mostra o preço da época, não o atual.

**Estimativa:** 20-25h

---

### F8 — Perfil, lixeira e acabamento → **M5**

**Objetivo:** fechar o escopo da seção 3 da especificação.

**Entregas**

- Avatar: iniciais sobre cor derivada do nome como padrão, e foto enviada redimensionada para 256px
  no servidor, servida pelo Nginx
- Nome de exibição e configurações: fuso, lembrete padrão, régua de esforço
- `GET /trash` e restauração — a lixeira já existe no dado desde a F1, falta a tela
- Histórico de XP por mês na aba Perfil
- Revisão de estados vazios, erro e carregamento em todas as telas

**Critério de saída:** todo item da tabela "Dentro" da seção 3 da especificação está de pé e foi
usado ao menos uma vez em uso real.

**Estimativa:** 25-30h

---

### F9 — Calibração

**Objetivo:** trocar os chutes por números medidos. **Não escreva código novo de mecânica aqui.**

Depois de três a quatro semanas de uso contínuo com a gamificação ligada:

- **Curva de nível.** Os números da seção 4.4 da especificação são explicitamente um chute. Com
  dado real, ajuste a constante — o nível é derivado, então não há migração.
- **Régua de esforço.** Reescreva os exemplos com tarefas da sua vida. Sem isso a escala não ancora
  e infla sozinha.
- **Distribuição do radar.** Se um atributo nunca recebe pontos, a pergunta é se a vida está
  desequilibrada ou se a definição do atributo está errada. As duas respostas são úteis.

O aviso da seção 11 da especificação vale principalmente para esta fase: gamificação é infinitamente
ajustável, e por isso é uma armadilha de procrastinação produtiva. **As regras que sobreviverem a
três semanas de uso real são as únicas que merecem código novo.**

**Estimativa:** 10-15h, quase toda de análise

---

### F10 — Abrir para os amigos

Fora da v1. O plano era não começar antes do M5 mais um mês de uso; o autor validou o app no
aparelho real e antecipou a F10 em 2026-09-23, com a F9 (calibração) ainda por fazer.

- **Autenticação real.** ✅ Senha própria (scrypt), sessão por aparelho em `api_tokens`, revogável:
  sair revoga a do aparelho, trocar a senha revoga as outras. A troca ficou localizada no
  middleware, como previsto ([ADR-0008](adr/0008-senha-propria-convite-e-sessao-por-aparelho.md)).
- **Cadastro de conta.** ✅ Por código de convite gerado por script (`convite:criar`), uso único.
  Esqueci a senha: `conta:acesso` gera uma senha temporária (ADR-0008).
- **Backup fora da máquina.** ❌ Recusado pelo autor: o dump continua só no servidor, com o risco
  aceito ([ADR-0010](adr/0010-backup-sem-copia-externa-com-contas-de-amigos.md)).
- **Atributos fixos ou por conta.** ✅ Fixos
  ([ADR-0009](adr/0009-atributos-e-regua-fixos-para-todas-as-contas.md)).
- **Régua de esforço por conta.** ✅ Fixa, a mesma para todos (ADR-0009).
- **Distribuição.** ✅ APK de release gerado localmente (`npm run apk -w @compasso/mobile`),
  assinado com chave própria (ADR-0008).

**Critério de saída:** um amigo recebe o convite e o APK, cria a conta, usa, e as duas contas não
se enxergam. Depende de a API estar exposta pelo túnel da Cloudflare, que fica para quando o app
estiver mais pronto.

---

## 6. Armadilhas técnicas conhecidas

Coisas que custam minutos se tratadas na fase certa e dias se descobertas depois.

| Armadilha | Fase | Por quê |
|---|---|---|
| RLS ligado depois | F0 | Ligar com consultas já escritas exige auditar todas para achar as que quebram |
| Expo Go | F0 | Alarme exato do Android 12+ e notificações em background não funcionam nele |
| Fuso horário no Hermes | F0 | O runtime de RN historicamente vem sem ICU completo, e formatação por fuso quebra. Um app de calendário precisa resolver isso **antes** da primeira tela com data |
| `packages/core` no Metro | F0 | Compartilhar TypeScript entre Node e RN em monorepo exige configuração de resolver; descobrir isso na F3 trava a fase mais delicada |
| Formato do ID no client | F1 | O `id` gerado no aparelho precisa ser decidido de uma vez; trocar depois é migração |
| Relógio do aparelho no cursor | F1 | Perde alterações silenciosamente — sem erro, sem log, só dado faltando |
| Idempotência da conclusão | F6 | Sem chave, um push repetido credita XP duas vezes e corrompe o ledger sem alarme |
| Congelamento derivado da data | F6 | Adiar destravaria o esforço, que é a trapaça que a regra existe para impedir |

**Sobre testes:** `packages/core` — expansão de RRULE e aritmética de XP em décimos — merece testes
unitários de verdade, porque são regras puras, determinísticas e caras de errar em silêncio. A
sincronização merece testes de integração dos quatro cenários da F1. A UI não merece nem um: num app
de um usuário, o custo de manter teste de tela não paga.

## 7. Questões em aberto × fase

Mapeamento das questões da seção 10 da especificação para o momento em que cada uma deixa de ser
adiável. Uma questão fora deste mapa é uma questão que não precisa de resposta ainda.

| Questão aberta | Precisa de resposta até | Se ficar sem resposta |
|---|---|---|
| Offline-first | **resolvida** | — |
| Fuso ao viajar | **resolvida** — hora de São Paulo sempre ([ADR-0003](adr/0003-fuso-fixo-de-sao-paulo.md)) | — |
| Fim de semestre | **resolvida** — semestre corrente + datas ([ADR-0005](adr/0005-semestre-corrente-e-grade.md)) | — |
| Curva de nível | F9 | Nada quebra; o nível fica sem significado |
| Régua de esforço | F6 | A escala infla e o radar deixa de comparar com o passado |
| Estorno de moeda | **resolvida** — saldo pode ficar negativo ([ADR-0006](adr/0006-congelamento-conclusao-idempotente-e-estorno.md)) | — |
| Grade versus RRULE | F10 | Nada quebra; a duplicação se justifica enquanto aula não pontua |
| Backup externo | **resolvida** — sem cópia externa, risco aceito ([ADR-0010](adr/0010-backup-sem-copia-externa-com-contas-de-amigos.md)) | — |
| Autenticação real | **resolvida** — senha própria e convite ([ADR-0008](adr/0008-senha-propria-convite-e-sessao-por-aparelho.md)) | — |
| Atributos por conta | **resolvida** — fixos, régua fixa ([ADR-0009](adr/0009-atributos-e-regua-fixos-para-todas-as-contas.md)) | — |
| XP por presença em aula | — | Provavelmente deve continuar sem resposta |
| Anotações de aula | — | Deliberadamente fora |

## 8. Totais

| Bloco | Horas | Semanas a 10h |
|---|---|---|
| F0 → F4 (até desligar o Google Calendar) | 170-235 | 17-24 |
| F5 → F8 (v1 completa) | 100-130 | 10-13 |
| F9 (calibração) | 10-15 | 1-2 |
| **v1 inteira** | **280-380** | **28-38** |

Os números não incluem o que sempre aparece: uma semana perdida em configuração de build, um fim de
semana investigando por que a notificação não disparou no aparelho certo, e a fase que você vai
querer refazer depois de usá-la. Some de 20 a 30% e a conta fica honesta.

## 9. O que este roadmap não faz

- **Não fatia em tarefas de uma sessão.** Isso se faz no começo de cada fase, com o contexto do
  código que já existe. Fatiar a F7 hoje seria ficção.
- **Não coloca data de calendário.** Ritmo de projeto pessoal não é estável o bastante para isso, e
  prazo estourado em projeto sem cliente só produz culpa.
- **Não admite fase paralela.** Sozinho, duas frentes abertas viram duas frentes pela metade.
