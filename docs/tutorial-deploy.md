# Tutorial: do zero ao Compasso no dia a dia

Passo a passo para ter a API rodando no seu servidor, gerar o APK e usar o app no celular. É o
caminho completo, na ordem em que se faz. A referência curta (deploy de atualização, backup,
restauração) continua em [`deploy.md`](deploy.md); o ambiente de build do app, em
[`desenvolvimento.md`](desenvolvimento.md).

Tempo estimado: 1 a 2 horas na primeira vez, a maior parte esperando instalação e compilação.

---

## Visão geral

```
 Celular (APK)                        Cloudflare                     Seu servidor (casa)
 ┌─────────────┐   HTTPS    ┌──────────────────────┐  túnel   ┌──────────────────────────────┐
 │  Compasso   │ ─────────► │ compasso.seu-dominio │ ◄─────── │ cloudflared                  │
 │ SQLite local│            └──────────────────────┘ (saída)  │   └► Nginx :8080 (localhost) │
 └─────────────┘                                              │        ├► /avatares/ (disco) │
                                                              │        └► API Node :3000     │
                                                              │             └► PostgreSQL    │
                                                              └──────────────────────────────┘
```

- **Nenhuma porta aberta no roteador.** O `cloudflared` abre a conexão de dentro para fora; o
  Cloudflare entrega o HTTPS. O PostgreSQL só escuta em `localhost`.
- **O app funciona offline.** O servidor é o ponto de encontro entre aparelhos e o dono do backup;
  sem rede, o celular continua usando o SQLite local e sincroniza depois.
- **O APK de release só fala HTTPS.** Por isso o túnel (ou outro HTTPS) é obrigatório para uso real.

### O que você precisa

| Item | Para quê |
|---|---|
| Servidor Linux sempre ligado (este tutorial assume **Debian 12 ou Ubuntu 24.04**) | API, banco, backup |
| Um **domínio** com o DNS no Cloudflare (plano gratuito basta) | endereço HTTPS fixo do túnel |
| PC com **Android Studio** (o seu Windows) | gerar o APK |
| Celular Android | usar o app |

Convenção: `seu-dominio` é o domínio que você tem no Cloudflare; o app vai ficar em
`https://compasso.seu-dominio`. Comandos com `$` à frente não levam o `$`.

---

## Parte 0 — Publicar o código que vai para o servidor

O servidor clona o repositório do GitHub (`main`). O redesign está só no branch local
`feat/redesign`, que ainda não foi enviado. Antes de começar, no seu PC:

```sh
git checkout main
git merge --ff-only feat/redesign
git push origin main
```

(Ou abra um PR de `feat/redesign` e faça o merge por lá.) O APK é gerado da sua cópia local, mas
servidor e app devem estar na mesma versão.

---

## Parte 1 — Preparar o servidor

Tudo nesta parte roda no servidor, com um usuário que tem `sudo`.

### 1.1 Pacotes do sistema

```sh
sudo apt update
sudo apt install -y git curl nginx postgresql ufw
```

O `postgresql` do Debian 12 é o 15 e o do Ubuntu 24.04 é o 16. O projeto foi testado com 16 e 17;
no Debian 12, instale o 17 pelo repositório oficial (apt.postgresql.org) se quiser a mesma versão
dos testes.

### 1.2 Node.js 22

