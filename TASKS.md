# TASKS.md

Checklist persistente para tarefas longas. O Claude atualiza este arquivo durante o trabalho:
o histórico da conversa é resumido com o tempo, este arquivo não.

Ao iniciar uma tarefa longa, substitua o conteúdo abaixo. Ao concluí-la, limpe o arquivo ou
mova o registro para o PR/commit correspondente.

---

## Tarefa atual — esteira de deploy da API no homeserver (2026-09-24)

Decisões do usuário: Docker Compose + runner self-hosted (ADR-0011), repo público com deploy só
em push na main, hostname compasso.homelab-server.space.

- [x] Dockerfile da API + .dockerignore (node_modules de 608 MB → 147 MB com prune de peers)
- [x] deploy/compose.yml (API, PostgreSQL 17, admin), init do banco, deploy.sh com rollback
- [x] deploy/manutencao.sh (backup + purga, cron do ash)
- [x] .github/workflows/api.yml (verificar no GitHub, deploy no runner compasso)
- [x] Remover units systemd, Nginx e cloudflared antigos; comentários do código
- [x] ADR-0011, especificação, roadmap, deploy.md, tutorial, README
- [x] Validar no Docker local: 1º deploy, /health pela rede do túnel, convite + cadastro + /me,
      manutenção (retenção), restauração documentada, rollback com versão quebrada, prune de imagens;
      npm run verificar (API 158, core 176)
- [x] Revisão do diff, commit (sem push)

### Pendências para o usuário
- Aprovação obrigatória para PRs de fork; registrar o runner; api.env/admin.env; push na main;
  rota do túnel; linha do cron; convite (docs/deploy.md, instalação inicial)

## Tarefa anterior — redesign "Compasso em códice" (2026-09-23, branch `feat/redesign`)

Fonte: projeto do Claude Design "Compasso - Telas RPG" (22 telas, importado pelo MCP).

- [x] Fundação: tema único de pergaminho (`tema.ts`), Cinzel + Archivo (`expo-font`), `Texto`,
      ícones, `Campos` (Botao/Chip/Campo/Segmentado/Secao), cabeçalhos próprios, `Folha`, diálogo
      próprio no lugar do `Alert`, aviso
- [x] Abas: Hoje (+ vazio), Calendário semana/mês, Recompensas, Perfil (+ sem sessão)
- [x] Modais: captura, detalhe do item, alcance da série, aula, recompensa
- [x] Internas: semestre, disciplina (hora com seletor), configurações, régua, lixeira, importar,
      lembretes agendados, diagnóstico, abertura
- [x] Docs: telas-e-features.md (seção 2), desenvolvimento.md, README
- [x] `npm run verificar`; revisão do diff (2 correções: navegação antes das fontes, aviso sob a
      barra de abas)
- [ ] **Conferir no aparelho** — não houve verificação visual: o AVD subiu mas o adb não respondia,
      e não havia development build nem Expo Go instalados nele

## Tarefa anterior — documentação em dia e detalhes pequenos (2026-09-23)

- [x] Testes nunca feitos (aparelho físico, iOS, HEIC, avatar simultâneo, background pelo
      sistema, captura < 3 s com gente digitando) → dados como concluídos por decisão do usuário
- [x] Mensagem "desfaça a conclusão de …" mostra 22/09 em vez de 2026-09-22
- [x] Botão "+" não cobre mais o fim das listas das abas (folga `FOLGA_DO_FAB`)
- [x] Diagnóstico segue o tema (legível no escuro)
- [x] `expo-splash-screen` instalado (log `ClassNotFoundException` do dev launcher) — só some
      depois de reconstruir o development build
- [x] Especificação (cabeçalho, §3 Fora, §6.1, ordem 6.4/6.5, §9), roadmap (APK, grade × RRULE),
      desenvolvimento.md (CMake 3.31+, Diagnóstico), README
