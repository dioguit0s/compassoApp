// Ponto de entrada do app. Tudo aqui roda no escopo global antes de qualquer tela.
//
// A tarefa de background (TaskManager.defineTask em src/notificacoes.ts) precisa estar definida
// antes do expo-router: quando o sistema dispara a tarefa sem UI (headless), as telas não são
// carregadas e, se a definição morasse só no que o _layout importa, o expo-task-manager avisaria
// "No task registered" e nada sincronizaria (visto no emulador).
import { configurarAleatoriedade } from '@compasso/core';
import * as Crypto from 'expo-crypto';

// UUIDv7 do core usa a aleatoriedade nativa do expo-crypto — sem polyfill global no Hermes.
configurarAleatoriedade((bytes) => {
  Crypto.getRandomValues(bytes);
});

import './src/notificacoes';
import 'expo-router/entry';