A unit do systemd chama `/usr/bin/npm`, que é onde o pacote do NodeSource instala:

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # v22.x
```

### 1.3 Usuário e código

```sh
sudo useradd --system --create-home --shell /bin/bash compasso
sudo mkdir -p /opt/compasso && sudo chown compasso: /opt/compasso
sudo -u compasso git clone https://github.com/dioguit0s/compassoApp.git /opt/compasso
```

Pastas que a API e o backup vão escrever:

```sh
sudo mkdir -p /var/lib/compasso/avatares /var/backups/compasso
sudo chown compasso: /var/lib/compasso/avatares /var/backups/compasso
```

### 1.4 Firewall

A API escuta em todas as interfaces na porta 3000; ninguém de fora deve alcançá-la. Libere só o
SSH (o túnel é conexão de saída e não precisa de porta):

```sh
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
```

---

## Parte 2 — Banco de dados

### 2.1 Duas senhas fortes

```sh
openssl rand -base64 24   # senha do compasso_owner (migrações, contas, backup)
openssl rand -base64 24   # senha do compasso_app (a API em execução)
```

Guarde as duas num gerenciador de senhas. Evite senhas com `@`, `/` ou `:` (elas entram numa URL);
se aparecerem, gere de novo.

### 2.2 Papéis e banco

```sh
sudo -u postgres psql \
  -v senha_dono="'<senha do owner>'" \
  -v senha_app="'<senha do app>'" \
  -f /opt/compasso/apps/api/scripts/bootstrap.sql
```

Cria `compasso_owner` (dono das tabelas), `compasso_app` (sujeito ao RLS) e o banco `compasso`.
Conferir que o PostgreSQL escuta só localmente (é o padrão do pacote):

```sh
sudo ss -tlnp | grep 5432    # deve mostrar 127.0.0.1:5432 (e ::1), nunca 0.0.0.0
```

---

## Parte 3 — Configuração da API

### 3.1 O `.env`

```sh
sudo -u compasso cp /opt/compasso/apps/api/.env.example /opt/compasso/apps/api/.env
sudo -u compasso chmod 600 /opt/compasso/apps/api/.env
sudo -u compasso nano /opt/compasso/apps/api/.env
```

Valores de produção:

```ini
DATABASE_URL=postgres://compasso_app:<senha do app>@localhost:5432/compasso
DATABASE_ADMIN_URL=postgres://compasso_owner:<senha do owner>@localhost:5432/compasso
PORT=3000
TZ_DEFAULT=America/Sao_Paulo
TRASH_RETENTION_DAYS=30
SYNC_CURSOR_WINDOW_SECONDS=60
AVATAR_DIR=/var/lib/compasso/avatares
AVATAR_MAX_BYTES=5242880
```

### 3.2 O `.pgpass` (senha do backup)

```sh
sudo -u compasso bash -c 'echo "localhost:5432:compasso:compasso_owner:<senha do owner>" > ~/.pgpass && chmod 600 ~/.pgpass'
```

---

## Parte 4 — Instalar, migrar e testar na mão

```sh
sudo -u compasso bash -c 'cd /opt/compasso && npm ci'
sudo -u compasso bash -c 'cd /opt/compasso && npm run db:migrate -w @compasso/api'
```

Teste rápido antes de virar serviço:

```sh
sudo -u compasso bash -c 'cd /opt/compasso/apps/api && npm start' &
sleep 5 && curl localhost:3000/health    # {"ok":true}
kill %1
```

Se o `curl` falhar, o erro aparece no terminal (quase sempre é senha errada no `.env`).

---

## Parte 5 — Serviços (API sempre no ar + backup diário)

```sh
sudo cp /opt/compasso/deploy/compasso-api.service \
        /opt/compasso/deploy/compasso-manutencao.service \
        /opt/compasso/deploy/compasso-manutencao.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now compasso-api compasso-manutencao.timer