- [x] `npm run verificar` (core 176, API 158 testes), revisão do diff, commit

## Tarefa anterior — F10, abrir para os amigos (2026-09-23)

**Decisões do usuário (2026-09-23):** validado no aparelho real, F10 começa agora. Senha própria;
cadastro por código de convite; sem backup fora do servidor; atributos fixos; régua fixa; APK
(caminho mais prático); túnel da Cloudflare fica para depois — só testes locais.
Default meu (não respondido): esqueci a senha → redefinição por script do administrador.

### Checklist
- [x] API: tabelas `credentials` e `invites`, funções SECURITY DEFINER, grants (migrações 0015/0016)
- [x] API: hash de senha (scrypt, teto de 2 simultâneos), limite por e-mail e por IP, rotas
      `/auth/cadastro`, `/auth/entrar`, `/auth/sair`, `PUT /me/senha`
- [x] Scripts: `convite:criar`, `convite:listar`, `conta:acesso` (e-mail + senha temporária)
- [x] Testes da API (`test/acesso.test.ts`)
- [x] App: tela de entrar/criar conta, 401 → sessão encerrada, troca de senha, sair revoga
- [x] APK: `npm run apk -w @compasso/mobile`, plugin de assinatura (`plugins/apk-release.js`)
      — prebuild e injeção da assinatura conferidos no `build.gradle` gerado; o `assembleRelease`
      **falhou** (21 min): ninja 1.10.2 do CMake 3.22.1 recusa caminho > 260 caracteres ao compilar
      o C++ do arm64-v8a (`RNGestureHandlerDetectorShadowNode.cpp.o`, ~310). `LongPathsEnabled` já
      é 1 no Windows; falta um ninja que aceite caminho longo (CMake 3.31+ do SDK Manager).
- [x] Docs: ADRs 0008–0010, especificação, roadmap, desenvolvimento.md, README
- [x] `npm run verificar`, revisão do diff (5 sugestões corrigidas), commit

### Pendências para o usuário (F10)
- APK não gerado ainda: instalar CMake 3.31+ no SDK Manager (ver item do APK acima)
- Gerar a chave de assinatura e as propriedades `COMPASSO_RELEASE_*` (docs/desenvolvimento.md)
- Testar no aparelho: criar conta com convite, entrar, trocar senha, sair; sessão encerrada
- `conta:acesso <seu userId> <seu e-mail>` para a sua conta ganhar senha
- Túnel da Cloudflare antes de mandar o APK a alguém (o release só fala HTTPS)


## Tarefa anterior — validação no emulador (2026-09-23)

**Objetivo:** percorrer o roteiro do handoff (`e7f0c8f`) no emulador Android (AVD Pixel_7),
fase por fase: passou / falhou (causa + correção ou issue) / fora de alcance (motivo).

### Roteiro
- [x] Linha de base `npm run verificar` (falhava no Windows por CRLF → `.gitattributes` eol=lf)
- [x] Preparação: Docker + banco + conta + API + development build no emulador
- [x] 0. Hermes: Intl/timeZone, UUIDv7 (zod v4: ver F2)
- [x] F0/F1 conexão e sync
- [x] F2 calendário
- [x] F3 recorrência
- [x] F4 notificações e ICS
- [x] F5 grade
- [x] F6 gamificação
- [x] F7 economia
- [x] F8 perfil e acabamento
- [x] iOS — fora de alcance (Windows, sem Xcode)
- [x] docs: `desenvolvimento.md` (emulador, JDK, ponto de entrada), README (status)

### Resultados

Ambiente: Windows 10, AVD Pixel_7 (Android 17, x86_64, Google APIs/Play), fuso do aparelho GMT.
O AVD vem com 2 GB de RAM: ANRs do sistema inteiro; rodando com `-memory 4096 -cores 6` fica usável.

