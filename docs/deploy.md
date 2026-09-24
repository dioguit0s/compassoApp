# Deploy, backup e restauração

A API roda no homeserver (Ubuntu 24.04, LAN `192.168.0.0/24`) em Docker Compose, com deploy
automático pelo GitHub Actions num runner self-hosted e acesso público pelo Cloudflare Tunnel que já
existe na máquina ([ADR-0011](adr/0011-deploy-em-docker-com-runner-self-hosted.md)). O caminho
completo até o app no celular está em [`tutorial-deploy.md`](tutorial-deploy.md).

```
 push na main ─► GitHub (ubuntu-latest)        homeserver (runner "compasso", usuário ash)
                 lint, typecheck, testes  ──►  deploy/deploy.sh
                                                 build compasso-api:<commit>
                                                 migrações (container admin)
                                                 troca a API → GET /health → ou rollback

 celular ─► https://compasso.homelab-server.space ─► cloudflared ─► compasso-api:3000 ─► compasso-postgres
```

| Peça | Onde |
|---|---|
| Workflow | [`.github/workflows/api.yml`](../.github/workflows/api.yml) |
| Imagem da API | [`apps/api/Dockerfile`](../apps/api/Dockerfile) (contexto: raiz do repositório) |
| Compose de produção | [`deploy/compose.yml`](../deploy/compose.yml), copiado para `~/compasso/` a cada deploy |
| Deploy com rollback | [`deploy/deploy.sh`](../deploy/deploy.sh) |
| Backup e purga | [`deploy/manutencao.sh`](../deploy/manutencao.sh), cron do `ash` às 04:00 |
| Segredos | `~/compasso/api.env` e `~/compasso/admin.env`, só no servidor, permissão `600` |
| Versão no ar | `~/compasso/.env` (`COMPASSO_TAG=<commit>`), escrito pelo `deploy.sh` |
| Dumps | `~/backups/compasso/`, 7 retidos |

Containers, volumes e rede levam o prefixo `compasso`: `compasso-api`, `compasso-postgres`,
`compasso_pgdata`, `compasso_avatares`, `compasso_default`. A API também entra na rede
`cloudflare-tunnel_default`, do `cloudflared`, sem mexer nele.

## Deploy do dia a dia

Push na `main` que toque a API, o core, o lockfile ou `deploy/`. Também dá para disparar à mão em
Actions → **API** → **Run workflow** (só na `main`).

O `deploy.sh`:

1. constrói `compasso-api:<commit>`;
2. sobe o PostgreSQL se não estiver no ar e aplica as migrações. Se elas falharem, para aqui e a
   versão anterior segue no ar;
3. troca o container da API (alguns segundos fora do ar);
4. espera `GET http://127.0.0.1:8090/health` por até 60 s;
5. se não responder, mostra o log da API, volta para a imagem anterior e marca o job como falho.

As migrações são aditivas (especificação §6.1), então a versão anterior funciona sobre o banco já
migrado. Uma migração destrutiva precisa de plano próprio antes do push.

Conferir de fora: `https://compasso.homelab-server.space/health` → `{"ok":true}`.

## Instalação inicial (uma vez)

Os comandos com `ssh luna-dash` rodam do Windows; os demais, no servidor como `ash`. Só o passo 2
precisa de `sudo`.

### 1. Proteger o runner (repositório público)

O runner roda como `ash`, que está no grupo `docker`, então ele tem poder de root na máquina. Um PR
de fork pode trazer um workflow próprio pedindo `runs-on: [self-hosted, compasso]`. No GitHub:
**Settings → Actions → General → Approval for running fork pull request workflows from
contributors → Require approval for all external contributors**. Nunca aprove a execução de um PR de
terceiros sem ler o que ele muda em `.github/`.

### 2. Registrar o runner

No GitHub: **Settings → Actions → Runners → New self-hosted runner → Linux x64**. A página mostra
o token (vale uma hora). No servidor:

```sh
mkdir ~/actions-runner-compasso && cd ~/actions-runner-compasso
tar xzf ~/actions-runner-linux-x64-2.331.0.tar.gz   # ou o curl da página do GitHub, se for mais novo
./config.sh --url https://github.com/dioguit0s/compassoApp --token <TOKEN> \
  --name homeserver-compasso --labels compasso --unattended
sudo ./svc.sh install ash
sudo ./svc.sh start
```

Conferir em Settings → Actions → Runners: `homeserver-compasso`, **Idle**, labels `self-hosted`,
`Linux`, `X64` e `compasso`.

### 3. Segredos

Gera três senhas em hexadecimal, que não precisam de escape numa URL, e escreve os dois arquivos
com permissão `600`:

```sh
mkdir -p ~/compasso && cd ~/compasso && umask 077
PG=$(openssl rand -hex 24); DONO=$(openssl rand -hex 24); APP=$(openssl rand -hex 24)
cat > admin.env <<EOF
POSTGRES_PASSWORD=$PG
COMPASSO_OWNER_PASSWORD=$DONO
COMPASSO_APP_PASSWORD=$APP
DATABASE_ADMIN_URL=postgres://compasso_owner:$DONO@compasso-postgres:5432/compasso
EOF
cat > api.env <<EOF
DATABASE_URL=postgres://compasso_app:$APP@compasso-postgres:5432/compasso
TZ_DEFAULT=America/Sao_Paulo
TRASH_RETENTION_DAYS=30
SYNC_CURSOR_WINDOW_SECONDS=60
AVATAR_MAX_BYTES=5242880
EOF
unset PG DONO APP
ls -l ~/compasso    # -rw------- nos dois
```

