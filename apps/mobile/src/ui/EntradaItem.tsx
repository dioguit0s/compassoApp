import { horaDe, type EntradaAgenda } from '@compasso/core';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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
}: {
  item: EntradaAgenda;
  variante: 'linha' | 'bloco' | 'mini';
  style?: StyleProp<ViewStyle>;
}) {
  const tema = useTema();
  const router = useRouter();
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
      <Pressable onPress={abrir} style={[estilos.mini, e.caixa, style]}>
        <Text numberOfLines={1} style={[estilos.textoMini, e.texto]}>
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
          {marcador}
          {item.title}
        </Text>
      </Pressable>
    );
  }

  // Ocorrência de série pontuável: concluir direto da lista (issue #45).
  const concluivel = item.ocorrencia !== null && item.effort !== null;
  return (
    <Pressable
      onPress={abrir}
      style={[estilos.linha, { borderColor: tema.borda, backgroundColor: tema.superficie }, style]}
      accessibilityLabel={`${item.title}, ${rotuloDeHora(item)}, ${estado.replace('-', ' ')}`}
    >
      {concluivel ? (
        <Pressable
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.status === 'done' }}
          onPress={() =>
            item.status === 'done'
              ? repositorio.reabrirOcorrencia(item.itemId, item.ocorrencia!)
              : repositorio.concluirOcorrencia(item.itemId, item.ocorrencia!)
          }
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
        <Text style={{ color: tema.sutil }}>
          {rotuloDeHora(item)}
          {item.ocorrencia ? ' · repete' : ''}
          {estado === 'nao-cumprida' ? ' · não cumprida' : ''}
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
  mini: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 2, marginTop: 1 },
  textoMini: { fontSize: 10 },
  bloco: { borderWidth: 1.5, borderRadius: 4, padding: 2, overflow: 'hidden' },
  textoBloco: { fontSize: 10, fontWeight: '500' },
});
