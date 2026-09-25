# Integração com a Luna (assistente de voz)

Guia de uso da `/api/v1`, a porta do Compasso para a Luna. O contrato completo, com esquemas e
exemplos, é o [`openapi.yaml`](../apps/api/src/v1/openapi.yaml), servido também em
`GET /api/v1/openapi.yaml` (sem autenticação). As decisões estão no
[ADR-0012](adr/0012-api-v1-para-a-assistente-de-voz-luna.md).

## Conexão

| De onde a Luna chama | URL base | Transporte |
|---|---|---|
| Processo no homeserver, fora do Docker | `http://127.0.0.1:8090/api/v1` | HTTP, só loopback |
| Container no homeserver | `http://compasso-api:3000/api/v1` | HTTP na rede Docker |
| Qualquer outro lugar | `https://compasso.homelab-server.space/api/v1` | HTTPS pelo túnel |

- A porta 8090 só está publicada em `127.0.0.1` (`deploy/compose.yml`): outra máquina da LAN não a
  alcança por HTTP. Para a Luna em outra máquina, use o HTTPS do túnel.
- Para o nome `compasso-api` resolver, o container da Luna precisa estar numa rede em comum com a
  API: a `compasso_default` (declare-a como `external: true` no compose da Luna) ou a do túnel.
- O caminho pelo túnel sai para a borda da Cloudflare e volta; a latência extra não foi medida.
  Dentro da máquina, prefira HTTP.

**Token.** No app: Perfil → Configurações → **Luna (assistente de voz)** → Gerar token. Escolha
"leitura e escrita" (consultar, criar e concluir) ou "só leitura". O token aparece uma vez; se
perder, revogue e gere outro. Envie em `Authorization: Bearer <token>`. Trocar a senha da conta
revoga todos os tokens, inclusive o da Luna.

**Limites.** 120 requisições por minuto por token (depois disso, 429 com `Retry-After`); corpo até
16 KiB; agenda de até 366 dias por consulta; 100 itens por página (máx. 200 com `limit`).

## Regras que a Luna precisa seguir

- **Datas já resolvidas.** "Amanhã", "sexta" e "semana que vem" viram datas do lado da Luna. A API
  não interpreta linguagem natural.
- **Sempre com deslocamento**: `2026-09-26T14:00:00-03:00`. Sem ele, 400. A resposta vem sempre
  em `-03:00`.
- **Dia inteiro é só a data**, com `all_day: true`. Em evento, `end` é o último dia, inclusive.
- **Recorrência vem expandida.** Numa lista, o mesmo `id` (o da série) pode aparecer várias vezes;
  o que distingue as ocorrências é `occurrence_date`.
- **Confirme em voz pela resposta**, não pelo pedido: ela traz o que foi gravado.
- **Mande `Idempotency-Key` em toda criação** (um valor por intenção, ex.: o id do turno). Se a
  conexão cair e a Luna reenviar, o Compasso devolve o mesmo item em vez de duplicar.
- **Tarefa exige esforço e atributo.** Esforço: 1, 2, 3, 5 ou 8. Atributo: `corpo`, `mente`,
  `oficio`, `casa` ou `social`. Se a pessoa não disser, pergunte ou proponha e confirme.
- **Decida pelo `error.code`**, nunca pelo texto. A `message` pode ser falada.

## O que não é suportado (não prometa em voz)

- Editar, mover, remarcar ou apagar evento ou tarefa.
- Criar evento ou tarefa recorrente (as séries criadas no app aparecem normalmente).
- Desfazer a conclusão de uma tarefa; concluir evento.
- Local do evento (`location` é sempre `null` em eventos e é recusado na criação). Nas aulas,
  `location` é a sala.
- Prioridade de tarefa (`priority` é recusado).
- Lembretes: o item criado pela Luna recebe o lembrete padrão das configurações do app.
- Cadastrar ou alterar aulas, semestre e disciplinas (a grade é editada no app).
- Webhooks, notificações push, compartilhamento e múltiplas contas.
- Listar tarefas recorrentes em `GET /tasks` (elas aparecem na agenda, por ocorrência).

## Exemplos com curl

Todos foram rodados contra um servidor real em 2026-09-25 (PostgreSQL embutido, dados de
`luna:exemplo`); as respostas abaixo são as que voltaram, com ids encurtados. No Windows, o curl do
Git Bash não envia acentos em UTF-8 pela linha de comando: grave o corpo num arquivo UTF-8 e use
`--data-binary @arquivo.json` (a API recusa texto corrompido com 400, em vez de gravar `Reuni�o`).

```bash
export COMPASSO=http://127.0.0.1:8090/api/v1
```

```bash
export TOKEN=cole-aqui-o-token-gerado-no-app
```

### Testar conexão

```bash
curl "$COMPASSO/health" -H "Authorization: Bearer $TOKEN"
```

```json
{ "ok": true, "version": "4b025f6" }
```

