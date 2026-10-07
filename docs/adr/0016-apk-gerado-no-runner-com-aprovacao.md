# ADR-0016: APK gerado no runner, publicado com aprovação de um clique

- **Data:** 2026-10-07
- **Status:** aceito
- **Envolvidos:** Diogo (autor), Claude Code (implementação)
- **Substitui:** a decisão 2 do [ADR-0013](0013-atualizacoes-do-app-pelo-proprio-servidor.md),
  na parte do APK ("o APK continua manual")

## Contexto

Desde o ADR-0013, a OTA sai sozinha a cada push na `main`, mas o APK é gerado à mão
(`npm run apk:publicar`) porque o build nativo rodava só na máquina do autor, onde está a chave
de assinatura. Quando um commit muda algo nativo, o job `publicar-ota` só avisa "gere e publique
o APK". A mudança fica parada até alguém rodar o script.

Foi o que aconteceu no merge do widget da semana
([ADR-0015](0015-widget-da-semana-no-android.md)): o runtime do commit (`f151839…`) já não batia
com o do APK 0.3.0 (`846e9c1…`), e nada chegou aos celulares. O autor quer que o APK também seja
gerado e distribuído automaticamente quando for preciso.

Restrições que continuam valendo:

- O Android nunca instala uma atualização fora da loja sem o toque de quem usa.
- O APK só atualiza por cima de outro com a mesma chave e `versionCode` maior.
- O repositório é público, e o runner self-hosted não pode rodar código de `pull_request`
  (ADR-0011).

## Decisões

**1. A chave de assinatura fica no servidor de casa** (decisão do autor, com o risco aceito). O
keystore e as senhas ficam só no disco do runner: `~/compasso/chave/` e `~/.gradle/gradle.properties`
com permissão `600`. Nunca vão para GitHub Secrets nem para o repositório. A cópia da máquina do
autor continua existindo: o backup do servidor não tem cópia externa (ADR-0010), e perder a chave
impede para sempre atualizar o app instalado.

**2. O runner gera o APK quando o runtime muda** (job `gerar-apk` do `app.yml`, depois do
`verificar`). O job calcula o fingerprint do commit e compara com o runtime do APK publicado:

- Igual: termina em segundos e o `publicar-ota` segue como antes.
- Diferente: faz prebuild e build de release (arm64-v8a) e confere que o runtime embutido no APK
  é o do commit. Grava o APK e um `pendente.json` em `~/compasso/apk-pendente/<commit>/` e sobe o
  APK como artefato do run (3 dias), para instalar e testar.

Build e OTA rodam na mesma máquina e no mesmo checkout, então o fingerprint concorda por
construção. O cuidado de Windows × Linux do ADR-0013 (decisão 4) fica só para quem gerar à mão.

**3. A publicação espera um clique do autor** (decisão do autor). O job `publicar-apk` usa o
environment `apk`, com o autor como revisor obrigatório. O GitHub para o job até o "Approve".

- O primeiro passo do job confere, pela API do GitHub, que o environment exige revisor. Se alguém
  apagar a regra, o job falha em vez de publicar sem aprovação.
- Um APK mais novo esperando aprovação cancela o anterior (`concurrency` com
  `cancel-in-progress`), que ficou velho.
- Na publicação, o script confere que ninguém publicou outro APK depois da geração. Se publicou,
  recusa e pede para rodar o workflow de novo.
- A cópia para `releases/` segue igual à de antes: nomes provisórios e rename atômico, com o APK
  primeiro, o manifesto depois e a novidade por último.

Enquanto a aprovação espera, os pushes seguintes também têm runtime novo e geram APK (que já leva
o JS deles). Nenhum OTA sai para um runtime sem APK no ar.

**4. Versão sem commit de volta na `main`.** O `app.json` guarda a versão que o autor quer (0.4.0,
0.5.0…). O `versao-apk.mjs` calcula a final:

- `versionCode` = maior entre o do `app.json` e o publicado + 1.
- `versionName` = a do `app.json`, se for maior que a publicada; senão, o patch seguinte ao
  publicado (0.4.0 → 0.4.1).

