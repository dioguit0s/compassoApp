import { horaDe, type EntradaAgenda } from '@compasso/core';
import { useRouter } from 'expo-router';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { descreverEfeito } from '../conclusao';
import { useDisciplina } from '../disciplinas';
import { useAviso } from './Aviso';
import { repositorio } from '../sync';
import { useTema, type Tema } from '../tema';

export type EstadoDaEntrada = 'compromisso' | 'aberta' | 'concluida' | 'nao-cumprida';

/**
 * Estado visual. Compromisso puro (sem esforço) é CONTORNO — algo que acontece com você.
 * Pontuável é PREENCHIDO — algo que você faz (especificação §4.8 e §7). Ocorrência pontuável que
 * já passou sem ser concluída fica "não cumprida": informação neutra, tracejada, nunca vermelho de
 * erro (especificação §4.7, issue #45).
 */
export function estadoDaEntrada(e: EntradaAgenda, agora: Date = new Date()): EstadoDaEntrada {
  if (e.effort === null) return 'compromisso';
  if (e.status === 'done') return 'concluida';
  const fim = e.kind === 'task' ? e.dueAt : (e.endAt ?? e.startAt);
  if (e.ocorrencia && fim && fim < agora) return 'nao-cumprida';
  return 'aberta';
}

export function estiloDoEstado(estado: EstadoDaEntrada, tema: Tema) {
  switch (estado) {
    case 'compromisso':
      return {
        caixa: { backgroundColor: 'transparent', borderColor: tema.compromisso },
        texto: { color: tema.compromisso },
      };
    case 'aberta':
      return {
        caixa: { backgroundColor: tema.pontuavel, borderColor: tema.pontuavel },
        texto: { color: tema.textoSobrePontuavel },
      };
    case 'concluida':
      return {
        caixa: { backgroundColor: tema.pontuavel, borderColor: tema.pontuavel, opacity: 0.55 },
        texto: { color: tema.textoSobrePontuavel },
      };
    case 'nao-cumprida':
      return {
        caixa: {
          backgroundColor: 'transparent',
          borderColor: tema.sutil,
          borderStyle: 'dashed' as const,
        },
        texto: { color: tema.sutil },
      };
  }
}

const MARCA: Record<EstadoDaEntrada, string> = {
  compromisso: '',
  aberta: '☐ ',
  concluida: '☑ ',
  'nao-cumprida': '– ',
};

export function rotuloDeHora(item: EntradaAgenda): string {
  if (item.allDay) return 'dia inteiro';
  if (item.kind === 'task') return item.dueAt ? `até ${horaDe(item.dueAt)}` : 'sem prazo';
  if (!item.startAt) return '';
  return item.endAt ? `${horaDe(item.startAt)}–${horaDe(item.endAt)}` : horaDe(item.startAt);
}

