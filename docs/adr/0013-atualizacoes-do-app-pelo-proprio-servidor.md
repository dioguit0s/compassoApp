# ADR-0013: Atualizações do app pelo próprio servidor (APK + OTA)

- **Data:** 2026-09-29
- **Status:** aceito
- **Envolvidos:** Diogo (autor), Claude Code (implementação)
- **Complementa:** [ADR-0008](0008-senha-propria-convite-e-sessao-por-aparelho.md), decisão 9

## Contexto

Desde a F10 o app chega aos amigos como APK gerado na máquina do autor (ADR-0008, decisão 9), sem
loja e sem EAS. Cada versão nova obrigava a mandar o arquivo e pedir que todos instalassem à mão.
O autor quer compartilhar o app sem esse passo manual.

Há dois tipos de mudança. As **só de JS e assets** (telas, regras, textos) são a maioria e podem
chegar pela rede. As **nativas** (módulo novo, permissão, versão do Expo ou do React Native) só
chegam com APK novo, e um app instalado fora da loja não se atualiza em silêncio: o Android sempre
pede a confirmação de quem usa.

A infraestrutura já existe: a API servida pelo túnel da Cloudflare e um runner self-hosted no
homeserver que faz o deploy a cada push na `main` ([ADR-0011](0011-deploy-em-docker-com-runner-self-hosted.md)).

## Decisões

**1. Duas vias, as duas servidas pela própria API.** A pasta `~/compasso/releases` do servidor é
montada somente leitura no container (`RELEASES_DIR`), no mesmo padrão de `/avatares`. As rotas
são públicas, porque quem está deslogado também precisa atualizar e nada ali é dado pessoal.

- **APK** (`GET /app/android`, `GET /app/android/:arquivo`): o manifesto `android.json` diz qual é
  o APK mais recente. Na abertura, e ao voltar para o app, ele compara com o `versionCode`
  instalado, oferece "Atualizar", baixa, confere tamanho e md5 e abre o instalador do Android. A
  autenticidade é da assinatura: o Android recusa atualizar com APK assinado por outra chave.
  `minimoVersionCode` torna a atualização obrigatória (o diálogo fica sem "Depois"), para quando a
  API mudar de um jeito que quebra versões antigas.
- **OTA** (`GET /updates/manifest`, `GET /updates/assets/...`): servidor próprio do protocolo
  `expo-updates` v1, no molde do `custom-expo-updates-server` da Expo. O app baixa o bundle novo
  em segundo plano na abertura (`fallbackToCacheTimeout: 0`, nunca atrasa o início) e aplica na
  abertura seguinte, ou na hora, se a pessoa tocar em "Reiniciar". O manifesto é montado pela API
  a partir da saída do `expo export`, com os hashes em cache por publicação. Toda a lógica do
  protocolo fica na API, coberta por testes.

**2. O OTA sai automático a cada push na `main`** (decisão do autor). O workflow `app.yml` roda
`ota.mjs` no runner, que exporta o bundle e o grava em `releases/ota/<runtime>/<instante-commit>/`
(cópia com nome provisório e rename atômico). O APK continua manual (`npm run apk:publicar`),
porque o build nativo roda só na máquina do autor, onde está a chave. O script recusa árvore suja,
chave de debug e `versionCode` que não seja maior que o publicado, e envia por `scp` com `mv`
atômico no fim.

**3. Compatibilidade pelo fingerprint nativo.** `runtimeVersion` usa a policy `fingerprint`: o hash
de tudo o que é nativo (dependências com código nativo, config do Expo, config plugins). Um bundle
só é servido a um APK com o mesmo runtime. O runner só publica OTA para o runtime do APK
publicado. Se o commit mudou algo nativo, pula e avisa no resumo do job: "gere e publique o APK".
O `apk:publicar` confere que o runtime embutido no APK (`assets/fingerprint`) é o mesmo que o
fingerprint do commit.

