import {
  aplicarOrcamento,
  aulasDoDia,
  diaDe,
  disparoDoResumo,
  formatarDiaCurto,
  HORIZONTE_NOTIFICACOES_DIAS,
  instanteDoDisparo,
  intervaloDosDias,
  listarDisparos,
  listarDisparosDeAulas,
  nomeCurtoDoDia,
  planejarReagendamento,
  primeiraLinhaDaNota,
  somarDias,
  type Aula,
  type EntradaAgenda,
  type PlanoDeNotificacoes,
  type TipoDeDisparo,
} from '@compasso/core';
import type * as BackgroundTaskT from 'expo-background-task';
import type * as NotificationsT from 'expo-notifications';
import { addDatabaseChangeListener } from 'expo-sqlite';
import type * as TaskManagerT from 'expo-task-manager';
import { Linking, Platform } from 'react-native';
import { lerPreferenciasDeNotificacao } from './preferenciasDeNotificacao';
import { CODICE } from './tema';
import { rotuloDeHora } from './ui/EntradaItem';
import { repositorio, sincronizarAgora } from './sync';
import { NO_EXPO_GO } from './ambiente';
import { atualizarWidget } from './widget';

/**
 * Agendador de lembretes locais (especificação §6.2, issues #47 e #49). Sem push do servidor: o
 * app escolhe as próximas notificações pela janela deslizante do core e sincroniza o agendador do
 * sistema com essa escolha — na abertura, depois de qualquer escrita no SQLite (edição local ou
 * sync) e numa tarefa periódica de background.
 *
 * Além dos lembretes de item entram o lembrete de aula e o resumo da manhã (preferências do
 * aparelho), todos no mesmo orçamento. Lembrete de item pontuável tem o botão "Concluir": a
 * conclusão passa pelo mesmo `repositorio.concluir` da tela (ADR-0006) — grava no SQLite na
 * hora, offline e com o app fechado, e sincroniza quando der.
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

/* eslint-disable @typescript-eslint/no-require-imports */
const Notifications: typeof NotificationsT = NO_EXPO_GO ? null! : require('expo-notifications');
const TaskManager: typeof TaskManagerT = NO_EXPO_GO ? null! : require('expo-task-manager');
const BackgroundTask: typeof BackgroundTaskT = NO_EXPO_GO ? null! : require('expo-background-task');
/* eslint-enable @typescript-eslint/no-require-imports */

export const CANAL_LEMBRETES = 'lembretes';
/** Categoria das notificações de item pontuável: a que tem o botão "Concluir". */
export const CATEGORIA_CONCLUIVEL = 'compasso-concluivel';
export const ACAO_CONCLUIR = 'concluir';
const TAREFA_BACKGROUND = 'compasso-reagendar';
const TAREFA_DE_ACAO = 'compasso-acao-da-notificacao';

/** O que vai em `content.data` de cada notificação: para onde o toque leva e o que concluir. */
export interface DadosDaNotificacao {
  tipo?: TipoDeDisparo;
  itemId?: string | null;
  ocorrencia?: string | null;
  slotId?: string | null;
  dia?: string | null;
}
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

/**
 * O botão "Concluir" não traz o app para a frente: quem conclui pelo lembrete quer continuar o
 * que estava fazendo. Com o app fechado, a resposta chega pela tarefa `TAREFA_DE_ACAO`.
 */
async function configurarCategoria(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(CATEGORIA_CONCLUIVEL, [
    {
      identifier: ACAO_CONCLUIR,
      buttonTitle: 'Concluir',
      options: { opensAppToForeground: false },
    },
  ]);
}

/**
 * Tudo o que deveria estar agendado agora e o que ficou de fora do orçamento — a mesma conta do
 * reagendamento, sem tocar no sistema. O diagnóstico usa os descartados.
 */
export function planoAtual(agora: Date = new Date()): PlanoDeNotificacoes {
  const prefs = lerPreferenciasDeNotificacao();
  const entradas = repositorio.agenda(
    agora,
    new Date(agora.getTime() + HORIZONTE_NOTIFICACOES_DIAS * DIA_MS),
  );
  const disparos = listarDisparos(entradas, agora, corpoDoLembrete);
  const grade = repositorio.grade();
  if (prefs.aulaMinutos !== null) {
    const hoje = diaDe(agora);
    const aulas: Aula[] = [];
    for (let i = 0; i <= HORIZONTE_NOTIFICACOES_DIAS; i++) {
      aulas.push(...aulasDoDia(grade, somarDias(hoje, i)));
    }
    disparos.push(
      ...listarDisparosDeAulas(aulas, agora, {
        minutosAntes: prefs.aulaMinutos,
        silenciadas: new Set(prefs.silenciadas),
      }),
    );
  }
  const resumo = prefs.resumoHora
    ? disparoDoResumo(agora, prefs.resumoHora, (dia) => {
        const { de, ate } = intervaloDosDias(dia, dia);
        return { entradas: repositorio.agenda(de, ate), aulas: aulasDoDia(grade, dia) };
      })
    : null;
  return aplicarOrcamento(disparos, resumo);
}