**Preparação** — passou, com 2 correções de código e 1 de ambiente (JDK):
- `npm run verificar` falhava no Windows (CRLF) → `.gitattributes` com `eol=lf` (`726f563`)
- build Android falhava: reanimated 4.7.0 × worklets 0.10.1 → reanimated 4.5.1 fixado (`5e76387`)
- CMake/prefab falha com JDK 25 (aviso do JEP 472 no stderr; o JBR do Android Studio também é 25)
  → build com `JAVA_HOME` no JDK 23. Não é código: registrar em `docs/desenvolvimento.md`.
- `conta:criar -- "Nome Com Espaço"` quebra no npm do Windows (aspas do cmd); sem espaço funciona.

**0. Hermes** — passou: 5/5 linhas de fuso (inclui Nova York nos dois lados do DST), 3 UUIDv7
distintos e crescentes.

**F0/F1** — passou depois de 3 correções:
- ícones das abas eram retângulos vazios (sem `tabBarIcon`) → SVG (`a9924f6`)
- **todo push do app dava 400**: mandava `{ itens: lote }` em vez do lote → corrigido (`ef03d46`)
- URL digitada errada era aceita e não havia como corrigir → validação (`54a4fac`)
- perfil persiste com modo avião e app reaberto ✓; 3 criados/1 editado/1 excluído offline →
  banco exatamente igual ao religar ✓; LWW com segundo cliente pela API, nos dois sentidos ✓
- observação: religar a rede não sincroniza sozinho (por desenho: abertura e puxar-para-atualizar)
- observação: o indicador diz "sem rede" para qualquer falha, inclusive HTTP 400 (ver F8)

**0. zod v4 no Hermes** — passou: fim antes do início → "• fim antes do início", sem crash.

**F2** — passou (mecanismo):
- semana/mês ✓, dia inteiro 25–27 ✓, 23:00→01:00 em dois dias ✓, "+3" no mês com 6 itens ✓
- seletor de data/hora: 21:30 escolhido → 00:30Z gravado ✓; aparelho em Lisboa: nada muda de
  hora, inclusive o evento das 23:00 SP (03:00 em Lisboa) segue no dia 23 no seletor ✓
- captura rápida, parte do app: toque→teclado 144–303 ms, Enter→salvo 21–26 ms. Cronômetro com
  gente digitando fica para o usuário.
- **contradição**: especificação §2 (linha 68) promete visão de *dia*; roadmap F2 entrega só
  semana e mês. Não há visão de um dia qualquer. → decisão do usuário
- observação: evento de 2 h que cruza a meia-noite vai para a faixa de dia inteiro (regra
  `vaiParaFaixaDoDia`: >1 dia civil), não para a grade de horas
- observação: sair do detalhe com alterações descarta sem perguntar

**F3** — passou: semanal + mensal pela UI; "Só esta" cancela só 30/09 ✓; "Esta e as futuras"
em 07/10 vira UNTIL + série nova, 23/09 intacto ✓; série congelada: seletor livre no futuro ✓;
mudar esforço não oferece "Só esta" e explica ✓; conclusão em 13/10 recusa "esta e as futuras"
de 06/10 ✓. Correção: o erro aparecia no fim do formulário, invisível → topo (`2d8cf72`).

**F4** — passou depois de 4 correções:
- permissão pedida e concedida ✓; lembrete com app em 2º plano, modo avião, tela apagada:
  disparou 17:55:00.068Z ✓; app removido dos recentes: 18:00:03.5Z ✓ com o título renomeado ✓
- reiniciar: alarme volta ~2 min depois do boot, mesmo instante ✓
- **tarefa de background nunca rodava** ("No task registered") → `index.ts` (`993fbea`);
  depois: job forçado sincronizou 1 item e reagendou 3 ✓
- `sound: 'default'` logava erro a cada abertura → removido (`c0e1f51`)
- **importar .ics falhava** ("Unsupported FormDataPart") — mesmo caminho da foto → `5bf961e`;
  depois: 30 criados/3 exceções, reimportação 0 criados/30 iguais ✓
