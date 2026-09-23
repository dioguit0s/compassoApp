import { novoId, rodarDiagnosticoDeFuso } from '@compasso/core';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Tela temporária (issue #9): confere no aparelho real se o Intl do Hermes formata o mesmo
 * instante corretamente em fusos distantes e em volta de uma mudança de horário de verão.
 */
export default function Diagnostico() {
  const resultados = useMemo(() => rodarDiagnosticoDeFuso(), []);
  const ids = useMemo(() => [novoId(), novoId(), novoId()], []);
  const todosOk = resultados.every((r) => r.ok);
  const intl = Intl.DateTimeFormat().resolvedOptions();

  return (
    <ScrollView contentContainerStyle={estilos.tela}>
      <Text style={[estilos.titulo, { color: todosOk ? '#4A7A3A' : '#8C2F4A' }]}>
        {todosOk ? 'Fusos OK' : 'Fusos com FALHA'}
      </Text>
      <Text style={estilos.detalhe}>
        fuso do aparelho: {intl.timeZone} · localidade: {intl.locale}
      </Text>
      {resultados.map((r) => (
        <View key={`${r.instante}-${r.fuso}`} style={estilos.linha}>
          <Text style={estilos.fuso}>
            {r.ok ? '✓' : '✗'} {r.fuso}
          </Text>
          <Text>{r.instante}</Text>
          <Text>
            obtido {r.obtido} · esperado {r.esperado}
          </Text>
        </View>
      ))}
      <Text style={estilos.titulo}>UUIDv7 gerados aqui</Text>
      {ids.map((id) => (
        <Text key={id} style={estilos.mono}>
          {id}
        </Text>
      ))}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: 24, gap: 12 },
  titulo: { fontSize: 18, fontWeight: '600' },
  detalhe: { color: '#666' },
  linha: { borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 8 },
  fuso: { fontWeight: '600' },
  mono: { fontFamily: 'monospace' },
});