**4. `fingerprint.config.js` para o hash ser igual no Windows e no Linux.** O spike de 2026-09-29
mostrou hashes diferentes para o mesmo commit (Windows `a437fdc…`, Linux `725a5b2…`), por dois
motivos:
- O `@expo/fingerprint` 0.20 compara caminhos com `\` contra padrões com `/`. No Windows passavam
  os módulos JS de `node_modules` carregados pelo config plugin e as pastas `android/build` de
  pacotes já compilados.
- O plugin do React Native para o Gradle reescreve o `AndroidManifest.xml` de bibliotecas dentro de
  `node_modules` durante o build: o `@react-native-masked-view` perdeu o atributo `package`.

A config ignora, só dentro de `node_modules`, os `*.js`, as pastas `android/build` e os
`android/src/main/AndroidManifest.xml`, com padrões sem `**` na frente, que casam nos dois
sistemas. O que decide a compatibilidade nativa continua no hash: o código nativo e o
`package.json` (versão) de cada pacote, a config do Expo e os plugins locais. O JS dos pacotes vai
no bundle, que é justamente o que o OTA troca. Com a config, Windows e Linux (container `node:22`
com `npm ci`) deram o mesmo hash.

**5. Sem code signing no OTA.** Com a publicação no runner, a chave privada ficaria no mesmo
servidor que serve os arquivos e só protegeria o trecho que o HTTPS já protege. O `expo-updates`
tem suporte nativo; se a publicação um dia sair do servidor, dá para ligar.

**6. Reverter republica.** O `expo-updates` roda a atualização mais recente (pelo `createdAt`) que
já baixou. Por isso tirar a nova do ar não basta. O `ota:reverter` move a publicação mais recente
para `releases/ota-revertidas/` e republica a anterior com instante novo (o id da publicação
depende também do nome da pasta, então vira atualização nova). Sem anterior, a API responde
`rollBackToEmbedded` a quem roda um OTA, e o app volta ao bundle que veio no APK.

**7. O APK de teste (`COMPASSO_PERMITIR_HTTP=1`) sai com o `expo-updates` desligado**, para nunca
puxar o bundle de produção sobre um build apontado para a API local.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| EAS Update (OTA hospedado pela Expo) | Conta externa, o que o ADR-0008 recusou; o servidor próprio cabe no que já existe |
| Google Play, faixa de teste interno | Conta de desenvolvedor, AAB e convite por pessoa; o ADR-0008 decidiu "sem loja" |
| APK no GitHub Releases + Obtainium | Cada amigo instala e configura mais um app, e nenhuma mudança de JS chega sozinha |
| Só o atualizador de APK | Cada correção pequena custaria download de dezenas de MB e um toque em "Instalar" |
| OTA publicado à mão, assinado na máquina do autor | Mais seguro contra servidor invadido, mas o autor preferiu o automático no push |
| Runtime pela policy `appVersion` | Depende de lembrar de subir a versão a cada mudança nativa; esquecer quebra o app dos amigos |

## Consequências

- O APK 0.3.0, que traz o atualizador e o `expo-updates`, ainda precisa ser instalado à mão uma
  vez. Daí em diante as duas vias são automáticas.
- **Todo push na `main` que muda o bundle vai direto para o celular dos amigos.** O job `verificar`
  (lint, typecheck e testes do core) roda antes, mas não substitui testar no aparelho: o que não
  pode ir para eles não vai para a `main`.
- Uma publicação que trouxe migração do SQLite (`drizzle/`) não pode ser revertida para um bundle
  anterior à migração. O bundle antigo não conhece o banco migrado; corrige-se para frente.
- Quem não instalar o APK novo continua com a última atualização OTA do runtime dele, mas não
  recebe outras. O runner guarda as 5 publicações mais recentes do runtime atual e só a última de
  cada runtime antigo: apagar essa faria a API mandar o app de volta ao bundle original do APK
  (`rollBackToEmbedded`).
- Atualizar o `@expo/fingerprint` (junto com o Expo) pode fazer Windows e Linux divergirem de
  novo. O sintoma é o job `publicar-ota` pular com "mudança nativa" logo depois de um
  `apk:publicar`, mostrando os dois hashes no resumo. Aí é preciso repetir a comparação do spike.