- alarme exato negado: **não dá para negar** — com `USE_EXACT_ALARM` o interruptor fica cinza.
  O texto e o botão "Abrir Alarmes e lembretes" do Perfil apontam para algo que o usuário não muda.
- o fuso do emulador volta para GMT no reboot (o `service call alarm 3` não persiste)
- tela "Lembretes agendados" mostrava "?" no lugar da hora (id lido errado) → `4bd1194`

**F5** — passou: semestre 2026.2 pela UI; "Novo semestre" recolhido depois de criado ✓; cor
padrão da 2ª disciplina é a seguinte da paleta ✓; Hoje mostra a aula de quarta com sala trocada
(B202) ✓; segunda 28 cancelada some da semana ✓; banco: 2 horários, 2 exceções, nenhuma linha de
aula em `item_occurrences` ✓. (As 3 ocorrências de "Treino" no banco são da série importada do
.ics, não de aula.)

**F6** — passou: tarefa de hoje com esforço 2 (Mente) congela na criação; a UI mostra
"Congelado" em vez do seletor ✓ e `PATCH /items/:id {effort}` → 409 ✓ (título → 200); concluir
credita (+20 Mente, 3→5 moedas) ✓, desfazer estorna (−20, volta a 3) ✓, radar = soma do ledger
✓; concluir no detalhe não fecha e vira "Desfazer conclusão" ✓; concluir offline + 2 syncs →
um crédito só ✓.

**F7** — passou depois de 2 correções:
- carência bloqueia o resgate ✓ — mas tocar no "Resgatar" desativado abria a edição (toque
  vazava para o cartão) → `9d3f3fd`
- preço de recompensa nova alterado antes do sync persiste (4) ✓
- **baixar o preço de recompensa vigente pelo app se perdia**: `promover` devolvia a linha
  inteira e o updatedAt do servidor vencia o LWW; o app achava que tinha sincronizado → `f362c7d`
  (testes no core e na API que falham sem a correção)
- para testar resgate e cooldown, a carência foi "vencida" direto no banco
  (`price_effective_from = 2026-09-21`): 2º resgate no cooldown recusado na UI e na API (409) com
  4 moedas ✓; histórico mantém o preço pago (1) depois de o preço ir a 3 ✓

**F8** — passou depois de 4 correções:
- nome abre preenchido ✓; lixeira: restaurar volta no servidor ✓
- foto: galeria → recorte → envio OK, mas **não aparecia**: sem Nginx em dev ninguém serve
  `/avatares/`, e o JSON do 401 ficava salvo como foto → `75c82cb`; depois aparece ✓
- indicador: sincronizando/sincronizado (hora de SP) ✓, sem rede ✓, erro do servidor agora
  distinto ("erro ao sincronizar (HTTP 500)", banco parado) → `6719c2f`
- sair da conta: 0 alarmes, lista de lembretes vazia, Hoje/Calendário/Recompensas/Perfil vazios,
  todas as tabelas locais com 0 linhas ✓
- tema escuro + fonte 130%: cabeçalho branco nas telas empilhadas, abas inativas invisíveis,
  intervalo da semana cortado → `9f45807`; títulos "configuracoes"/lixeira/régua e "1 moedas"
  → `30bc7b7`

### Observações sem correção (decisão do usuário ou menores)
- ~~Especificação §3 promete visão de dia~~ → decidido (2026-09-23): só semana e mês; o dia
  corrente fica na aba Hoje. Especificação ajustada.
- ~~aviso de alarme exato no Perfil sem efeito no Android 13+~~ → decidido: só aparece no
  Android 12 (API 31–32). Não verificado no Android 12 (sem imagem de sistema API 31/32 aqui).