```

Conferir:

```sh
systemctl status compasso-api          # active (running)
curl localhost:3000/health             # {"ok":true}
journalctl -u compasso-api -n 50       # log da API
```

O timer faz o backup (`pg_dump`, mantém 7) e a purga da lixeira todo dia às 04:00. Rode uma vez
agora para ver funcionando:

```sh
sudo systemctl start compasso-manutencao && ls -lh /var/backups/compasso
```

---

## Parte 6 — Nginx

O túnel aponta para o Nginx (fotos de perfil servidas do disco; o resto vai para a API):

```sh
sudo cp /opt/compasso/deploy/nginx.conf.example /etc/nginx/sites-available/compasso
sudo ln -s /etc/nginx/sites-available/compasso /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
curl localhost:8080/health             # {"ok":true}
```

O site escuta só em `127.0.0.1:8080`; não conflita com o site padrão do Nginx.

---

## Parte 7 — Cloudflare Tunnel (o HTTPS público)

### 7.1 Domínio no Cloudflare

No painel do Cloudflare: **Add a site** → seu domínio → plano Free → troque os nameservers no
registrador pelos que o Cloudflare indicar. Espere o domínio ficar **Active**.

### 7.2 Instalar e criar o túnel

Instale o `cloudflared` pelo repositório do Cloudflare (instruções atuais em
<https://pkg.cloudflare.com/>, seção cloudflared). Depois, com o seu usuário:

```sh
cloudflared tunnel login                         # abre um link; escolha o domínio
cloudflared tunnel create compasso               # imprime o UUID e cria ~/.cloudflared/<UUID>.json
cloudflared tunnel route dns compasso compasso.seu-dominio
```

### 7.3 Configuração do serviço

O serviço do sistema lê de `/etc/cloudflared/`:

```sh
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/<UUID>.json /etc/cloudflared/
sudo nano /etc/cloudflared/config.yml
```

```yaml
tunnel: compasso
credentials-file: /etc/cloudflared/<UUID>.json

ingress:
  - hostname: compasso.seu-dominio
    service: http://localhost:8080
  - service: http_status:404
```

(É o [`deploy/cloudflared-config.yml.example`](../deploy/cloudflared-config.yml.example) com o
caminho do serviço.) Instalar e subir:

```sh
sudo cloudflared service install
sudo systemctl status cloudflared      # active (running)
```

### 7.4 Teste de fora

No celular, **com o Wi-Fi desligado** (4G/5G), abra `https://compasso.seu-dominio/health` no
navegador. Tem que aparecer `{"ok":true}`. Se aparecer, o servidor está pronto.

---

## Parte 8 — Sua conta

O jeito mais simples é o mesmo que os amigos vão usar: um convite.

```sh
sudo -u compasso bash -c 'cd /opt/compasso && npm run convite:criar -w @compasso/api -- "minha conta" 7'
```

O código (`XXXX-XXXX-XXXX-XXXX`) aparece **uma vez**; anote. Ele vale uma conta, por 7 dias. Você
vai usá-lo no app, na Parte 10.

---

## Parte 9 — Gerar o APK (no seu PC Windows)

### 9.1 Ambiente (uma vez)

1. **Android Studio** com o Android SDK.
2. No **SDK Manager** → SDK Tools: marque **CMake 3.31 ou mais novo**. Com o 3.22 padrão o build
   falha no Windows por causa de caminho longo (foi o que travou o APK da F10).
3. **JDK 17 a 23** (não o 25 que vem no Android Studio): instale um JDK 21, por exemplo, e aponte
   `JAVA_HOME` para ele.
4. Variável `ANDROID_HOME` apontando para o SDK (ex.: `C:\Users\<você>\AppData\Local\Android\Sdk`
   ou onde estiver o seu — aqui é `A:\Android\Sdk`).
5. No repositório: `npm install`.

### 9.2 Chave de assinatura (uma vez — guarde bem)

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

### 9.3 Compilar

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

## Parte 10 — Instalar e configurar no celular

1. Passe o `.apk` para o celular (cabo, Drive, mensagem para você mesmo). Com o cabo e depuração
   USB ligada: `adb install -r apps/mobile/dist/compasso-0.1.0.apk`.
2. Abra o arquivo. O Android pede para permitir **instalar apps desconhecidos** para o app por onde
   você abriu (Arquivos, Drive…). Permita e instale.
3. Abra o Compasso → aba **Perfil** → **Tenho um convite**:
   - **Servidor:** `https://compasso.seu-dominio`
   - **Convite:** o código da Parte 8
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

## Parte 11 — Manutenção no dia a dia

### Atualizar o servidor (a cada versão nova no `main`)

```sh
sudo -u compasso bash -c 'cd /opt/compasso && git pull --ff-only && npm ci && npm run db:migrate -w @compasso/api'
sudo systemctl restart compasso-api
curl https://compasso.seu-dominio/health
```

