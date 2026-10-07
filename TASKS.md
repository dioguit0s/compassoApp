# TASKS.md

Checklist persistente para tarefas longas. O Claude atualiza este arquivo durante o trabalho:
o histórico da conversa é resumido com o tempo, este arquivo não.

Ao iniciar uma tarefa longa, substitua o conteúdo abaixo. Ao concluí-la, limpe o arquivo ou
mova o registro para o PR/commit correspondente.

---

## Tarefa atual — aulas quinzenais e quadrimestre (2026-10-07)

Decisões do usuário: semanas contadas do início do período (Quinzenal 1 = primeira semana);
modelo genérico "a cada N semanas" (1–4), UI só Semanal/Quinzenal 1/Quinzenal 2; período pode
ser semestre ou quadrimestre.

- [x] 1. Core: esquemas, projeção em aulasDoDia, helpers de rótulo, schema local, repositório
- [x] 2. Migrações: app 0008, API 0019 (+ CHECKs)
- [x] 3. API: rotas de slot/semestre
- [x] 4. Telas: disciplina.tsx, semestre.tsx, rótulos "Semestre"
- [x] 5. Testes core e API
- [x] 6. Docs: ADR-0017, especificação, roadmap
- [x] 7. verificar, revisar diff, commit
- [ ] 8. **Usuário:** migrar a API (0019), publicar o app (atualização obrigatória), testar no aparelho


## Tarefa anterior — APK gerado e publicado pelo runner (2026-10-07)

Decisões do usuário: chave de assinatura no servidor; publicação com aprovação de um clique
(environment `apk`); versão do app.json com patch automático e versionCode = publicado + 1; sem
trailer, texto "Melhorias e correções". Default meu: trailer `Atualizacao-obrigatoria: sim`.

- [x] 1. versao-apk.mjs (proximaVersao) e novidades.mjs (obrigatória, texto padrão) + testes
- [x] 2. app.config.js (versão do ambiente) + sourceSkips no fingerprint.config.js
- [x] 3. publicar-apk.mjs: --gerar / --publicar / manual; apk.mjs com versão do ambiente e --no-daemon no CI
- [x] 4. ota.mjs: mensagem de mudança nativa; app.yml com gerar-apk, publicar-apk (environment), simular
- [x] 5. ADR-0016, ADR-0013, especificação, roadmap, deploy.md, desenvolvimento.md, CLAUDE.md
- [x] 6. verificar, revisar diff, commit, push, PR
- [ ] 7. **Usuário:** preparar o servidor (JDK, SDK, chave), environment `apk`, rodar `simular`


## Tarefa anterior — widget da semana na tela inicial (2026-10-06)

Decisões do usuário: só Android; 7 colunas domingo–sábado; eventos, tarefas e aulas; tema do app.

- [x] Core: `resumirSemana` (semana.ts) + 7 testes
- [x] App: react-native-android-widget, `src/widget/` (dados, SemanaWidget, tarefa), handler em
      index.ts, atualização no listener do banco, no background e na abertura
- [x] app.json: plugin, fontes, prévia (`assets/widget-semana.png`), versão 0.4.0 / versionCode 4
- [x] `expo prebuild` gera receiver, provider e fontes (build Gradle não roda no ambiente da nuvem:
      sem acesso ao Android SDK)
- [x] ADR-0015, especificação, roadmap; `npm run verificar` verde
- [x] Correção: app voltava a não abrir no Expo Go (biblioteca do widget carregada sob demanda)
- [x] Merge da main: ADR do widget renumerado para 0015 (o 0014 é o das novidades); trailer
      `Novidade:` no commit seguinte
- [ ] **Usuário:** `npm run apk`, testar no emulador/aparelho, `apk:publicar 0.4.0`

## Tarefa anterior — novidades das atualizações no site e no app (2026-10-06)

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
- [x] Deploy do merge (PR #101): API ok; OTA pulado por "mudança nativa", porque o script `test`
      no apps/mobile/package.json entra no fingerprint. Movido para a raiz (`test:scripts`); o
      hash volta a 846e9c1…, o do APK 0.3.0
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
