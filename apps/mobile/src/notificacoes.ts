import {
  HORIZONTE_NOTIFICACOES_DIAS,
  instanteDoDisparo,
  planejarReagendamento,
  selecionarDisparos,
} from '@compasso/core';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as BackgroundTaskT from 'expo-background-task';
import type * as NotificationsT from 'expo-notifications';
import { addDatabaseChangeListener } from 'expo-sqlite';
import type * as TaskManagerT from 'expo-task-manager';
import { Linking, Platform } from 'react-native';
import { rotuloDeHora } from './ui/EntradaItem';
import { repositorio, sincronizarAgora } from './sync';

/**
 * Agendador de lembretes locais (especificação §6.2, issues #47 e #49). Sem push do servidor: o
 * app escolhe as próximas notificações pela janela deslizante do core e sincroniza o agendador do
 * sistema com essa escolha — na abertura, depois de qualquer escrita no SQLite (edição local ou
 * sync) e numa tarefa periódica de background.
 *
 * Android 12+: `expo-notifications` usa alarme exato (`setExactAndAllowWhileIdle`) quando
 * `canScheduleExactAlarms()` permite e cai para o inexato quando não. O app declara
 * `USE_EXACT_ALARM` (concedida na instalação a apps de calendário no Android 13+, e o Compasso não
 * passa pela Play Store) e `SCHEDULE_EXACT_ALARM` (Android 12). Ver docs/notificacoes.md.
 *
 * Expo Go: o alvo é o development build (ADR-0002), mas o Expo Go serve de atalho no
 * desenvolvimento. Nele o `expo-notifications` lança erro já no import (Android, SDK 53+), então
 * os três módulos nativos só são carregados fora do Expo Go e, dentro dele, lembretes e tarefa de
 * background ficam desligados — o resto do app funciona.
 */

/** true quando o app roda no Expo Go: lembretes e background indisponíveis. */
export const NO_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/* eslint-disable @typescript-eslint/no-require-imports */
const Notifications: typeof NotificationsT = NO_EXPO_GO ? null! : require('expo-notifications');
const TaskManager: typeof TaskManagerT = NO_EXPO_GO ? null! : require('expo-task-manager');
const BackgroundTask: typeof BackgroundTaskT = NO_EXPO_GO ? null! : require('expo-background-task');
/* eslint-enable @typescript-eslint/no-require-imports */

export const CANAL_LEMBRETES = 'lembretes';
const TAREFA_BACKGROUND = 'compasso-reagendar';
const DIA_MS = 86_400_000;

if (!NO_EXPO_GO) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export type EstadoPermissao = 'concedida' | 'negada' | 'nao-perguntada' | 'indisponivel';

/** Última notificação tocada pelo usuário (null no Expo Go). */
export const useUltimaRespostaDeNotificacao: () => NotificationsT.NotificationResponse | null =
  NO_EXPO_GO ? () => null : () => Notifications.useLastNotificationResponse() ?? null;

export async function estadoDaPermissao(): Promise<EstadoPermissao> {
  if (NO_EXPO_GO) return 'indisponivel';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'concedida';
  return p.canAskAgain ? 'nao-perguntada' : 'negada';
}

/**
 * Pede permissão — chamado quando faz sentido (o usuário escolheu um lembrete, ou tocou em
 * "Ativar lembretes"), nunca na primeira abertura sem contexto.
 */
export async function pedirPermissao(): Promise<EstadoPermissao> {
  if (NO_EXPO_GO) return 'indisponivel';
  await configurarCanal();
  const atual = await estadoDaPermissao();
  if (atual !== 'nao-perguntada') return atual;
  const p = await Notifications.requestPermissionsAsync();
  const estado = p.granted ? 'concedida' : 'negada';
  if (estado === 'concedida') await reagendar();
  return estado;
}

/** Android: abre a tela do sistema "Alarmes e lembretes" (alarme exato). */
export function abrirAjusteDeAlarmeExato(): void {
  if (Platform.OS === 'android') {
    void Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM').catch(() =>
      Linking.openSettings(),
    );
  } else {
    void Linking.openSettings();
  }
}

