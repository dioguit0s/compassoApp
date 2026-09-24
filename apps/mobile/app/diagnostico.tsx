import { novoId, rodarDiagnosticoDeFuso } from '@compasso/core';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTema } from '../src/tema';
import { CabecalhoInterno } from '../src/ui/Cabecalho';
import { Secao } from '../src/ui/Campos';
import { Texto } from '../src/ui/Texto';

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
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <CabecalhoInterno
        voltar="Configurações"
        titulo={todosOk ? 'Fusos OK' : 'Fusos com FALHA'}
        subtitulo={`fuso do aparelho: ${intl.timeZone} · localidade: ${intl.locale}`}
      />
      <ScrollView contentContainerStyle={estilos.tela}>
        {resultados.map((r) => (
          <View
            key={`${r.instante}-${r.fuso}`}
            style={[estilos.linha, { borderBottomColor: tema.divisoria }]}
          >
            <Texto style={{ fontWeight: '600', color: r.ok ? tema.texto : tema.perigo }}>
              {r.ok ? '✓' : '✗'} {r.fuso}
            </Texto>
            <Texto style={{ fontSize: 12.5, color: tema.texto2 }}>{r.instante}</Texto>
            <Texto style={{ fontSize: 12.5, color: tema.texto2 }}>
              obtido {r.obtido} · esperado {r.esperado}
            </Texto>
          </View>
        ))}
        <View style={{ marginTop: 12, gap: 8 }}>
          <Secao titulo="UUIDv7 gerados aqui" />
          {ids.map((id) => (
            <Text key={id} style={[estilos.mono, { color: tema.texto }]}>
              {id}
            </Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  linha: { borderBottomWidth: 1, paddingVertical: 8, gap: 2 },
  // Text puro: o Texto força a família do app, e o identificador precisa de monoespaçada.
  mono: { fontSize: 12, fontFamily: 'monospace' },
});
