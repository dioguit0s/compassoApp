# Desenvolvimento

Como rodar, testar e evoluir o Compasso localmente. Decisões de ferramenta estão no
[ADR-0002](adr/0002-ferramentas-e-convencoes-da-fundacao.md); deploy e backup em
[`deploy.md`](deploy.md).

## Pré-requisitos

- Node.js 22+ (o npm que vem com ele gerencia os workspaces)
- Docker, **só** para o PostgreSQL de desenvolvimento. Os testes não precisam dele: sobem um
  PostgreSQL descartável sozinhos (`embedded-postgres`)
- Para o app: Android Studio e/ou Xcode, e um aparelho (ver [App](#app))

## Primeiros passos

```sh
npm install                          # instala os três pacotes
npm run lint && npm run typecheck && npm test

docker compose up -d                 # PostgreSQL 17 com os papéis compasso_owner e compasso_app
cp apps/api/.env.example apps/api/.env
npm run db:migrate -w @compasso/api  # banco vazio → schema atual
npm run conta:criar -w @compasso/api -- "Seu Nome"   # imprime o userId e o token uma vez
npm run conta:acesso -w @compasso/api -- <userId> voce@exemplo.com   # e-mail + senha temporária
npm run dev -w @compasso/api         # http://localhost:3000
curl -H "Authorization: Bearer <token>" localhost:3000/me
```

### Contas, convites e senhas (F10)

Tudo pelo papel dono ([ADR-0008](adr/0008-senha-propria-convite-e-sessao-por-aparelho.md)). Os
segredos aparecem **uma vez** na saída.

| Comando (`-w @compasso/api --`) | Faz |
|---|---|
| `convite:criar "nota" [dias]` | Código de convite de uso único (padrão 7 dias). Mande à pessoa com o endereço do servidor |
| `convite:listar` | Convites abertos, usados (por quem) e vencidos |
| `conta:acesso <userId\|e-mail> [e-mail]` | Define e-mail e gera senha temporária. Serve para dar senha à conta criada por script e para "esqueci a senha" |
| `conta:criar "Nome"` / `conta:token <userId> "rótulo"` | Conta e token sem senha (desenvolvimento) |

Sessão perdida (aparelho roubado): a pessoa troca a senha em outro aparelho — isso revoga as outras
sessões. Sem outro aparelho: `conta:acesso` e depois a troca.

## Estrutura

```
apps/api         API Node (Hono + Drizzle + node-postgres)
  drizzle/       migrações versionadas — geradas, nunca editadas depois de commitadas
  scripts/       bootstrap dos papéis, migração, criação de conta, purga, backup
  src/db/        ÚNICO lugar que fala com o banco: schema, repositórios, admin
apps/mobile      app Expo (development build), SQLite local
  drizzle/       migrações do SQLite, aplicadas na abertura do app
packages/core    lógica pura, sem Node nem React Native: IDs, datas, validação, sync, (F3) RRULE, (F6) XP
  src/local/     schema do SQLite do aparelho
```

## Banco

### Papéis

| Papel | Quem usa | Sujeito ao RLS |
|---|---|---|
| `compasso_owner` | migrações, contas e convites, purga de tombstones, backup | não (dono das tabelas) |
| `compasso_app` | a API em execução | **sim** |

A API conecta com `DATABASE_URL` (papel `compasso_app`). Scripts usam `DATABASE_ADMIN_URL`
(papel `compasso_owner`). A API em execução nunca lê `DATABASE_ADMIN_URL`.

### Fluxo de mudança de schema

1. Alterar `apps/api/src/db/schema.ts`
2. `npm run db:generate -w @compasso/api -- --name descricao-curta` → gera `drizzle/NNNN_*.sql`
3. Se precisar de SQL que o Drizzle não expressa (GRANT, função, trigger):
   `npm run db:generate -w @compasso/api -- --custom --name descricao-curta` e escrever o SQL
4. `npm run db:migrate -w @compasso/api` — aplica as pendentes
5. Commitar o SQL e `drizzle/meta/` juntos

Nunca usar `drizzle-kit push`: o schema chega ao banco só por migração versionada.

### Checklist de tabela nova

Toda tabela nova do servidor segue estes passos, na mesma migração ou em migrações do mesmo commit:

- [ ] coluna `user_id uuid not null` com FK para `users` e índice (exceto `users`, cujo dono é o `id`)
- [ ] `pgPolicy` no `schema.ts`, `to: papelApp`, com `using` **e** `withCheck` comparando
      `user_id = app_user_id()` — o Drizzle gera o `ENABLE ROW LEVEL SECURITY`
- [ ] migração customizada com `GRANT SELECT, INSERT, UPDATE ON <tabela> TO compasso_app` —
      **nunca** `DELETE`
- [ ] se for sincronizável: `deleted_at`, `updated_at` (relógio do client, para LWW) e
      `server_updated_at` com o trigger `carimbar_servidor` (relógio do servidor, para o cursor)
- [ ] acesso só pelo repositório escopado em `src/db/repositorios.ts`
- [ ] `npm test -w @compasso/api` — o teste `rls.test.ts` falha se a tabela ficar sem RLS ou sem política

## App

O app roda em **development build**, nunca no Expo Go (alarme exato do Android 12+ e tarefas de
background não existem no Expo Go — roadmap §6).

**Atalho no Expo Go:** para mexer em telas sem compilar, `npm run start:go` (dentro de
`apps/mobile`) serve o app para o Expo Go. Nele, lembretes e tarefa de background ficam desligados
(`NO_EXPO_GO` em `src/notificacoes.ts`) e o Perfil avisa "Indisponíveis no Expo Go". Qualquer coisa
que envolva notificação ou background se testa no development build.

### Gerar e instalar um build

Com Android Studio (SDK + um aparelho em modo depurador USB) ou Xcode:

```sh
cd apps/mobile
npx expo run:android --device     # compila o projeto nativo e instala no aparelho
npx expo run:ios --device
npm start                         # servidor do Metro para o development build (recarga de código)
```

Sem máquina com SDK nativo, o EAS Build compila na nuvem: `npx eas build --profile development`
(exige conta Expo e um `eas.json`, que ainda não existe no repositório).

Um build novo **não** apaga o SQLite: as migrações locais (`apps/mobile/drizzle/`) rodam na
abertura e são aditivas.

### Primeira abertura

A aba Perfil pede a URL da API (a do túnel, ou `http://<ip-da-máquina>:3000` em desenvolvimento) e
e-mail e senha — ou, em "Tenho um convite", o código, o nome, o e-mail e uma senha nova. A URL e o
token de sessão devolvido vão para o `expo-secure-store`. A partir daí, cada abertura tenta
`GET /me`, grava no SQLite e a tela lê sempre do SQLite — sem rede, mostra o que já estava gravado.

Se o servidor responder `401` (sessão revogada), o app esquece só o token: os dados e a URL ficam,
o indicador mostra "sessão encerrada" e o Perfil volta a pedir a senha. Entrar com **outra** conta
apaga os dados locais antes.

### APK para os amigos

```sh
npm run apk -w @compasso/mobile                           # → apps/mobile/dist/compasso-<versão>.apk
COMPASSO_PERMITIR_HTTP=1 npm run apk -w @compasso/mobile  # → …-http.apk, só para testar contra a API local
```

Mesmo ambiente do development build (JDK 17–23, ver [Emulador Android](#emulador-android)). O
script roda o prebuild (a pasta `android/` é regenerada) e o `assembleRelease`. O release só fala
**HTTPS**; o `-http` aceita `http://` e não deve ser distribuído.

**Chave de assinatura — uma vez, e guarde bem.** O Android só instala uma atualização por cima se a
chave for a mesma; perdê-la obriga cada amigo a desinstalar (e perder os dados locais não enviados).

```sh
keytool -genkeypair -v -storetype PKCS12 -keystore ~/compasso-release.keystore -alias compasso -keyalg RSA -keysize 2048 -validity 10000
```

E no `~/.gradle/gradle.properties` (fora do repositório):

```properties
COMPASSO_RELEASE_STORE_FILE=C:/Users/<você>/compasso-release.keystore
COMPASSO_RELEASE_STORE_PASSWORD=...
COMPASSO_RELEASE_KEY_ALIAS=compasso
COMPASSO_RELEASE_KEY_PASSWORD=...
```

Sem essas propriedades o APK sai assinado com a chave de debug e o script avisa. O plugin
`apps/mobile/plugins/apk-release.js` é quem injeta a assinatura no `build.gradle` gerado.

A cada versão distribuída, suba `version` e `android.versionCode` no `app.json`. O Android não
instala versão com `versionCode` menor que a instalada.

Instalar: mande o `.apk` (por mensagem ou link) e a pessoa permite "instalar apps desconhecidos"
para o app por onde abriu o arquivo. Com o aparelho no cabo: `adb install -r <arquivo>.apk`.

### `packages/core` no Metro

O app importa `@compasso/core` e `@compasso/core/local` pelo nome do pacote, igual à API. Desde o
SDK 52 o Expo detecta os workspaces do npm e configura o Metro sozinho; `metro.config.js` só
acrescenta a extensão `.sql` das migrações. Duas regras evitam o problema clássico de React
duplicado:

- `overrides` no `package.json` da raiz fixa `react`, `react-native`, `react-native-reanimated` e
  `react-native-worklets` nas versões do SDK (`node_modules/expo/bundledNativeModules.json`) — sem
  isso, dependências com `peerDependencies: *` puxam outra versão (o expo-router puxava o
  reanimated 4.7, que exige worklets 0.13, e o build Android falhava);
- não configurar `watchFolders`/`nodeModulesPaths` à mão.

Verificação sem aparelho: `npm run export:android -w @compasso/mobile` empacota o bundle Hermes
inteiro, incluindo o core.

### Ponto de entrada

`apps/mobile/index.ts` é o `main`: configura a aleatoriedade do UUIDv7 e importa
`src/notificacoes.ts` (que chama `TaskManager.defineTask`) **antes** do `expo-router/entry`. A
tarefa de background roda sem UI; se a definição morasse só no que as telas importam, o
expo-task-manager não a encontraria. Tarefa nova de background: definir no escopo global de um
módulo importado por `index.ts`.

### Emulador Android

Validado em 2026-09-23 (Windows, AVD Pixel 7, Android 17 com Google APIs):

- **JDK 17–23.** Com JDK 24+ (inclusive o JBR do Android Studio, que hoje é 25), o passo prefab do
  CMake imprime o aviso de acesso nativo do JEP 472 e o AGP trata como erro
  (`configureCMakeDebug … A restricted method in java.lang.System has been called`). Rode o build
  com `JAVA_HOME` apontando para um JDK 23 ou anterior.
- **Memória do AVD.** Com os 2 GB padrão o sistema inteiro dá ANR; suba com
  `emulator -avd <nome> -memory 4096 -cores 6`.
- A máquina é `http://10.0.2.2:3000` no emulador. Para o Metro, `adb reverse tcp:8081 tcp:8081` e
  abrir `compasso://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`.
- O botão flutuante de ferramentas do development build cobre o "Salvar" do cabeçalho; arraste-o.
- SQLite do app (build de depuração): `adb exec-out run-as com.dioguit0s.compasso cat
  files/SQLite/compasso.db > local.db` (copie também `-wal` e `-shm`).
- Forçar a tarefa de background: `adb shell dumpsys jobscheduler | grep dioguit0s` para o id do job
  (muda a cada reinstalação) e `adb shell cmd jobscheduler run -f com.dioguit0s.compasso <id>`,
  com o app em segundo plano.
- Fuso do aparelho: `adb shell service call alarm 3 s16 Europe/Lisbon` (não persiste no reboot).
- `npm run conta:criar -- "Nome Com Espaço"` quebra no npm do Windows (aspas do cmd); use o
  terminal do Git Bash ou um nome sem espaço.
- Checkout no Windows: o `.gitattributes` força LF. Um clone feito antes dele, com
  `core.autocrlf=true`, ainda tem arquivos em CRLF no disco e o prettier falha: reclone, ou
  converta os arquivos listados por `git ls-files --eol | grep w/crlf` para LF.

### Diagnóstico

Perfil → "Diagnóstico de fuso e IDs" formata o mesmo instante em UTC, São Paulo, Tóquio e Nova York
(nos dois lados da mudança de horário de verão) e compara com o valor esperado, e gera três
UUIDv7 com a aleatoriedade do `expo-crypto`. É temporária: sai quando a F2 tiver telas com data.

## Testes

`npm test` na raiz roda o core e a API. A API sobe um PostgreSQL 17 descartável por execução,
reproduz o bootstrap dos papéis e aplica as migrações — sem passo manual. Para apontar para um
servidor existente, defina `TEST_POSTGRES_URL` com um superusuário (o banco `compasso_teste` é
recriado a cada execução).
