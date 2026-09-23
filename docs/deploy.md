# Deploy, backup e restauração

Servidor doméstico, API atrás do Cloudflare Tunnel, deploy manual. Nada aqui é pipeline — é o
roteiro que se segue à mão (roadmap F0, especificação §2, §6.1 e §6.7).

## Deploy (quatro comandos)

No servidor, como o usuário `compasso`, em `/opt/compasso`:

```sh
git pull --ff-only
npm ci
npm run db:migrate -w @compasso/api
sudo systemctl restart compasso-api
```

Conferir: `curl https://compasso.<seu-dominio>/health` → `{"ok":true}`.

`db:migrate` lê `DATABASE_ADMIN_URL` do `apps/api/.env`. As migrações são aditivas e aplicadas antes
do restart, então a versão antiga da API continua funcionando durante os segundos entre os dois
comandos.

## Instalação inicial (uma vez)

1. **Usuário e código**
   ```sh
   sudo useradd --system --create-home compasso
   sudo mkdir -p /opt/compasso && sudo chown compasso: /opt/compasso
   sudo -u compasso git clone https://github.com/dioguit0s/compassoApp.git /opt/compasso
   ```
2. **Node 22+** instalado no sistema (`/usr/bin/npm` é o caminho usado pela unit).
3. **PostgreSQL** (16 ou 17). Papéis e banco, como superusuário:
   ```sh
   sudo -u postgres psql -v senha_dono="'<senha forte>'" -v senha_app="'<outra senha forte>'" \
     -f /opt/compasso/apps/api/scripts/bootstrap.sql
   ```
   O PostgreSQL escuta só em `localhost`. A porta nunca é publicada no túnel nem no roteador.
4. **Ambiente** — `/opt/compasso/apps/api/.env`, permissão `600`, dono `compasso`, a partir do
   [`.env.example`](../apps/api/.env.example). Segredos de produção existem só nesse arquivo e no
   `.pgpass`.
5. **`.pgpass`** do usuário `compasso` (usado pelo backup), permissão `600`:
   ```
   localhost:5432:compasso:compasso_owner:<senha do dono>
   ```
6. **Migrar e criar a conta**
   ```sh
   cd /opt/compasso && npm ci
   npm run db:migrate -w @compasso/api
   npm run conta:criar -w @compasso/api -- "Seu Nome"   # guarde o token impresso
   ```
   Um segundo aparelho ganha token próprio: `npm run conta:token -w @compasso/api -- <userId> "tablet"`.
7. **Serviços** — copiar os arquivos de [`deploy/`](../deploy) para `/etc/systemd/system/` e:
   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable --now compasso-api compasso-manutencao.timer
   ```
8. **Nginx** — serve as fotos de perfil do disco e repassa o resto para a API:
   ```sh
   sudo mkdir -p /var/lib/compasso/avatares && sudo chown compasso: /var/lib/compasso/avatares
   sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/compasso
   sudo ln -s /etc/nginx/sites-available/compasso /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
   No `.env`: `AVATAR_DIR=/var/lib/compasso/avatares`. Na unit do systemd, `ProtectSystem=strict`
   exige liberar a escrita: `ReadWritePaths=/var/lib/compasso/avatares`.
9. **Túnel** — com `cloudflared` instalado e autenticado:
   ```sh
   cloudflared tunnel create compasso
   cloudflared tunnel route dns compasso compasso.<seu-dominio>
   # config.yml a partir de deploy/cloudflared-config.yml.example
   sudo cloudflared service install
   ```
10. **App** — no primeiro uso, a aba Perfil pede a URL do túnel e o token; os dois ficam no
   `expo-secure-store` do aparelho, nunca no bundle.

## Backup

[`apps/api/scripts/backup.sh`](../apps/api/scripts/backup.sh), disparado todo dia às 04:00 pelo
`compasso-manutencao.timer`:

- `pg_dump -Fc` (formato custom, comprimido) em `BACKUP_DIR/compasso-<UTC>.dump`
- escreve em `.parcial` e só renomeia se o dump terminou e não está vazio
- mantém os `BACKUP_KEEP_DAILY` (padrão 7) mais recentes, contados pelo nome
- qualquer falha sai com código ≠ 0 e mensagem no journal: `journalctl -u compasso-manutencao`

Depois do dump, o mesmo serviço roda a purga de tombstones com mais de `TRASH_RETENTION_DAYS`
(`npm run db:purgar -w @compasso/api`) — nessa ordem, para o dump do dia ainda carregar o que sai.

Rodar à mão: `sudo systemctl start compasso-manutencao && ls -lh /var/backups/compasso`.

A senha vem do `.pgpass`, nunca do crontab nem da unit.

## Restaurar backup

Comandos exatos, exercitados num PostgreSQL 16 local em 2026-09-23 (banco com a conta de teste,
restaurado e conferido). **Refaça uma vez no servidor real** com um dump de produção — é o
critério da issue #13 e da F0.

```sh
DUMP=$(ls /var/backups/compasso/compasso-*.dump | tail -1)

# 1. banco descartável
sudo -u postgres psql -c "create database compasso_restauracao owner compasso_owner"

# 2. restaurar (mesmo formato do dump: -Fc → pg_restore)
pg_restore -h localhost -U compasso_owner --no-owner --exit-on-error \
  -d compasso_restauracao "$DUMP"

# 3. conferir: a conta está lá, as migrações e o RLS também
psql -h localhost -U compasso_owner -d compasso_restauracao \
  -c "select id, display_name from users" \
  -c "select count(*) from drizzle.__drizzle_migrations" \
  -c "select relname, relrowsecurity from pg_class where relname in ('users', 'items')"

# 4. apagar o descartável
sudo -u postgres psql -c "drop database compasso_restauracao"
```

Para restaurar **de verdade** sobre produção: parar a API, renomear o banco atual
(`alter database compasso rename to compasso_quebrado`), criar `compasso` vazio com dono
`compasso_owner` e repetir o passo 2 apontando para ele. As permissões de `compasso_app` vêm no
dump (as migrações fazem os `GRANT`); o papel em si é do cluster e já existe.