- religar a rede não sincroniza sozinho (só abertura e puxar-para-atualizar, por desenho)
- evento curto que cruza a meia-noite vai para a faixa de dia inteiro — decidido: mantém
- ~~sair do detalhe com alterações descarta sem perguntar~~ → agora pede confirmação
- concluir ocorrência futura é permitido — decidido: mantém
- ~~a mensagem "desfaça a conclusão de 2026-10-13…" mostra a data em ISO~~ → corrigido
- ~~o FAB "+" cobre o fim de linhas alinhadas à direita~~ → folga no fim das listas
- ~~Diagnóstico usa cores fixas~~ → segue o tema
- ~~log do dev launcher: `ClassNotFoundException …SplashScreenManager`~~ → expo-splash-screen

## Tarefa anterior — roadmap F0–F8

**Objetivo:** seguir o roadmap além da F1 (autorizado pelo usuário em 2026-09-23), com fuso fixo
de São Paulo (ADR-0003). Commits quando fizer sentido.

**Parar e perguntar se:** decisão de produto ou contradição com especificação/roadmap/ADR.
→ **Parado no fim da F8**: a F9 é calibração com semanas de uso real, e a F10 é pós-v1.

### Checklist
- [x] F0, F1 (ADR-0002, docs/sincronizacao.md)
- [x] F2 — calendário (ADR-0003, fuso fixo de São Paulo)
- [x] F3 — recorrência (ADR-0004)
- [x] F4 — notificações e ICS (docs/notificacoes.md)
- [x] F5 — grade acadêmica (ADR-0005)
- [x] F6 — gamificação (ADR-0006)
- [x] F7 — economia (ADR-0007)
- [x] F8 — perfil, foto, configurações, lixeira, histórico, estados
- [x] revisão do diff F2–F8 em três fatias (core, API, app); 18 achados corrigidos com teste

### Decisões do usuário
- #26 fuso: sempre São Paulo → ADR-0003
- #55 semestre: híbrido (um corrente, datas limitam) → ADR-0005
- #64 congelamento: gravação preguiçosa → ADR-0006
- #65 estorno: saldo pode ficar negativo → ADR-0006

### Pendências para o usuário
- ~~Critérios de saída no aparelho real~~ → validado pelo usuário (2026-09-23); falta o servidor
  real com túnel: #14, #25, #36, #46, #54, #63, #76, #82, #89
- #66: escrever a régua de esforço com exemplos da própria vida (hoje é provisória, genérica)
- F9 (#90–#93): só depois de 3–4 semanas de uso com a gamificação ligada

### Não confirmado → dados como concluídos pelo usuário (2026-09-23)
- Aparelho físico: tudo acima foi no emulador x86_64 (Hermes igual; OEM, bateria e Doze reais não)
- iOS inteiro (sem Xcode): modos de background, permissão, seletor de data nativo
- Foto HEIC no `PUT /me/avatar`: o sharp pré-compilado talvez não decodifique (sem arquivo HEIC)
- Dois `PUT /me/avatar` simultâneos podem deixar um arquivo órfão no disco (só leitura de código)
- Tarefa de background disparada pelo sistema (só forçada com `jobscheduler run -f`); intervalo
  real e comportamento em Doze
- Captura rápida < 3 s com gente digitando (só a parte do app foi medida: ~0,3 s)
- Túnel cloudflared, restauração de dump, servidor doméstico
- Linhas já divergentes antes de `f362c7d` (preço pendente só no aparelho) não se curam sozinhas;
  não há dado real afetado (app nunca foi usado)

### Depois da validação (2026-09-23)
- [x] Especificação: sem visão de dia (decisão b); sem `GET`/`POST /items` (§6.3)
- [x] Detalhe pede confirmação antes de descartar alterações
- [x] Aviso de alarme exato só no Android 12 (não visto rodando em API 31–32)
- [x] Arrastar tarefa para a grade da semana (`3d62dfd`), com testes no core e na API
