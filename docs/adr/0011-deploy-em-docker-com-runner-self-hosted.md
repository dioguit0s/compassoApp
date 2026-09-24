# ADR-0011: Deploy em Docker Compose com runner self-hosted no homeserver

- **Data:** 2026-09-24
- **Status:** aceito
- **Envolvidos:** Diogo (autor), Claude Code (registro)

## Contexto

O `deploy.md` e o `tutorial-deploy.md` descreviam uma instalação feita à mão: usuário `compasso`,
PostgreSQL instalado no sistema, units do systemd, Nginx servindo as fotos de perfil e um túnel
`cloudflared` próprio, com deploy manual em quatro comandos (roadmap F0). A especificação (§7)
contava com "o Nginx que já existe na infra".

O servidor onde a API vai morar (o homeserver) já roda outros projetos e tem um padrão próprio,
levantado em 2026-09-24:

- todo projeto faz deploy por **GitHub Actions com runner self-hosted** na própria máquina, porque
  ela fica numa LAN privada e a conexão do runner é de saída;
- **não existe Nginx** nem outro proxy de borda;
- o túnel da Cloudflare já existe, num container `cloudflared` na rede Docker
  `cloudflare-tunnel_default`, e as rotas são configuradas no painel da Cloudflare;
- o agente e o runner não têm `sudo`, e o usuário `ash` já tem acesso ao Docker;
- a RAM é o recurso mais apertado (7,2 GiB, cerca de 3,6 GiB livres).

## Decisão

1. **API e PostgreSQL 17 em Docker Compose**, projeto `compasso` (`deploy/compose.yml`), com os
   segredos em `~/compasso/api.env` e `~/compasso/admin.env` no servidor, fora do repositório. O
   banco não publica porta. O papel dono (`DATABASE_ADMIN_URL`) só existe no container `admin`, que
   roda migrações e scripts e não fica no ar: a API em execução continua sem ler essa variável.
2. **Esteira no GitHub Actions** (`.github/workflows/api.yml`): lint, typecheck e testes num runner
   do GitHub. Depois, `deploy/deploy.sh` roda no runner self-hosted com o label `compasso`: constrói
   a imagem com a tag do commit, migra, troca o container, confere `GET /health` e volta para a
   imagem anterior se ele falhar.
3. **Sem Nginx.** A própria API serve `/avatares/:arquivo` (isso já existia para desenvolvimento),
   com o mesmo cache imutável. As fotos ficam no volume `compasso_avatares`.
4. **Túnel compartilhado.** O container da API entra na rede do `cloudflared`, e a rota
   `compasso.homelab-server.space` aponta para `http://compasso-api:3000`, sem depender de porta no
   host. A porta 8090 fica publicada só em `127.0.0.1`, para o health check.
5. **Backup e purga por cron do usuário `ash`** (`deploy/manutencao.sh`, 04:00), com `pg_dump` via
   `docker exec`, em `~/backups/compasso`, mantendo 7 dumps. Substitui a unit e o timer do systemd.
6. **Repositório público, deploy só pela `main`.** Nenhum workflow roda em `pull_request`.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Manter o plano do `deploy.md` (systemd, Nginx, PostgreSQL no sistema) | Exige `sudo` a cada passo, instala Nginx e um segundo `cloudflared` num servidor que não tem nem quer nenhum dos dois, e continua manual |
| systemd com runner (padrão do luna-server) | Precisa de unit e regra no sudoers instaladas pelo usuário, e ainda assim o Node e o PostgreSQL rodam soltos no host |
| Reaproveitar um PostgreSQL existente (`affine_postgres`, `immich_postgres`) | São de outros projetos, com versões e extensões próprias; misturar os dados quebra o isolamento e a regra de não mexer nos serviços alheios |
| Tornar o repositório privado | Elimina o risco do runner em repositório público, mas o autor prefere manter público; o risco fica mitigado nas consequências abaixo |
| Rota do túnel para `localhost:8090` | O `cloudflared` roda numa rede Docker isolada, e `localhost` ali é o próprio container |

## Consequências

- **Risco do runner em repositório público.** O runner roda como `ash`, que está no grupo `docker`
  (equivale a root). Um PR de fork pode trazer um workflow novo com `pull_request` e
  `runs-on: [self-hosted, compasso]`. Mitigação obrigatória: em Settings → Actions → General,
  **exigir aprovação para workflows de todos os colaboradores externos**, e nunca aprovar a
  execução de PR de terceiros sem ler o diff dos workflows.
- O deploy fica fora do ar por alguns segundos durante a troca do container. Para menos de dez
  contas e um app offline-first, isso não aparece para ninguém.
- O PostgreSQL ocupa em torno de 100 MB de RAM a mais no servidor.
- O rollback só volta a imagem, não o banco. Isso depende de as migrações continuarem aditivas
  (especificação §6.1); uma migração destrutiva precisa de plano próprio.
- O roteiro de restauração passa a usar `docker exec` com `pg_restore` (ver `deploy.md`).
- A especificação (§7 e §9), o roadmap (F0 e F8), o `deploy.md` e o tutorial foram atualizados
  junto com este ADR.
