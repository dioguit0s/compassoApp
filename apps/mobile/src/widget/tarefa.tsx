import type { WidgetTaskHandler } from 'react-native-android-widget';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { carregarSemana } from './dados';
import { itensPorDia, NOME_DO_WIDGET, SemanaIndisponivel, SemanaWidget } from './SemanaWidget';

/** Desenha o widget na altura dada (dp). Se o banco falhar, mostra o convite para abrir o app. */
function desenhar(altura: number) {
  const agora = new Date();
  try {
    return <SemanaWidget semana={carregarSemana(agora, itensPorDia(altura))} agora={agora} />;
  } catch {
    return <SemanaIndisponivel />;
  }
}

/**
 * Tarefa headless do widget (registrada em index.ts): o sistema chama ao adicionar, a cada
 * `updatePeriodMillis` (30 min, cobre a virada do dia e da semana) e ao redimensionar. Toques
 * abrem o app por OPEN_URI, sem passar por aqui.
 */
export const tarefaDoWidget: WidgetTaskHandler = async ({
  widgetInfo,
  widgetAction,
  renderWidget,
}) => {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  renderWidget(desenhar(widgetInfo.height));
};

/** Redesenha os widgets na tela inicial depois de a agenda, a grade ou o sync mudarem algo. */
export async function atualizarWidget(): Promise<void> {
  try {
    await requestWidgetUpdate({
      widgetName: NOME_DO_WIDGET,
      renderWidget: (info) => desenhar(info.height),
    });
  } catch {
    // Launcher indisponível ou banco em uso: a próxima escrita ou os 30 min redesenham.
  }
}
