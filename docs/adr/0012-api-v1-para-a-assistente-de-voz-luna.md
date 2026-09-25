# ADR-0012: API /api/v1 para a assistente de voz Luna

- **Data:** 2026-09-25
- **Status:** aceito
- **Envolvidos:** Diogo (autor), Claude Code (registro)

## Contexto

A Luna é uma assistente de voz que roda num servidor Node na LAN de casa, no mesmo homeserver da
API. Ela precisa consultar a agenda e criar itens por voz, servidor a servidor (sem navegador e
sem CORS). Cada chamada acontece no meio de uma resposta falada, com cerca de 800 ms até o
primeiro áudio: previsibilidade e latência pesam mais que riqueza de recursos.

A API existente não serve para isso como está:

- a especificação §6.3 decidiu em 2026-09-23 que **não há `POST /items`**, porque "uma segunda
  porta de escrita duplicaria validação e LWW sem cliente que a use". A Luna é esse cliente;
- `GET /agenda` devolve o formato interno do app (camelCase, UTC, aulas numa lista separada,
  campos de sync), grande e ambíguo para entrar no contexto de um modelo de linguagem;
- só existem tokens de sessão por aparelho, com acesso total à conta (ADR-0008), e o erro é
  `{"erro": "..."}`, sem código estável.

O pedido também trazia pontos que contradizem o modelo: tarefa criada só com título (a §4.1
exige esforço e atributo declarados na criação), `priority` e `location` (não existem colunas) e
aulas como eventos `type: class` (a §8 manteve a grade fora de `items`).

## Decisão

1. **Uma porta separada, `/api/v1`**, com contrato próprio em `apps/api/src/v1/openapi.yaml`
   (servido em `/api/v1/openapi.yaml`). As rotas antigas continuam como estão, para o app.
   Escrever pela v1 usa os mesmos repositórios, o mesmo `esquemaItem` e os mesmos CHECK do banco
   que o sync: não há validação duplicada. O item criado pela Luna chega ao aparelho no próximo
   pull, como qualquer escrita do servidor.
2. **Token de serviço.** `api_tokens` ganha `id`, `kind` (`session` | `service`) e `scopes`
   (`agenda:read`, `agenda:write`). O token de serviço é gerado e revogado no app (Configurações →
   Luna, rotas `/service-tokens` com a sessão do aparelho), mostrado uma vez e guardado só como
   SHA-256, como os de sessão. Ele só alcança `/api/v1`: em qualquer outra rota, 403. Na v1, token
   ausente, errado ou revogado dá 401; válido sem o escopo da rota, 403. Tudo por funções
   SECURITY DEFINER (migração 0018): a API continua sem enxergar `api_tokens` (ADR-0002). A antiga
   `resolver_token` fica, porque o rollback do deploy (ADR-0011) roda a imagem anterior sobre o
   banco já migrado. Teto de 10 tokens de serviço ativos por conta. Trocar a senha revoga todos,
   inclusive os de serviço.
3. **Contrato de tempo.** Todo instante entra e sai em ISO 8601 com deslocamento; a saída vem
   sempre em São Paulo (`-03:00`, ADR-0003). Dia inteiro é só a data, e em evento o `end` é o
   último dia **inclusive** ("de sexta a domingo" é sexta e domingo; no banco continua a
   meia-noite do dia seguinte). A API não interpreta linguagem natural.
4. **Um endpoint agregado.** `GET /api/v1/agenda` junta eventos, aulas e tarefas do intervalo,
   ordenados, numa ida e volta, com a mesma projeção do app (`projetarAgenda`, `aulasDoDia`).
   Recorrência vem expandida, cada ocorrência com o `id` da série e `occurrence_date`. Aulas
   continuam na grade (§8); é o endpoint que as junta, com `type: "class"`, `subject`,
   `professor`, a sala em `location` e `cancelled`. Busca `q` sem acento nem caixa. Página de 100
   itens (máx. 200), intervalo de até 366 dias. Títulos limpos de controle e cortados em 200.
