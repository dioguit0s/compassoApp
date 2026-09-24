import { novoId, rodarDiagnosticoDeFuso } from '@compasso/core';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTema } from '../src/tema';

/**
 * Conferência rápida (issue #9): confere no aparelho real se o Intl do Hermes formata o mesmo
 * instante corretamente em fusos distantes e em volta de uma mudança de horário de verão.
 */
export default function Diagnostico() {
  const resultados = useMemo(() => rodarDiagnosticoDeFuso(), []);
  const ids = useMemo(() => [novoId(), novoId(), novoId()], []);
  const todosOk = resultados.every((r) => r.ok);
  const intl = Intl.DateTimeFormat().resolvedOptions();
  const tema = useTema();

  return (
    <ScrollView style={{ backgroundColor: tema.fundo }} contentContainerStyle={estilos.tela}>
      <Text style={[estilos.titulo, { color: todosOk ? tema.pontuavel : tema.perigo }]}>
        {todosOk ? 'Fusos OK' : 'Fusos com FALHA'}
      </Text>
      <Text style={{ color: tema.sutil }}>
        fuso do aparelho: {intl.timeZone} · localidade: {intl.locale}
      </Text>
      {resultados.map((r) => (
        <View key={`${r.instante}-${r.fuso}`} style={[estilos.linha, { borderColor: tema.borda }]}>
          <Text style={[estilos.fuso, { color: tema.texto }]}>
            {r.ok ? '✓' : '✗'} {r.fuso}
          </Text>
          <Text style={{ color: tema.texto }}>{r.instante}</Text>
          <Text style={{ color: tema.texto }}>
            obtido {r.obtido} · esperado {r.esperado}
          </Text>
        </View>
      ))}
      <Text style={[estilos.titulo, { color: tema.texto }]}>UUIDv7 gerados aqui</Text>
      {ids.map((id) => (
        <Text key={id} style={[estilos.mono, { color: tema.texto }]}>
          {id}
        </Text>
      ))}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: 24, gap: 12 },
  titulo: { fontSize: 18, fontWeight: '600' },
  linha: { borderBottomWidth: 1, paddingVertical: 8 },
  fuso: { fontWeight: '600' },
  mono: { fontFamily: 'monospace' },
});