export function EntradaItem({
  item,
  variante,
  style,
  aoSegurar,
  aoSoltar,
}: {
  item: EntradaAgenda;
  variante: 'linha' | 'bloco' | 'mini';
  style?: StyleProp<ViewStyle>;
  /** Só `mini`: segurar começa a arrastar (tarefa para a grade da semana). */
  aoSegurar?: (pageX: number, pageY: number) => void;
  aoSoltar?: () => void;
}) {
  const tema = useTema();
  const router = useRouter();
  // Disciplina excluída: o vínculo foi anulado e o selo some sozinho.
  const disciplina = useDisciplina(item.courseId);
  const aviso = useAviso();
  const selo = disciplina ? (disciplina.code ?? disciplina.name.slice(0, 4)) : null;
  const estado = estadoDaEntrada(item);
  const e = estiloDoEstado(estado, tema);
  const marcador = MARCA[estado];
  const abrir = () =>
    router.push({
      pathname: '/item/[id]',
      params: item.ocorrencia
        ? { id: item.itemId, ocorrencia: item.ocorrencia }
        : { id: item.itemId },
    });

  if (variante === 'mini') {
    return (
      <Pressable
        onPress={abrir}
        onLongPress={
          aoSegurar ? (ev) => aoSegurar(ev.nativeEvent.pageX, ev.nativeEvent.pageY) : undefined
        }
        onPressOut={aoSoltar}
        delayLongPress={300}
        accessibilityHint={aoSegurar ? 'Segure e arraste para um horário para agendar' : undefined}
        style={[estilos.mini, e.caixa, style]}
      >
        <Text numberOfLines={1} style={[estilos.textoMini, e.texto]}>
          {selo ? (
            <Text style={{ color: disciplina!.color, fontWeight: '700' }}>{selo} </Text>
          ) : null}
          {marcador}
          {item.title}
        </Text>
      </Pressable>
    );
  }
  if (variante === 'bloco') {
    return (
      <Pressable onPress={abrir} style={[estilos.bloco, e.caixa, style]}>
        <Text numberOfLines={3} style={[estilos.textoBloco, e.texto]}>
          {selo ? <Text style={{ fontWeight: '700' }}>{selo} </Text> : null}
          {marcador}
          {item.title}
        </Text>
      </Pressable>
    );
  }

  // Pontuável (item simples ou ocorrência de série): concluir direto da lista (#45, #71).
  const concluivel = item.effort !== null;
  const alternarConclusao = () => {
    try {
      const efeito =
        item.status === 'done'
          ? repositorio.desfazerConclusao(item.itemId, item.ocorrencia)
          : repositorio.concluir(item.itemId, item.ocorrencia);
      if (efeito.tipo === 'creditar') {
        aviso({
          texto: descreverEfeito(efeito),
          acao: {
            rotulo: 'Desfazer',
            aoTocar: () => repositorio.desfazerConclusao(item.itemId, item.ocorrencia),
          },
        });
      } else if (efeito.tipo === 'estornar') {
        aviso({ texto: `Conclusão desfeita: ${descreverEfeito(efeito)}` });
      }
    } catch (e) {
      Alert.alert('Não foi possível', (e as Error).message);
    }
  };
  // Adiar (§4.7): só item pontuável e simples; o contador aparece sem julgamento.
  const adiavel = concluivel && item.ocorrencia === null && item.status !== 'done';
  const oferecerAdiar = () =>
    Alert.alert(item.title, undefined, [
      {
        text: 'Adiar para amanhã',
        onPress: () => {
          try {
            repositorio.adiar(item.itemId, 1);
          } catch (e) {
            Alert.alert('Não foi possível', (e as Error).message);
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  return (
    <Pressable
      onPress={abrir}
      onLongPress={adiavel ? oferecerAdiar : undefined}
      style={[estilos.linha, { borderColor: tema.borda, backgroundColor: tema.superficie }, style]}
      accessibilityLabel={`${item.title}, ${rotuloDeHora(item)}, ${estado.replace('-', ' ')}`}
    >
      {concluivel ? (
        <Pressable
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.status === 'done' }}
          onPress={alternarConclusao}
          style={[estilos.caixaMarcar, e.caixa]}
        >
          <Text style={e.texto}>{item.status === 'done' ? '✓' : ''}</Text>
        </Pressable>
      ) : (
        <View style={[estilos.marca, e.caixa]} />
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={[
            estilos.titulo,
            { color: estado === 'nao-cumprida' ? tema.sutil : tema.texto },
            estado === 'concluida' && estilos.riscado,
          ]}
        >
          {item.title}
        </Text>
        {selo ? (
          <View style={[estilos.selo, { backgroundColor: disciplina!.color }]}>
            <Text style={estilos.textoSelo}>{selo}</Text>
          </View>
        ) : null}
        <Text style={{ color: tema.sutil }}>
          {rotuloDeHora(item)}
          {item.ocorrencia ? ' · repete' : ''}
          {estado === 'nao-cumprida' ? ' · não cumprida' : ''}
          {item.postponeCount > 0
            ? ` · adiada ${item.postponeCount} ${item.postponeCount === 1 ? 'vez' : 'vezes'}`
            : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
  },
  marca: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  caixaMarcar: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: { fontSize: 16, fontWeight: '500' },
  riscado: { textDecorationLine: 'line-through' },
  selo: { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 5, marginVertical: 2 },
  textoSelo: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  mini: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 2, marginTop: 1 },
  textoMini: { fontSize: 10 },
  bloco: { borderWidth: 1.5, borderRadius: 4, padding: 2, overflow: 'hidden' },
  textoBloco: { fontSize: 10, fontWeight: '500' },
});
