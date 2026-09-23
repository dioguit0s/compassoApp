# Handoff: validar o Compasso no emulador

Para uma sessão do Claude Code que tenha **Android Studio (emulador) e Expo** instalados. Escrito em
2026-09-23 por uma sessão sem emulador, que escreveu F0–F8 e só conseguiu verificar por teste,
typecheck e `expo export`. Nenhuma tela foi vista rodando.

## Contexto em 30 segundos

- Código em `claude/dev-roadmap-issues-d913ui` (último commit desta rodada: `7b39b4b`). Leia
  `CLAUDE.md` antes de tudo: commits em português (`tipo: descrição`), `TASKS.md` como checklist,
  parar só para decisão do usuário, ação destrutiva ou contradição com especificação/roadmap/ADR.
- Monorepo npm: `apps/api` (Hono + Drizzle + PostgreSQL), `apps/mobile` (Expo SDK 57, development
  build, SQLite local, offline-first), `packages/core` (lógica compartilhada).
- Fuso fixo de São Paulo em tudo (ADR-0003). Decisões de produto já tomadas: ADR-0003 a ADR-0007.
- `npm run verificar` passa: 130 testes na API, 171 no core. O que falta é **ver o app funcionando**.

## Objetivo desta sessão

1. Subir API + banco, gerar o development build, instalar no emulador Android e conectar.
2. Percorrer o roteiro abaixo, fase por fase, registrando o resultado real (inclusive falhas).
3. Corrigir o que quebrar, com teste quando der, `npm run verificar` antes de cada commit.
4. Entregar um relatório no formato do `CLAUDE.md` (Preciso de você / O que foi feito / Verificação).

**Pronto =** todo item do roteiro marcado como passou, falhou (com causa e correção ou issue) ou
fora de alcance do emulador (com o motivo).

## Preparação

```sh
npm install
npm run verificar                     # linha de base: tem que passar antes de mexer

docker compose up -d                  # PostgreSQL 17 com os papéis
cp apps/api/.env.example apps/api/.env
npm run db:migrate -w @compasso/api
npm run conta:criar -w @compasso/api -- "Teste Emulador"   # imprime o token UMA vez — guarde
npm run dev -w @compasso/api          # http://localhost:3000

cd apps/mobile
npx expo run:android                  # gera android/ (ignorado no git), compila e instala
npm start                             # Metro, se não subiu junto
```

- No emulador Android, a máquina é **`http://10.0.2.2:3000`** (não `localhost`).
- Primeira abertura: aba **Perfil** → URL da API + token.
- HTTP sem TLS: o build de depuração do React Native costuma liberar tráfego em texto puro. Se o
  `GET /me` falhar com erro de rede e a API estiver de pé, suspeite disso primeiro.
- Sem Docker: `TEST_POSTGRES_URL` não serve aqui (é só para testes); instale um PostgreSQL 17 e
  rode `apps/api/scripts/bootstrap-dev.sh`/`bootstrap.sql` para criar os papéis.
- Emulador com **Android 13+** e imagem com Google APIs (notificações e alarme exato).
- Comandos úteis: `adb shell cmd connectivity airplane-mode enable|disable`,
  `adb shell settings put global auto_time 0` + `adb shell date` para mexer no relógio (só com
  root/imagem sem Play Store), `adb shell dumpsys alarm | grep compasso`, `adb logcat *:E`.

## Roteiro

Os critérios de saída vêm de `docs/roadmap.md` §5. Alguns exigem uso real (semana de compromissos,
`.ics` do Google do usuário, grade do semestre de verdade): aqui valide o **mecanismo** com dados
de teste e marque a parte de uso real como pendente para o usuário.

### 0. Riscos que só o aparelho responde (fazer primeiro)

- [ ] **Hermes + `Intl` com `timeZone`**: Perfil → "Diagnóstico de fuso e IDs". Todas as linhas
      precisam bater com o esperado (inclui Nova York nos dois lados do horário de verão). Se
      falhar, quase tudo de data no app está errado — pare e investigue antes do resto.
- [ ] **zod v4 no Hermes**: criar qualquer item; erro de validação deve aparecer como texto, não
      crash.
- [ ] UUIDv7 do diagnóstico: três ids distintos, prefixo crescente.

### F0/F1 — conexão e sync (#14, #25)

- [ ] Abre, autentica, `GET /me` grava no SQLite; fechar, modo avião, reabrir: perfil continua lá.
- [ ] Modo avião: criar 3 itens, editar 1, excluir 1; religar; conferir no banco
      (`psql` com `DATABASE_ADMIN_URL`, tabela `items`) exatamente o estado certo.
- [ ] Convergência LWW com dois clientes: o segundo cliente pode ser `curl` na API
      (`POST /sync/push`) ou um segundo emulador. Mesmo item editado nos dois offline → vence a
      escrita mais recente, nos dois sentidos.
- Fora de alcance: túnel cloudflared e restauração de dump (`docs/deploy.md`) — servidor real.

### F2 — calendário (#36)

- [ ] Hoje, Calendário (mês/semana/dia), evento de dia inteiro de vários dias, evento que cruza a
      meia-noite.