As senhas do banco só valem no primeiro `up`: é quando o `postgres-init.sh` cria os papéis. Trocar
depois exige `ALTER ROLE` no banco **e** nos dois arquivos.

### 4. Primeiro deploy

Actions → **API** → **Run workflow**. O job `deploy` cria o banco, migra e sobe a API. No servidor:

```sh
cd ~/compasso && docker compose ps           # compasso-api e compasso-postgres "Up (healthy)"
curl -s http://127.0.0.1:8090/health         # {"ok":true}
```

### 5. Rota no túnel

No painel da Cloudflare: **Zero Trust → Networks → Tunnels →** o túnel do homeserver **→ Public
Hostname → Add**:

| Campo | Valor |
|---|---|
| Subdomain | `compasso` |
| Domain | `homelab-server.space` |
| Service | `HTTP` · `compasso-api:3000` |

O endereço é o nome do container, não `localhost`: o `cloudflared` roda na rede Docker
`cloudflare-tunnel_default`, onde `localhost` é ele mesmo. Uploads (ICS, foto) passam no limite de
100 MB do plano gratuito.

Conferir no 4G, com o Wi-Fi desligado: `https://compasso.homelab-server.space/health`.

### 6. Backup diário

Adiciona a linha ao cron do `ash`, sem `sudo`:

```sh
(crontab -l 2>/dev/null; echo '0 4 * * * $HOME/compasso/manutencao.sh >> $HOME/compasso/manutencao.log 2>&1') | crontab -
~/compasso/manutencao.sh && ls -lh ~/backups/compasso   # rodar uma vez agora
```

### 7. Conta

```sh
cd ~/compasso && docker compose run --rm admin npm run convite:criar -- "minha conta" 7
```

A conta nasce no app, em Perfil → Tenho um convite (F10, ADR-0008).

## Administração

Tudo de dentro de `~/compasso`, que já tem o `.env` com a versão no ar:

```sh
docker compose logs -f api                                         # log da API
docker compose run --rm admin npm run convite:criar -- "nome"      # convite (vale 1 conta)
docker compose run --rm admin npm run convite:listar
docker compose run --rm admin npm run conta:acesso -- pessoa@exemplo.com   # senha temporária
docker compose restart api
```

Voltar à mão para uma versão anterior: `COMPASSO_TAG=<commit> docker compose up -d --no-deps api`
e, se ficar, `echo COMPASSO_TAG=<commit> > .env`. O deploy guarda só a imagem atual e a anterior
(`docker image ls compasso-api`).

## Backup

[`deploy/manutencao.sh`](../deploy/manutencao.sh), às 04:00 pelo cron do `ash`:

- `pg_dump -Fc` (formato custom, comprimido) dentro do `compasso-postgres`, em
  `~/backups/compasso/compasso-<UTC>.dump`, permissão `600`
- escreve em `.parcial` e só renomeia se o dump terminou e não está vazio
- mantém os `BACKUP_KEEP_DAILY` (padrão 7) mais recentes, contados pelo nome
- depois roda a purga de tombstones com mais de `TRASH_RETENTION_DAYS`, nessa ordem, para o dump
  do dia ainda carregar o que sai
- qualquer falha sai com código ≠ 0; o log fica em `~/compasso/manutencao.log`

Os dumps ficam no mesmo disco ([ADR-0010](adr/0010-backup-sem-copia-externa-com-contas-de-amigos.md)).

## Restaurar backup

Ensaio num banco descartável, sem tocar em produção. **Faça uma vez com um dump real**: é o
critério da issue #13 e da F0.

```sh
DUMP=$(ls ~/backups/compasso/compasso-*.dump | tail -1)

# 1. banco descartável
docker exec compasso-postgres psql -U postgres -c "create database compasso_restauracao owner compasso_owner"

# 2. restaurar (mesmo formato do dump: -Fc → pg_restore)
docker exec -i compasso-postgres pg_restore -U compasso_owner --no-owner --exit-on-error \
  -d compasso_restauracao < "$DUMP"

# 3. conferir: as contas, as migrações e o RLS
docker exec compasso-postgres psql -U compasso_owner -d compasso_restauracao \
  -c "select id, display_name from users" \
  -c "select count(*) from drizzle.__drizzle_migrations" \
  -c "select relname, relrowsecurity from pg_class where relname in ('users', 'items')"

# 4. apagar o descartável
docker exec compasso-postgres psql -U postgres -c "drop database compasso_restauracao"
```

Para restaurar **de verdade** sobre produção: `docker compose stop api`, renomear o banco atual
(`alter database compasso rename to compasso_quebrado`, como `postgres`), criar `compasso` vazio
com dono `compasso_owner`, repetir o passo 2 apontando para ele e `docker compose start api`. As
permissões de `compasso_app` vêm no dump (as migrações fazem os `GRANT`); o papel em si é do
cluster e já existe.
