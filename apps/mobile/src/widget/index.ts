import { Platform } from 'react-native';
import type * as BibliotecaT from 'react-native-android-widget';
import { NO_EXPO_GO } from '../ambiente';
import type * as TarefaT from './tarefa';

/**
 * Porta de entrada do widget da semana (ADR-0015). A biblioteca exige o módulo nativo
 * `AndroidWidget` já no import (TurboModuleRegistry.getEnforcing) e ele não existe no Expo Go:
 * importá-la no topo derrubaria o app na abertura. Por isso ela e o desenho só são carregados
 * aqui, sob demanda, e só no development build ou no APK do Android. Os imports acima são só de
 * tipo e somem no bundle.
 */
export const WIDGET_DISPONIVEL = Platform.OS === 'android' && !NO_EXPO_GO;

/* eslint-disable @typescript-eslint/no-require-imports */
const tarefa = (): typeof TarefaT => require('./tarefa');
const biblioteca = (): typeof BibliotecaT => require('react-native-android-widget');
/* eslint-enable @typescript-eslint/no-require-imports */

/** Registra a tarefa headless que desenha o widget. Chamada em index.ts, antes das telas. */
export function registrarWidget(): void {
  if (!WIDGET_DISPONIVEL) return;
  biblioteca().registerWidgetTaskHandler(tarefa().tarefaDoWidget);
}

/** Redesenha os widgets na tela inicial; não faz nada onde o widget não existe. */
export async function atualizarWidget(): Promise<void> {
  if (!WIDGET_DISPONIVEL) return;
  await tarefa().atualizarWidget();
}
