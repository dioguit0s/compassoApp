# Tutorial: do zero ao Compasso no dia a dia

Passo a passo para ter a API no homeserver, gerar o APK e usar o app no celular, na ordem em que
se faz. A referência do servidor (esteira, instalação, administração, backup, restauração) está em
[`deploy.md`](deploy.md); o ambiente de build do app, em [`desenvolvimento.md`](desenvolvimento.md).

Tempo estimado: 1 a 2 horas na primeira vez, a maior parte esperando compilação.

---

## Visão geral

```
 Celular (APK)                  Cloudflare                          homeserver (casa)
 ┌─────────────┐  HTTPS  ┌───────────────────────────────┐ túnel  ┌─────────────────────────────┐
 │  Compasso   │ ──────► │ compasso.homelab-server.space │ ◄───── │ cloudflared (container)     │
 │ SQLite local│         └───────────────────────────────┘ (saída)│   └► compasso-api :3000     │
 └─────────────┘                                                  │        └► compasso-postgres │
                                                                  └─────────────────────────────┘
 git push na main ─► GitHub Actions ─► runner self-hosted no homeserver ─► deploy/deploy.sh
```

- **Nenhuma porta aberta no roteador.** O `cloudflared` e o runner abrem conexões de dentro para
  fora; o Cloudflare entrega o HTTPS. O PostgreSQL não publica porta nenhuma.
- **Deploy automático.** Todo push na `main` que toque a API é testado no GitHub e instalado no
  servidor, com volta automática à versão anterior se o `/health` falhar
  ([ADR-0011](adr/0011-deploy-em-docker-com-runner-self-hosted.md)).
- **O app funciona offline.** O servidor é o ponto de encontro entre aparelhos e o dono do backup;
  sem rede, o celular continua usando o SQLite local e sincroniza depois.
- **O APK de release só fala HTTPS.** Por isso o túnel é obrigatório para uso real.

### O que você precisa

| Item | Para quê |
|---|---|
| O homeserver, com Docker e acesso por `ssh luna-dash` | API, banco, backup |
| Acesso de administrador ao repositório no GitHub | runner e configuração do Actions |
| O painel da Cloudflare do domínio `homelab-server.space` | rota do túnel |
| PC com **Android Studio** (o seu Windows) | gerar o APK |
| Celular Android | usar o app |

---

## Parte 1 — Servidor

