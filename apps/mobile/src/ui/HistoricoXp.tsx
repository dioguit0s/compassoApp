import { ATRIBUTOS, NOMES_ATRIBUTOS, historicoMensal, type Atributo } from '@compasso/core';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { repositorio } from '../sync';
import { useTema, type Tema } from '../tema';

const cores = (t: Tema): Record<Atributo, string> => ({
  corpo: t.pontuavel,
  mente: t.destaque,
  oficio: t.hoje,
  casa: '#7A3A6B',
  social: '#76682A',
});

/**
 * Evolução do XP por mês (issue #87): barras empilhadas por atributo, últimos 12 meses. Meses sem
 * lançamento aparecem vazios, não somem. A soma dos meses é o acumulado do radar.
 */
export function HistoricoXp({ gatilho }: { gatilho: unknown }) {
  const tema = useTema();
  const meses = useMemo(
    () => historicoMensal(repositorio.lancamentosLocais(), new Date()).slice(-12),
    // `gatilho` muda quando o ledger muda.
    [gatilho],
  );
  if (meses.length === 0) return null;
  const max = Math.max(1, ...meses.map((m) => m.total));
  const c = cores(tema);
  return (
    <View style={{ gap: 8 }}>
      <View style={estilos.grafico}>
        {meses.map((m) => (
          <View
            key={m.mes}
            style={estilos.coluna}
            accessibilityLabel={`${m.mes}: ${m.total / 10} pontos`}
          >
            <View style={[estilos.pilha, { height: 100 }]}>
              {ATRIBUTOS.map((a) =>
                m.porAtributo[a] > 0 ? (
                  <View
                    key={a}
                    style={{ height: (100 * m.porAtributo[a]) / max, backgroundColor: c[a] }}
                  />
                ) : null,
              )}
            </View>
            <Text style={{ color: tema.sutil, fontSize: 9 }}>{m.mes.slice(5)}</Text>
          </View>
        ))}
      </View>
      <View style={estilos.legenda}>
        {ATRIBUTOS.map((a) => (
          <Text key={a} style={{ color: c[a], fontSize: 11 }}>
            ■ {NOMES_ATRIBUTOS[a]}
          </Text>
        ))}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  grafico: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  coluna: { flex: 1, alignItems: 'center', gap: 2 },
  pilha: { width: '100%', justifyContent: 'flex-end', flexDirection: 'column-reverse' },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
});