### O que eu tenho amanhã?

```bash
curl -G "$COMPASSO/agenda" -H "Authorization: Bearer $TOKEN" --data-urlencode "from=2026-09-26T00:00:00-03:00" --data-urlencode "to=2026-09-27T00:00:00-03:00"
```

```json
{
  "timezone": "America/Sao_Paulo",
  "items": [
    { "id": "01a0d9ec-…d8e7", "type": "event", "title": "Aniversário da Ana",
      "start": "2026-09-26", "end": "2026-09-26", "all_day": true, "location": null,
      "recurring": false, "occurrence_date": null },
    { "id": "01a0d9ec-…3524", "type": "event", "title": "Treino na academia",
      "start": "2026-09-26T07:00:00-03:00", "end": "2026-09-26T08:00:00-03:00", "all_day": false,
      "location": null, "recurring": true, "occurrence_date": "2026-09-26" },
    { "id": "01a0d9ec-…c466", "type": "class", "title": "Cálculo II",
      "start": "2026-09-26T08:00:00-03:00", "end": "2026-09-26T10:00:00-03:00", "all_day": false,
      "location": "B-204", "recurring": true, "occurrence_date": "2026-09-26",
      "subject": "Cálculo II", "professor": "Marcos Lima", "cancelled": false },
    { "id": "01a0d9ec-…73fa", "type": "event", "title": "Dentista",
      "start": "2026-09-26T14:00:00-03:00", "end": "2026-09-26T15:00:00-03:00", "all_day": false,
      "location": null, "recurring": false, "occurrence_date": null },
    { "id": "01a0d9ec-…9197", "type": "task", "title": "Entregar relatório de física",
      "start": "2026-09-26T23:59:00-03:00", "end": null, "all_day": false, "location": null,
      "recurring": false, "occurrence_date": null,
      "due": "2026-09-26T23:59:00-03:00", "done": false }
  ],
  "next_cursor": null
}
```

### Quando é a prova de cálculo?

```bash
curl -G "$COMPASSO/agenda" -H "Authorization: Bearer $TOKEN" --data-urlencode "from=2026-09-25T00:00:00-03:00" --data-urlencode "to=2026-12-25T00:00:00-03:00" --data-urlencode "types=event,class" --data-urlencode "q=prova de cálculo"
```

```json
{
  "timezone": "America/Sao_Paulo",
  "items": [
    { "id": "01a0d9f1-…d1e9", "type": "event", "title": "Prova de Cálculo II",
      "start": "2026-10-09T08:00:00-03:00", "end": "2026-10-09T10:00:00-03:00", "all_day": false,
      "location": null, "recurring": false, "occurrence_date": null }
  ],
  "next_cursor": null
}
```

### Tarefas pendentes (com e sem prazo)

```bash
curl "$COMPASSO/tasks?done=false" -H "Authorization: Bearer $TOKEN"
```

```json
{
  "timezone": "America/Sao_Paulo",
  "items": [
    { "id": "01a0d9f1-…b2ed", "type": "task", "title": "Entregar relatório de física",
      "start": "2026-09-26T23:59:00-03:00", "end": null, "all_day": false, "location": null,
      "recurring": false, "occurrence_date": null, "due": "2026-09-26T23:59:00-03:00", "done": false },
    { "id": "01a0d9f1-…c660", "type": "task", "title": "Lista 3 de cálculo",
      "start": "2026-09-27", "end": null, "all_day": true, "location": null,
      "recurring": false, "occurrence_date": null, "due": "2026-09-27", "done": false },
    { "id": "01a0d9f1-…d37a", "type": "task", "title": "Comprar ração do gato",
      "start": null, "end": null, "all_day": false, "location": null,
      "recurring": false, "occurrence_date": null, "due": null, "done": false }
  ],
  "next_cursor": null
}
```

### Criar tarefa

```bash
curl -X POST "$COMPASSO/tasks" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Idempotency-Key: luna-turno-0001" -d '{"title":"Pagar a conta de luz","effort":1,"attribute":"casa","due":"2026-09-28"}'
```

`201`:

```json
{ "id": "ee38e37e-…cd90", "type": "task", "title": "Pagar a conta de luz", "start": "2026-09-28",
  "end": null, "all_day": true, "location": null, "recurring": false, "occurrence_date": null,
  "due": "2026-09-28", "done": false }
```

O mesmo comando de novo devolve `200`, o mesmo `id` e o cabeçalho `idempotent-replayed: true`.

### Marcar tarefa como feita

```bash
curl -X POST "$COMPASSO/tasks/01a0d9f1-e195-70a0-83ed-0c843997d37a/complete" -H "Authorization: Bearer $TOKEN"
```

```json
{ "id": "01a0d9f1-…d37a", "type": "task", "title": "Comprar ração do gato", "start": null,
  "end": null, "all_day": false, "location": null, "recurring": false, "occurrence_date": null,
  "due": null, "done": true }
```