Siga a **Instalação inicial** do [`deploy.md`](deploy.md#instalação-inicial-uma-vez), nesta ordem:

1. proteger o runner (aprovação obrigatória para PRs de fork, porque o repositório é público);
2. registrar o runner `compasso` (o único passo com `sudo`);
3. escrever `~/compasso/admin.env` e `~/compasso/api.env`;
4. rodar o primeiro deploy pelo Actions;
5. criar a rota `compasso.homelab-server.space` → `http://compasso-api:3000` no painel da
   Cloudflare;
6. pôr o backup no cron.

O passo 7 (convite) é a Parte 2 abaixo.

Ao final, no celular **com o Wi-Fi desligado** (4G/5G), abra
`https://compasso.homelab-server.space/health`. Tem que aparecer `{"ok":true}`.

---

## Parte 2 — Sua conta

O jeito mais simples é o mesmo que os amigos vão usar: um convite.

```sh
ssh luna-dash
cd ~/compasso && docker compose run --rm admin npm run convite:criar -- "minha conta" 7
```

O código (`XXXX-XXXX-XXXX-XXXX`) aparece **uma vez**; anote. Ele vale uma conta, por 7 dias. Você
vai usá-lo no app, na Parte 4.

---

## Parte 3 — Gerar o APK (no seu PC Windows)

### 3.1 Ambiente (uma vez)

1. **Android Studio** com o Android SDK.
2. No **SDK Manager** → SDK Tools: marque **CMake 3.31 ou mais novo**. Com o 3.22 padrão o build
   falha no Windows por causa de caminho longo (foi o que travou o APK da F10).
3. **JDK 17 a 23** (não o 25 que vem no Android Studio): instale um JDK 21, por exemplo, e aponte
   `JAVA_HOME` para ele.
4. Variável `ANDROID_HOME` apontando para o SDK (ex.: `C:\Users\<você>\AppData\Local\Android\Sdk`
   ou onde estiver o seu — aqui é `A:\Android\Sdk`).
5. No repositório: `npm install`.

### 3.2 Chave de assinatura (uma vez — guarde bem)

O Android só instala atualização por cima se a chave for a mesma. Perder a chave obriga a
desinstalar o app (e perder o que não foi sincronizado).

```sh
keytool -genkeypair -v -storetype PKCS12 -keystore C:/Users/<você>/compasso-release.keystore -alias compasso -keyalg RSA -keysize 2048 -validity 10000
```

Crie ou edite `C:\Users\<você>\.gradle\gradle.properties` (fora do repositório):

```properties
COMPASSO_RELEASE_STORE_FILE=C:/Users/<você>/compasso-release.keystore
COMPASSO_RELEASE_STORE_PASSWORD=<senha da keystore>
COMPASSO_RELEASE_KEY_ALIAS=compasso
COMPASSO_RELEASE_KEY_PASSWORD=<senha da chave>
```

Faça uma cópia da `.keystore` e das senhas fora do PC (gerenciador de senhas, pendrive).

### 3.3 Compilar

```sh
npm run apk -w @compasso/mobile
```

O script roda o `expo prebuild` e o `gradlew assembleRelease`. A primeira vez leva de 20 a 40
minutos. No fim:

```
APK: ...\apps\mobile\dist\compasso-0.1.0.apk
```

Se aparecer `AVISO: assinado com a chave de DEBUG`, o `gradle.properties` não foi lido: confira o
caminho e os nomes das propriedades.

---

## Parte 4 — Instalar e configurar no celular

1. Passe o `.apk` para o celular (cabo, Drive, mensagem para você mesmo). Com o cabo e depuração
   USB ligada: `adb install -r apps/mobile/dist/compasso-0.1.0.apk`.
2. Abra o arquivo. O Android pede para permitir **instalar apps desconhecidos** para o app por onde
   você abriu (Arquivos, Drive…). Permita e instale.
3. Abra o Compasso → aba **Perfil** → **Tenho um convite**:
   - **Servidor:** `https://compasso.homelab-server.space`
   - **Convite:** o código da Parte 2
   - **Seu nome**, **e-mail** e uma **senha** (mínimo 8 caracteres)
   - **CRIAR CONTA**
4. Ainda no Perfil, **Ativar lembretes** e aceite a permissão de notificações.
5. Para os lembretes chegarem na hora com o celular parado: Configurações do Android → Apps →
   Compasso → Bateria → **Sem restrições**. (Fabricantes como Xiaomi e Samsung matam apps em
   segundo plano com agressividade.)

### Primeiros passos no app

- **Trazer o Google Calendar:** no Google Calendar (web) → Configurações → Importar e exportar →
  Exportar; descompacte o `.zip`, mande o `.ics` para o celular e use Perfil → Configurações →
  **Importar calendário (.ics)**. Pode repetir: não duplica.
- **Grade da faculdade:** Calendário → **GRADE** → criar semestre → **+ DISCIPLINA** → horários.
- **Recompensas:** aba Recompensas → **+ NOVA**. Recompensa e preço novos valem a partir da
  segunda-feira seguinte.
- **Registrar algo:** botão **+** em qualquer aba. Sem esforço = compromisso; com esforço (1, 2, 3,
  5, 8) = pontua ao concluir.

---

## Parte 5 — Manutenção no dia a dia

### Atualizar o servidor

Não há comando: faça push na `main`. Acompanhe em Actions → **API**; o job `deploy` termina com
`deploy: compasso-api:<commit> no ar`. Se ele falhar no `/health`, a versão anterior volta sozinha
e o log da API aparece no próprio job.

### Atualizar o app

1. No `apps/mobile/app.json`, suba `version` (ex.: `0.1.1`) e `android.versionCode` (+1). O
   Android recusa instalar `versionCode` menor ou igual ao instalado.
2. `npm run apk -w @compasso/mobile` (com a **mesma** chave).
3. Instale o novo `.apk` por cima. Os dados locais ficam.

### Convidar alguém

```sh
ssh luna-dash 'cd ~/compasso && docker compose run --rm -T admin npm run convite:criar -- "nome da pessoa"'
```

Mande o código, o endereço `https://compasso.homelab-server.space` e o `.apk`. `convite:listar`
mostra quem usou.

### Esqueceu a senha (você ou um amigo)

```sh
ssh luna-dash 'cd ~/compasso && docker compose run --rm -T admin npm run conta:acesso -- pessoa@exemplo.com'
```

Imprime uma senha temporária; a pessoa entra com ela e troca em Perfil → Configurações → Trocar senha.

### Backup

Automático às 04:00. Conferir de vez em quando:

```sh
ssh luna-dash 'tail -n 20 ~/compasso/manutencao.log; ls -lh ~/backups/compasso'
```

Os dumps ficam no mesmo disco do servidor (decisão do
[ADR-0010](adr/0010-backup-sem-copia-externa-com-contas-de-amigos.md)). Restaurar: ver
[`deploy.md`](deploy.md#restaurar-backup) — vale fazer um ensaio uma vez, com um dump real.

---

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Job `deploy` fica em "Waiting for a runner" | runner parado ou sem o label `compasso` | Settings → Actions → Runners; no servidor, `cd ~/actions-runner-compasso && sudo ./svc.sh status` |
| Deploy falha com "falta ~/compasso/api.env" | segredos não escritos | passo 3 da instalação no `deploy.md` |
| Deploy falha nas migrações | senha errada no `admin.env` ou banco fora do ar | `cd ~/compasso && docker compose logs postgres` |
| Deploy falha no `/health` e faz rollback | a versão nova não sobe | o log da API está no próprio job; `docker compose logs api` |
| `/health` pelo domínio dá **502** / erro 1033 | rota do túnel errada ou API parada | a rota é `http://compasso-api:3000`, não `localhost`; `docker compose ps` |
| Domínio não resolve | rota ainda não criada no painel | Public Hostname do túnel na Cloudflare |
| App diz "Use o endereço completo" | faltou `https://` | digite `https://compasso.homelab-server.space` |
| App não conecta com `http://…` | o APK de release só aceita HTTPS | use o endereço do túnel |
| Indicador "sessão encerrada" | senha trocada em outro aparelho ou sessão revogada | entre de novo no Perfil |
| APK não instala por cima | chave diferente ou `versionCode` não subiu | mesma keystore e `versionCode` maior |
| Build falha com caminho longo / `ninja` | CMake 3.22 | instale CMake 3.31+ no SDK Manager |
| Build falha com `restricted method in java.lang.System` | JDK 24+ | `JAVA_HOME` num JDK 17–23 |
| Lembrete chega atrasado | economia de bateria | bateria "Sem restrições" para o Compasso |

---

## Checklist final

- [ ] Aprovação obrigatória para workflows de PRs de fork (repositório público)
- [ ] Runner `homeserver-compasso` **Idle** com o label `compasso`
- [ ] `~/compasso/api.env` e `admin.env` com permissão 600
- [ ] Primeiro deploy verde; `docker compose ps` com os dois containers saudáveis
- [ ] Rota do túnel criada; `https://compasso.homelab-server.space/health` abre no 4G
- [ ] Linha do cron criada; um backup manual feito
- [ ] Keystore criada, com cópia guardada fora do PC
- [ ] APK gerado sem o aviso de chave de debug
- [ ] Conta criada pelo convite; lembretes ativados; bateria sem restrições

---

> **O que este tutorial não conseguiu confirmar:** os nomes das opções no painel da Cloudflare
> (Zero Trust → Networks → Tunnels → Public Hostname) e no GitHub (aprovação de PRs de fork) seguem
> a documentação pública e podem mudar; o runner e a rota do túnel dependem do seu login e não
> foram configurados por aqui; o build do APK de release ainda não terminou nesta máquina (falhou
> na F10 por falta do CMake 3.31+).
