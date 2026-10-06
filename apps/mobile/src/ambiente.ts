import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * true quando o app roda no Expo Go: só os módulos nativos do próprio Expo Go existem. Lembretes,
 * tarefa de background e o widget da semana ficam desligados (ver notificacoes.ts e widget/).
 */
export const NO_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