/**
 * Corpo do lembrete: o horário do compromisso. Lembrete que dispara em outro dia (o de véspera)
 * diz também o dia — "14:00–15:00" sozinho, na véspera, seria lido como hoje. Na linha de baixo
 * vai a primeira linha das observações ("levar exames"). Na tela bloqueada o conteúdo continua
 * escondido: quem decide isso é o canal (`lockscreenVisibility: PRIVATE`), não o texto.
 */
export function corpoDoLembrete(e: EntradaAgenda, instante: Date): string {
  const inicio = e.kind === 'task' ? e.dueAt : e.startAt;
  let quando = rotuloDeHora(e);
  if (inicio && diaDe(inicio) !== diaDe(instante)) {
    const dia = diaDe(inicio);
    quando = `${nomeCurtoDoDia(dia)} ${formatarDiaCurto(dia)} · ${quando}`;
  }
  const nota = primeiraLinhaDaNota(e.notes);
  return nota ? `${quando}\n${nota}` : quando;
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
  await configurarCategoria();
  const { selecao } = planoAtual();
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
        // Tinge o ícone pequeno (a rosa dos ventos, em app.json) com o ouro do app.
        color: CODICE.ouro,
        data: {
          tipo: d.tipo,
          itemId: d.itemId,
          ocorrencia: d.ocorrencia,
          slotId: d.slotId,
          dia: d.dia,
        } satisfies DadosDaNotificacao,
        ...(d.concluivel ? { categoryIdentifier: CATEGORIA_CONCLUIVEL } : {}),
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
let widgetPendente: ReturnType<typeof setTimeout> | null = null;

/** O widget da semana (ADR-0015) também mostra as aulas: muda com a grade além da agenda. */
const TABELAS_DO_WIDGET = new Set([
  'items',
  'item_occurrences',
  'semesters',
  'courses',
  'class_slots',
  'class_exceptions',
]);

/**
 * Reagenda depois de qualquer escrita na agenda ou na grade — edição local, conclusão ou dado
 * vindo do sync — com um pequeno atraso para agrupar escritas em sequência. A grade entra por
 * causa do lembrete de aula e do resumo da manhã. Pelo mesmo caminho, redesenha o widget da
 * semana.
 */
export function observarMudancas(): () => void {
  const sub = addDatabaseChangeListener((e) => {
    if (!TABELAS_DO_WIDGET.has(e.tableName)) return;
    if (widgetPendente) clearTimeout(widgetPendente);
    widgetPendente = setTimeout(() => void atualizarWidget(), 1500);
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
      await atualizarWidget();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/**
 * "Concluir" tocado na notificação. É o mesmo `repositorio.concluir` da lista (ADR-0006): grava
 * o evento de conclusão no SQLite, sem rede, e é idempotente — a resposta pode chegar duas vezes
 * (pelo listener, com o app vivo, e pela tarefa de background) e a segunda não faz nada.
 */
export async function concluirPelaNotificacao(
  resposta: NotificationsT.NotificationResponse,
): Promise<void> {
  const pedido = resposta.notification?.request;
  const dados = pedido?.content?.data as DadosDaNotificacao | undefined;
  if (!pedido || !dados?.itemId) return;
  try {
    repositorio.concluir(dados.itemId, dados.ocorrencia ?? null);
  } catch {
    // Item excluído, ou ocorrência que deixou de existir: não há o que concluir. O lembrete sai
    // da bandeja do mesmo jeito.
  }
  await Notifications.dismissNotificationAsync(pedido.identifier).catch(() => {});
  // Com o app fechado ninguém está observando o banco: reagenda (os outros lembretes da mesma
  // ocorrência saem), redesenha o widget e tenta sincronizar. Sem rede, fica para a próxima.
  await reagendar().catch(() => 0);
  await atualizarWidget().catch(() => {});
  await sincronizarAgora().catch(() => null);
}

if (!NO_EXPO_GO) {
  TaskManager.defineTask<NotificationsT.NotificationTaskPayload>(
    TAREFA_DE_ACAO,
    async ({ data }) => {
      if (data && 'actionIdentifier' in data && data.actionIdentifier === ACAO_CONCLUIR) {
        await concluirPelaNotificacao(data);
      }
    },
  );
  void Notifications.registerTaskAsync(TAREFA_DE_ACAO).catch(() => {});
  Notifications.addNotificationResponseReceivedListener((resposta) => {
    if (resposta.actionIdentifier === ACAO_CONCLUIR) void concluirPelaNotificacao(resposta);
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