### Atualizar o app

1. No `apps/mobile/app.json`, suba `version` (ex.: `0.1.1`) e `android.versionCode` (+1). O
   Android recusa instalar `versionCode` menor ou igual ao instalado.
2. `npm run apk -w @compasso/mobile` (com a **mesma** chave).
3. Instale o novo `.apk` por cima. Os dados locais ficam.

### Convidar alguém

```sh
sudo -u compasso bash -c 'cd /opt/compasso && npm run convite:criar -w @compasso/api -- "nome da pessoa"'
```

Mande o código, o endereço `https://compasso.seu-dominio` e o `.apk`. `convite:listar` mostra quem
usou.

### Esqueceu a senha (você ou um amigo)

```sh
sudo -u compasso bash -c 'cd /opt/compasso && npm run conta:acesso -w @compasso/api -- pessoa@exemplo.com'
```

Imprime uma senha temporária; a pessoa entra com ela e troca em Perfil → Configurações → Trocar senha.

### Backup

Automático às 04:00. Conferir de vez em quando:

```sh
journalctl -u compasso-manutencao -n 20
ls -lh /var/backups/compasso
```

Os dumps ficam no mesmo disco do servidor (decisão do
[ADR-0010](adr/0010-backup-sem-copia-externa-com-contas-de-amigos.md)). Restaurar: ver
[`deploy.md`](deploy.md#restaurar-backup) — vale fazer um ensaio uma vez, com um dump real.

---

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `curl localhost:3000/health` não responde | API caiu ou não subiu | `journalctl -u compasso-api -n 50`; quase sempre senha errada no `.env` |
| `/health` pelo domínio dá **502** / erro do Cloudflare | Nginx ou API parados, ou `config.yml` apontando para porta errada | `curl localhost:8080/health` no servidor; `systemctl status nginx cloudflared` |
| Domínio não resolve | DNS ainda propagando ou `route dns` não rodou | confira o registro CNAME `compasso` no painel do Cloudflare |
| App diz "Use o endereço completo" | faltou `https://` | digite `https://compasso.seu-dominio` |
| App não conecta com `http://…` | o APK de release só aceita HTTPS | use o endereço do túnel |
| Indicador "sessão encerrada" | senha trocada em outro aparelho ou sessão revogada | entre de novo no Perfil |
| APK não instala por cima | chave diferente ou `versionCode` não subiu | mesma keystore e `versionCode` maior |
| Build falha com caminho longo / `ninja` | CMake 3.22 | instale CMake 3.31+ no SDK Manager |
| Build falha com `restricted method in java.lang.System` | JDK 24+ | `JAVA_HOME` num JDK 17–23 |
| Lembrete chega atrasado | economia de bateria | bateria "Sem restrições" para o Compasso |

---

## Checklist final

- [ ] Parte 0: redesign no `main` e enviado ao GitHub
- [ ] Servidor: Node 22, PostgreSQL, usuário `compasso`, código em `/opt/compasso`
- [ ] Banco criado, `.env` e `.pgpass` com permissão 600
- [ ] `compasso-api` e `compasso-manutencao.timer` ativos; um backup manual feito
- [ ] Nginx respondendo em `localhost:8080/health`
- [ ] Túnel ativo; `https://compasso.seu-dominio/health` abre no 4G
- [ ] Keystore criada, com cópia guardada fora do PC
- [ ] APK gerado sem o aviso de chave de debug
- [ ] Conta criada pelo convite; lembretes ativados; bateria sem restrições

---

> **O que este tutorial não conseguiu confirmar** (escrito a partir do repositório, sem um servidor
> real à mão): os comandos de instalação do NodeSource e do `cloudflared` seguem a documentação
> pública desses projetos e podem mudar; o caminho `/etc/cloudflared/` para o serviço é o padrão do
> `cloudflared service install`; o build do APK de release nunca terminou nesta máquina (falhou na
> F10 por falta do CMake 3.31+). O resto — scripts, units, variáveis e comandos do Compasso — foi
> conferido no código.