5. **Tarefa exige `effort` e `attribute`** (decisão do autor em 2026-09-25): a §4.1 fica intacta.
   A Luna pergunta ou propõe e confirma em voz. **`priority` não é suportada** (decisão do autor);
   **`location` de evento também não**, pelo mesmo critério — ambos exigiriam coluna nova em
   `items`, no SQLite do app e no esquema do sync, e um APK novo. Campo desconhecido no corpo é
   `validation_error` com `field`, nunca ignorado em silêncio.
6. **Idempotência sem tabela.** O `id` do item criado é um UUID v8 derivado de SHA-256(conta,
   operação, `Idempotency-Key`). O reenvio após uma reconexão cai no conflito de chave primária e
   devolve o item gravado (200, `Idempotent-Replayed: true`); a mesma chave com outro pedido dá
   409 `conflict`. Sobrevive a reinício da API, porque a prova é a própria linha.
7. **Conflito de horário só avisa.** `POST /events` cria e devolve `conflicts` com os eventos com
   horário e as aulas não canceladas sobrepostos. Dia inteiro não conflita.
8. **Erro único** `{"error":{"code","message","field?"}}`, com códigos estáveis (`unauthorized`,
   `forbidden`, `not_found`, `validation_error`, `conflict`, `rate_limited`, `internal`) e
   mensagem curta em português, pronta para ser falada. 5xx só em falha real.
9. **Limite de 120 requisições por minuto por token**, em memória, como o limite de senha
   (ADR-0008): 429 `rate_limited` com `Retry-After`. Uma conversa de voz faz poucas chamadas; o
   limite só segura um laço com bug.
10. **Rede.** A Luna mora no homeserver: fora do Docker, `http://127.0.0.1:8090/api/v1` (porta já
    publicada só no loopback); num container, `http://compasso-api:3000/api/v1` entrando numa rede
    da API; de fora, `https://compasso.homelab-server.space/api/v1` pelo túnel, com a ida à borda
    da Cloudflare somada à latência. HTTP puro só dentro da máquina.

## Alternativas consideradas

- **Reaproveitar `GET /agenda` e o sync.** Sem mudança no servidor, mas a Luna teria de projetar
  aulas, entender o formato de sync e fazer LWW. Recusada: é a regra de negócio duplicada que a
  §6.3 quis evitar, agora num terceiro lugar.
- **Aulas como itens recorrentes (`kind: class`).** Era a preferência do pedido. Recusada pela
  razão da §8 (materializar ocorrências, aula não é tarefa); o pedido aceitava o agregado como
  alternativa.
- **Tabela de chaves de idempotência.** Guardaria a resposta exata, mas exige limpeza periódica e
  mais uma escrita por criação. O id derivado dá a mesma garantia com a linha que já existe.
- **Token de serviço criado por script do administrador.** Mais simples, mas o pedido era gerar e
  revogar no app, e o dono da conta não é necessariamente o administrador do servidor.
- **Esforço padrão para tarefa criada por voz.** Recusada pelo autor: o XP deixaria de ser
  declarado de verdade.

## Consequências

- A §6.3 deixa de valer como "não há `POST /items`": a escrita direta existe, restrita à v1 e ao
  formato dela. Especificação e roadmap atualizados no mesmo commit.
- Sem edição, remoção, recorrência nova, desfazer conclusão, `priority`, `location` de evento,
  lembretes nem webhooks pela Luna. A lista está no `openapi.yaml` e em `docs/luna.md`, para não
  ser prometida em voz.
- `GET /api/v1/tasks` lista só tarefas simples; tarefa recorrente aparece na agenda, por
  ocorrência.
- O limite de requisições zera ao reiniciar a API; com uma instância só, é aceitável.
- Latência medida em 2026-09-25 numa máquina de desenvolvimento (Windows, PostgreSQL embutido,
  ~630 itens, 25 séries, 16 horários de aula; 100 chamadas em processo, sem rede): p95 de 22 ms na
  agenda de um dia, 19 ms na semana, 49 ms numa busca de 60 dias, 14 ms ao criar evento. **Não
  medido no homeserver.**