- [ ] **Captura rápida < 3 s** do toque ao item salvo, cronometrada (grave o tempo no relatório).
- [ ] Seletor de data/hora (`@react-native-community/datetimepicker`): o horário escolhido é o que
      aparece salvo, em hora de São Paulo. Troque o fuso do emulador para Lisboa e confira que
      nada muda de hora (ADR-0003).

### F3 — recorrência (#46)

- [ ] Treino semanal + conta mensal. Cancelar uma terça só afeta ela.
- [ ] "Esta e as futuras" não toca no passado.
- [ ] Correções recentes (só verificadas por código — `f92b7e5`):
  - abrir uma ocorrência futura de série já congelada: o seletor de esforço está **livre**;
  - mudar lembrete/disciplina/esforço/dia inteiro numa ocorrência: o alerta **não** oferece
    "Só esta" e explica por quê;
  - concluir uma ocorrência e depois tentar "esta e as futuras" a partir de antes dela: recusa
    pedindo para desfazer a conclusão (adendo do ADR-0004 §5).
- A paridade client × API já é coberta por teste (`apps/api/test/recorrencia.test.ts`).

### F4 — notificações e ICS (#54, marco M3)

- [ ] Permissão de notificação pedida e concedida; tela "Ver lembretes agendados" lista os
      disparos (orçamento 60, horizonte 45 dias — `docs/notificacoes.md`).
- [ ] Lembrete para daqui a 2 min, **modo avião, tela bloqueada**: dispara na hora certa. Repita
      com o app fechado (removido dos recentes).
- [ ] Renomear um item com lembrete agendado: a notificação que dispara tem o título novo.
- [ ] Alarme exato negado (Configurações do Android → Apps → Alarmes e lembretes): o que acontece?
      O app não consegue detectar isso (limitação do expo-notifications) — registre o
      comportamento.
- [ ] Reiniciar o emulador: lembretes continuam agendados (`RECEIVE_BOOT_COMPLETED`).
- [ ] Tarefa de background (`expo-background-task`): no Android dá para forçar com
      `adb shell cmd jobscheduler run -f com.dioguit0s.compasso <id>` — veja o id com
      `adb shell dumpsys jobscheduler | grep compasso`.
- [ ] Importar `apps/api/test/dados/google.ics` pelo seletor de documento (`adb push` para
      `/sdcard/Download`). Reimportar não duplica.
- Pendente para o usuário: o `.ics` real do Google e a semana inteira de lembretes.

### F5 — grade (#63)

- [ ] Semestre corrente, disciplinas, horários; Hoje mostra as aulas certas por dia da semana,
      inclusive sala trocada e aula cancelada.
- [ ] Nenhuma linha de ocorrência de aula no banco (`item_occurrences` sem aulas).
- [ ] "Novo semestre" abre recolhido quando já há semestre; cor padrão de disciplina nova varia
      (correções recentes).

### F6 — gamificação (#76)

- [ ] Concluir credita uma vez; desfazer estorna; radar bate com a soma do ledger
      (`xp_entries` no banco).
- [ ] Concluir no detalhe **não fecha a tela** e o botão vira "Desfazer conclusão".
- [ ] Item do dia corrente recusa edição de esforço na UI e por `PATCH /items/:id` (409).
- [ ] Conclusão offline + religar: crédito uma vez só.

### F7 — economia (#82)

- [ ] Criar recompensa e resgatar no mesmo dia: falha pela carência.
- [ ] Mudar o preço de recompensa nova antes de sincronizar: após o sync o preço novo persiste
      (correção recente de `normalizarPrecos`).
- [ ] Resgatar duas vezes dentro do cooldown: falha mesmo com saldo.
- [ ] Histórico mostra o preço da época.
- Baixar o preço "sem efeito até segunda" depende do relógio do **servidor** (ADR-0007): só dá
  para ver o pendente na tela; o efeito na segunda exige mexer no relógio da máquina da API.

### F8 — perfil e acabamento (#89)

- [ ] Nome de exibição abre preenchido em Configurações (correção recente).
- [ ] Foto de perfil pela galeria (`expo-image-picker`); recorte e envio. Se tiver HEIC à mão,
      teste — o sharp do servidor pode não decodificar (não confirmado).
- [ ] Lixeira: excluir, restaurar.
- [ ] Indicador de sync: sincronizando / erro / offline; hora da última sync em hora de São Paulo.
- [ ] **Sair da conta**: depois, "Ver lembretes agendados" vazio e nenhuma tela mostra dados
      antigos (correção recente: `DELETE` com `WHERE` para disparar os hooks do SQLite).
- [ ] Tema escuro e fonte grande do sistema: nada cortado.

### iOS

Só se houver Xcode (macOS). Senão, marque como fora de alcance. Pontos específicos: modos de
background (`fetch`, `processing`), permissão de notificação, seletor de data nativo.

## Ao terminar

- Atualize `TASKS.md` (seção "Não confirmado" — tire o que foi confirmado, acrescente o que
  achou) e marque no `README.md` o que foi validado.
- Commit por assunto; push para o branch de trabalho indicado na sessão.
- Não feche issues sem o usuário: os critérios de saída com uso real continuam dele.