async function configurarCanal(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CANAL_LEMBRETES, {
    name: 'Lembretes',
    description: 'Lembretes de compromissos e tarefas',
    importance: Notifications.AndroidImportance.HIGH,
    // Sem `sound`: o canal usa o som padrão do sistema. `sound: 'default'` é lido como nome de
    // arquivo do config plugin e o expo-notifications loga erro a cada abertura (visto no emulador).
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

let emAndamento: Promise<number> | null = null;
let proxima: Promise<number> | null = null;

/**
 * Sincroniza o agendador do sistema com a janela deslizante. Devolve quantas notificações do
 * Compasso ficaram pendentes (nunca mais que o orçamento). Sem permissão, não faz nada.
 */
export function reagendar(): Promise<number> {
  if (emAndamento) {
    // A execução em curso pode ter lido a agenda antes da mudança que pediu esta: roda de novo
    // ao terminar — uma vez só, por mais pedidos que cheguem nesse meio-tempo.
    proxima ??= emAndamento.then(() => {
      proxima = null;
      return reagendar();
    });
    return proxima;
  }
  emAndamento = executarReagendamento().finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}

async function executarReagendamento(): Promise<number> {
  if ((await estadoDaPermissao()) !== 'concedida') return 0;
  await configurarCanal();
  const agora = new Date();
  const entradas = repositorio.agenda(
    agora,
    new Date(agora.getTime() + HORIZONTE_NOTIFICACOES_DIAS * DIA_MS),
  );
  const selecao = selecionarDisparos(entradas, agora, undefined, rotuloDeHora);
  const agendados = await Notifications.getAllScheduledNotificationsAsync();
  const plano = planejarReagendamento(
    agendados.map((n) => n.identifier),
    selecao,
  );
  for (const id of plano.cancelar) await Notifications.cancelScheduledNotificationAsync(id);
  for (const d of plano.agendar) {
    await Notifications.scheduleNotificationAsync({
      identifier: d.id,
      content: {
        title: d.titulo,
        body: d.corpo,
        data: { itemId: d.itemId, ocorrencia: d.ocorrencia },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: d.instante,
        channelId: CANAL_LEMBRETES,
      },
    });
  }
  return selecao.length;
}

let pendente: ReturnType<typeof setTimeout> | null = null;

/**
 * Reagenda depois de qualquer escrita em `items` ou `item_occurrences` — edição local, conclusão
 * ou dado vindo do sync — com um pequeno atraso para agrupar escritas em sequência.
 */
export function observarMudancas(): () => void {
  const sub = addDatabaseChangeListener((e) => {
    if (e.tableName !== 'items' && e.tableName !== 'item_occurrences') return;
    if (pendente) clearTimeout(pendente);
    pendente = setTimeout(() => void reagendar(), 1500);
  });
  return () => sub.remove();
}

// Tarefa periódica: sincroniza e reagenda mesmo sem o app aberto. O sistema decide o momento
// exato (no iOS, conforme o uso); o intervalo é o mínimo pedido, em minutos.
if (!NO_EXPO_GO) {
  TaskManager.defineTask(TAREFA_BACKGROUND, async () => {
    try {
      await sincronizarAgora();
      await reagendar();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registrarTarefaDeBackground(): Promise<void> {
  if (NO_EXPO_GO) return;
  try {
    if (!(await TaskManager.isTaskRegisteredAsync(TAREFA_BACKGROUND))) {
      await BackgroundTask.registerTaskAsync(TAREFA_BACKGROUND, { minimumInterval: 60 });
    }
  } catch {
    // Background indisponível (ex.: desativado pelo usuário): a abertura do app continua reagendando.
  }
}

/** Notificações pendentes do Compasso, em ordem de disparo. */
export async function pendentes(): Promise<NotificationsT.NotificationRequest[]> {
  if (NO_EXPO_GO) return [];
  const instante = (id: string) => instanteDoDisparo(id) ?? 0;
  return (await Notifications.getAllScheduledNotificationsAsync())
    .filter((n) => n.identifier.startsWith('compasso:'))
    .sort((a, b) => instante(a.identifier) - instante(b.identifier));
}
