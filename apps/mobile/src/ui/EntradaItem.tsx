import { horaDe, type ItemDeAgenda } from '@compasso/core';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTema, type Tema } from '../tema';

/**
 * Um item em qualquer visão. Compromisso puro (sem esforço): contorno. Pontuável: preenchido
 * (especificação §4.8 e §7). A regra de apresentação vale desde a F2, antes da gamificação.
 */
export function estiloDoItem(item: Pick<ItemDeAgenda, 'effort'>, tema: Tema) {
  const pontua = item.effort !== null;
  return {
    pontua,
    caixa: pontua
      ? { backgroundColor: tema.pontuavel, borderColor: tema.pontuavel }
      : { backgroundColor: 'transparent', borderColor: tema.compromisso },
    texto: { color: pontua ? tema.textoSobrePontuavel : tema.compromisso },
  };
}

export function rotuloDeHora(item: ItemDeAgenda): string {
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
  item: ItemDeAgenda;
  variante: 'linha' | 'bloco' | 'mini';
  style?: StyleProp<ViewStyle>;
}) {
  const tema = useTema();
  const router = useRouter();
  const e = estiloDoItem(item, tema);
  const marcador = item.kind === 'task' ? (item.status === 'done' ? '☑ ' : '☐ ') : '';
  const abrir = () => router.push({ pathname: '/item/[id]', params: { id: item.id } });

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
          {item.title}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={abrir}
      style={[estilos.linha, { borderColor: tema.borda, backgroundColor: tema.superficie }, style]}
      accessibilityLabel={`${item.title}, ${rotuloDeHora(item)}${e.pontua ? ', pontua' : ''}`}
    >
      <View style={[estilos.marca, e.caixa]} />
      <View style={{ flex: 1 }}>
        <Text style={[estilos.titulo, { color: tema.texto }]}>
          {marcador}
          {item.title}
        </Text>
        <Text style={{ color: tema.sutil }}>{rotuloDeHora(item)}</Text>
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
  titulo: { fontSize: 16, fontWeight: '500' },
  mini: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 2, marginTop: 1 },
  textoMini: { fontSize: 10 },
  bloco: { borderWidth: 1.5, borderRadius: 4, padding: 2, overflow: 'hidden' },
  textoBloco: { fontSize: 10, fontWeight: '500' },
});