O build recebe a versão por `COMPASSO_VERSION_NAME` e `COMPASSO_VERSION_CODE`, que o
`app.config.js` aplica sobre o `app.json`.

Para isso não mudar o runtime, a versão sai do fingerprint: `sourceSkips: ExpoConfigVersions` no
`fingerprint.config.js`. Antes ela entrava no hash, e um APK com versão injetada nunca casaria
com o OTA calculado sem ela.

**5. Texto e obrigatoriedade sem argumento de linha de comando.**

- As novidades continuam vindo dos trailers `Novidade:` (ADR-0014). Sem nenhum no intervalo, vai
  "Melhorias e correções" (decisão do autor) e o resumo do job avisa.
- O trailer `Atualizacao-obrigatoria: sim` em algum commit do intervalo faz desse APK o mínimo
  para usar o app (`minimoVersionCode`). Sem ele, mantém o mínimo anterior.
- `--notas` e `--minimo` seguem valendo no caminho manual.

**6. O caminho manual continua de reserva.** `npm run apk:publicar` na máquina do autor gera e
envia por SSH como antes, agora com a mesma versão automática, o mesmo texto padrão e o mesmo
trailer de obrigatoriedade. Os dois caminhos usam o mesmo código (`publicar-apk.mjs`: modos
`--gerar`, `--publicar` e manual).

**7. A OTA continua sem code signing** (ADR-0013, decisão 5). Com a chave do APK no mesmo servidor
que serve os arquivos, assinar o bundle ali não protegeria contra quem já está dentro dele.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Continuar manual (ADR-0013) | Mudança nativa fica parada até o autor lembrar de rodar o script; o autor quer automático |
| Publicar sem aprovação | O que entra na `main` iria para os amigos sem ninguém instalar antes; o autor preferiu um clique |
| Build no runner do GitHub (`ubuntu-latest`) com a chave em GitHub Secrets | Chave numa plataforma de terceiros e o APK teria de ser enviado ao servidor por SSH a partir do GitHub, abrindo uma porta de entrada; o runner da casa já escreve direto em `releases/` |
| EAS Build | Conta externa, recusada desde o ADR-0008 |
| Versão subida por commit automático do runner | Commit de bot na `main` dispara o workflow de novo e briga com os pushes do autor |
| Versão no fingerprint, injetada também no cálculo do OTA | O OTA teria de adivinhar a versão do APK publicado; tirar a versão do hash é o correto, porque ela não muda nada nativo |

## Consequências

- **Risco aceito:** quem invadir o servidor de casa consegue assinar um APK que os celulares
  aceitam como atualização legítima (com o toque de quem usa). Antes, isso exigia a máquina do
  autor.
- O servidor precisa de JDK 17–23, Android SDK (platform 36, build-tools 36.0.0, NDK
  27.1.12297006, CMake) e uns 10 GB de disco. No runner o build roda com 2 GB de heap e 2 tarefas
  por vez (~3–4 GB de RAM no total): com os 4 GB do plugin e uma tarefa por núcleo, o primeiro
  build (2026-10-07) esgotou RAM e swap do servidor e não terminou em 1 h. O passo a passo está
  no `docs/deploy.md`.
- O runner é um só. Um build de APK (estimativa: 30–60 min com o limite, a confirmar) atrasa o
  deploy da API que vier atrás.
- O APK assinado fica como artefato do run por 3 dias, visível para quem acessa o repositório
  público. É o mesmo arquivo que vai para os amigos, sem segredo dentro.
- Tirar a versão do fingerprint mudou o hash uma vez; essa mudança vai no mesmo APK do widget.
  Daqui em diante, subir a versão no `app.json` não muda mais o runtime.
- Se outro runner com o label `compasso` for registrado, `gerar-apk` e `publicar-apk` podem cair
  em máquinas diferentes e o pendente não seria encontrado (o job falha, nada vai ao ar). Hoje há
  um só.
