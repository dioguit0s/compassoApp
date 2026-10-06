# TASKS.md

Checklist persistente para tarefas longas. O Claude atualiza este arquivo durante o trabalho:
o histórico da conversa é resumido com o tempo, este arquivo não.

Ao iniciar uma tarefa longa, substitua o conteúdo abaixo. Ao concluí-la, limpe o arquivo ou
mova o registro para o PR/commit correspondente.

---

## Tarefa atual — widget da semana na tela inicial (2026-10-06)

Decisões do usuário: só Android; 7 colunas domingo–sábado; eventos, tarefas e aulas; tema do app.

- [x] Core: `resumirSemana` (semana.ts) + 7 testes
- [x] App: react-native-android-widget, `src/widget/` (dados, SemanaWidget, tarefa), handler em
      index.ts, atualização no listener do banco, no background e na abertura
- [x] app.json: plugin, fontes, prévia (`assets/widget-semana.png`), versão 0.4.0 / versionCode 4
- [x] `expo prebuild` gera receiver, provider e fontes (build Gradle não roda no ambiente da nuvem:
      sem acesso ao Android SDK)
- [x] ADR-0014, especificação, roadmap; `npm run verificar` verde
- [ ] **Usuário:** `npm run apk`, testar no emulador/aparelho, `apk:publicar 0.4.0`
## Tarefa atual — novidades das atualizações no site e no app (2026-10-06)

Decisões do usuário: texto escrito à mão em cada commit (trailer `Novidade:`), cláusula no
CLAUDE.md, as três fases (site, feed Atom, "O que há de novo" no app).

- [x] 1. scripts/novidades.mjs (trailers → itens, intervalo desde a última publicação) + testes
- [x] 2. ota.mjs e publicar-apk.mjs gravam releases/novidades/; ota-reverter move junto
- [x] 3. API: novidades.ts (/novidades.json, /novidades.xml) + seção no site + testes
- [x] 4. App: aviso "Novidades" depois de atualizar + tela em Configurações
- [x] 5. app.yml (fetch-depth 0, testes), deploy.sh, CLAUDE.md, ADR-0014, especificação, roadmap, docs
- [x] 6. verificar, revisar diff, commit e push
- [x] Revisão do diff: 2 sugestões corrigidas (OTA de runtime antigo como "pendente"; reverter
      duas vezes deixava a novidade no site)
- [ ] 7. **No servidor (usuário):** deploy da API, primeiro push com `Novidade:` e conferir a
      página, o feed e o aviso no celular

## Tarefa anterior — atualizações automáticas do app (2026-09-29)

Plano: APK publicado no próprio servidor + atualizador no app (fase A) e OTA própria com
expo-updates publicada pelo runner a cada push na main (fase B, decisão do usuário).

- [x] 0. Spike: fingerprint igual no Windows e no Linux — só com `fingerprint.config.js` (bug de
      caminho do @expo/fingerprint no Windows + Gradle reescreve AndroidManifest em node_modules)
- [x] 1. API: config, atualizacoes.ts (/app/android, /updates/*) e testes
- [x] 2. App: deps, app.json 0.3.0, atualizacao.ts, aviso, Configurações, plugin
- [x] 3. Scripts publicar-apk.mjs e ota.mjs, workflow app.yml, compose.yml, deploy.sh
- [x] 4. ADR-0013, especificação, roadmap, deploy/desenvolvimento/README; verificar; revisão; commit
- [x] Revisão do diff: bloqueante (limpeza de runtime antigo causava rollBackToEmbedded) e
      6 sugestões corrigidas
- [x] 5. **No servidor (usuário):** push, apk:publicar 0.3.0, instalar à mão, testes ponta a ponta
      (concluído, segundo o usuário, em 2026-10-02)
