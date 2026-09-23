# Sincronização — como a F1 implementou a §6.6

Referência de implementação do protocolo descrito na
[especificação §6.6](especificacao-tecnica-v1.md#66-sincronização). Regras de produto continuam
lá; aqui ficam as decisões que as issues #15 a #24 pediram para registrar.

## Peças

| Peça | Onde |
|---|---|
| Formato de transporte e invariantes (zod) | `packages/core/src/item.ts` |
| Motor push → pull | `packages/core/src/sync/motor.ts` (`MotorDeSync`) |
| Schema e repositório do SQLite | `packages/core/src/local/` (`RepositorioLocal`) |
| Endpoints | `apps/api/src/sync.ts` — `POST /sync/push`, `GET /sync/pull?cursor=` |
| LWW e cursor no servidor | `apps/api/src/db/repositorios.ts` (`itens.aplicarPush`, `itens.alteradosDesde`) |
| Purga no servidor | `apps/api/scripts/purgar.ts`, diária pelo `compasso-manutencao.service` |
| Integração no app | `apps/mobile/src/sync.ts` |
| Testes dos quatro cenários | `apps/api/test/sync-integracao.test.ts` |

O motor e o repositório local são os mesmos no app e nos testes: lá sobre `expo-sqlite`, aqui sobre
`better-sqlite3`, os dois com o driver síncrono do Drizzle e as mesmas migrações
(`apps/mobile/drizzle/`).

## Decisões

**Dois relógios, duas colunas.** `updated_at` é o relógio do aparelho que fez a última edição e só
decide o last-write-wins. `server_updated_at` é preenchido por trigger com `clock_timestamp()` em
toda escrita no servidor, sobrescrevendo o que vier do client, e é a única coluna que o pull
consulta. O relógio do aparelho nunca entra no cursor.

**Cursor.** É o `now()` da transação do pull (início dela, relógio do banco), em ISO 8601 UTC com
microssegundos. O client guarda como string opaca. `now()` e não `clock_timestamp()` porque o
snapshot da transação começa no primeiro comando: tudo que fez commit antes dele está no
resultado, e o que fizer commit depois tem carimbo posterior ao cursor ou cai na janela.

**Janela de segurança: 60 segundos** (`SYNC_CURSOR_WINDOW_SECONDS`). Cobre uma escrita cujo
carimbo foi tirado antes do pull mas cujo commit veio depois. As transações da F1 duram
milissegundos; 60 s é deliberadamente folgado porque reprocessar é inofensivo (a aplicação local é
idempotente por `id`). O número definitivo sai da F9 (issue #93), medindo o `complete` da F6.

**Paginação: não existe na F1.** Um pull devolve tudo desde o cursor. No volume da §2 (dezenas de
itens por semana) o primeiro pull de um aparelho novo cabe folgado numa resposta. O push vai em
lotes de 500 e o schema recusa mais de 1000 por requisição.

**LWW.** No servidor, uma instrução: `INSERT … ON CONFLICT (id) DO UPDATE … WHERE
items.updated_at < excluded.updated_at`. Empate mantém o servidor. O client limpa `dirty` tanto
dos aplicados quanto dos ignorados (o servidor tem versão igual ou melhor, que chega no pull) — mas
só se a linha não mudou de novo desde o envio. No pull, linha suja só é sobrescrita por versão
estritamente mais nova; linha limpa aceita igual ou mais nova. Com isso o empate converge: quem
perdeu recebe a versão do servidor.

**Edição sempre vence a versão anterior do próprio aparelho.** O `updatedAt` de uma edição é
`max(agora, anterior + 1 ms)`. Um relógio que voltou no tempo não faz a edição nova perder para a
antiga.

**Tombstone é só uma coluna.** A exclusão preenche `deleted_at` e `updated_at` e segue o mesmo LWW.
Consequência aceita: uma edição feita em outro aparelho **depois** da exclusão (relógio mais novo)
vence e o item volta. É a leitura literal do LWW da §6.6.

**Invariantes no aparelho: código, não CHECK.** O SQLite não ganhou CHECK: alterar CHECK nele
exige recriar a tabela. O `RepositorioLocal` valida com a mesma função (`violacoesDeInvariante`)
que o servidor usa antes dos CHECKs do PostgreSQL, e recusa com mensagem legível. Uma linha suja
que mesmo assim esteja inválida (bug de versão antiga) é deixada de fora do push e reportada, em
vez de travar a sincronização das outras.

**Datas no SQLite: inteiro, epoch ms UTC**, em todas as colunas. No transporte, ISO 8601.

**Uma sincronização por vez.** Chamadas simultâneas compartilham a mesma promessa. Disparos na F1:
abertura do app e puxar-para-atualizar. Background, fila com backoff e aviso de conflito ficaram
para depois da F4, pelo ponto de corte do roadmap §5.2.

**Falha no meio não perde nada.** O que o servidor não confirmou continua sujo; o cursor só avança
depois de o pull ser aplicado localmente.

## Purga de tombstones e aparelho parado

- **Servidor:** `npm run db:purgar -w @compasso/api`, diário, com o papel dono — única operação
  que atravessa contas, e só apaga o que cada conta excluiu há mais de `TRASH_RETENTION_DAYS`.
- **Aparelho:** depois de cada sincronização bem-sucedida, apaga os tombstones já confirmados
  (`dirty = 0`) mais antigos que a retenção informada pelo servidor no pull.

**Aparelho parado mais de 30 dias.** O servidor pode ter purgado tombstones que ele nunca viu. Sem
tratamento, o item continuaria vivo nele para sempre (e voltaria ao servidor na primeira edição).
Custa pouco evitar: se a última sincronização é mais antiga que a retenção, o pull vira completo
(sem cursor) e as linhas limpas que o servidor não tem mais são removidas. Linhas sujas nunca são
removidas — são edições que o usuário fez e vão no push, que roda antes.

## O que precisa do aparelho real

O roteiro do critério de saída (issue #25) — modo avião, três criados, um editado, um excluído,
religar e conferir no `psql`; e o mesmo item editado em dois aparelhos — está automatizado nos
testes de integração, mas o critério é no aparelho. A tela provisória na aba Hoje existe para isso:
cria, edita (tocar no título), exclui, mostra `●` nas linhas sujas e a hora da última
sincronização, e sincroniza ao puxar a lista.