Tarefa recorrente: envie a data da ocorrência, como veio na agenda:
`-H "Content-Type: application/json" -d '{"occurrence_date":"2026-09-26"}'`.

### Criar evento (duração padrão de 60 min, com aviso de conflito)

```bash
curl -X POST "$COMPASSO/events" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Idempotency-Key: luna-turno-0002" -d '{"title":"Reunião do grupo","start":"2026-09-26T14:30:00-03:00"}'
```

`201`:

```json
{ "id": "682a5bf4-…5c5", "type": "event", "title": "Reunião do grupo",
  "start": "2026-09-26T14:30:00-03:00", "end": "2026-09-26T15:30:00-03:00", "all_day": false,
  "location": null, "recurring": false, "occurrence_date": null,
  "conflicts": [
    { "id": "01a0d9f1-…0516", "type": "event", "title": "Dentista",
      "start": "2026-09-26T14:00:00-03:00", "end": "2026-09-26T15:00:00-03:00", "all_day": false,
      "location": null, "recurring": false, "occurrence_date": null }
  ] }
```

### Criar evento de dia inteiro

```bash
curl -X POST "$COMPASSO/events" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"Viagem para Campinas","start":"2026-09-30","end":"2026-10-02","all_day":true}'
```

```json
{ "id": "01a0d9f3-…8c18", "type": "event", "title": "Viagem para Campinas", "start": "2026-09-30",
  "end": "2026-10-02", "all_day": true, "location": null, "recurring": false,
  "occurrence_date": null, "conflicts": [] }
```

### Erros, um de cada

`401 unauthorized` — token errado, ausente ou revogado:

```bash
curl "$COMPASSO/health" -H "Authorization: Bearer token-errado-token-errado-token-errado"
```

```json
{ "error": { "code": "unauthorized", "message": "token ausente ou inválido" } }
```

`403 forbidden` — token "só leitura" tentando criar (o token de serviço em rotas fora da
`/api/v1` também recebe 403):

```bash
curl -X POST "$COMPASSO/tasks" -H "Authorization: Bearer $TOKEN_SO_LEITURA" -H "Content-Type: application/json" -d '{"title":"x","effort":1,"attribute":"casa"}'
```

```json
{ "error": { "code": "forbidden", "message": "este token só pode consultar a agenda" } }
```

`404 not_found`:

```bash
curl -X POST "$COMPASSO/tasks/00000000-0000-4000-8000-000000000000/complete" -H "Authorization: Bearer $TOKEN"
```

```json
{ "error": { "code": "not_found", "message": "não encontrei essa tarefa" } }
```

`400 validation_error` — horário sem deslocamento:

```bash
curl -X POST "$COMPASSO/events" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"Dentista","start":"2026-09-26T14:00:00"}'
```

```json
{ "error": { "code": "validation_error",
  "message": "start precisa ser data e hora com fuso, como 2026-09-26T14:00:00-03:00",
  "field": "start" } }
```

`409 conflict` — a mesma `Idempotency-Key` com outro pedido:

```bash
curl -X POST "$COMPASSO/tasks" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Idempotency-Key: luna-turno-0001" -d '{"title":"Outra coisa","effort":1,"attribute":"casa"}'
```

```json
{ "error": { "code": "conflict", "message": "essa Idempotency-Key já foi usada com outro pedido" } }
```

`429 rate_limited` — mais de 120 chamadas no último minuto, com `Retry-After: <segundos>`
(reproduzido no teste com o limite reduzido):

```json
{ "error": { "code": "rate_limited", "message": "muitas requisições; tente de novo em 60 s" } }
```

`500 internal` — só em falha real do Compasso (banco fora do ar, bug). Não há como provocar pelo
contrato; a forma é:

```json
{ "error": { "code": "internal", "message": "erro interno no Compasso" } }
```

## Dados de exemplo e token de teste

`luna:exemplo` cria uma **conta nova, separada da sua**, com um evento recorrente diário (Treino
na academia, 7h), um evento com horário amanhã (Dentista, 14h), um de dia inteiro amanhã
(Aniversário da Ana), uma aula amanhã (Cálculo II, 8h–10h, sala B-204), uma prova daqui a 14 dias,
uma tarefa com prazo e hora, uma com prazo só de data e uma sem prazo — e imprime um token de
serviço com leitura e escrita dessa conta. No homeserver, de dentro de `~/compasso`:

```bash
docker compose run --rm admin npm run luna:exemplo -- "Luna (exemplo)"
```

O token de teste só aparece nessa saída. A conta de exemplo não tem e-mail nem senha: ninguém
entra nela pelo app. Para revogar o token ou ver os dados no celular, dê acesso a ela com
`docker compose run --rm admin npm run conta:acesso -- <id da conta> <e-mail>` (senha
temporária) e entre com esse e-mail no app.
