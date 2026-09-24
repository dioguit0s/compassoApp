import { ATRIBUTOS, NOMES_ATRIBUTOS, historicoMensal } from '@compasso/core';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { repositorio } from '../sync';
import { COR_DO_ATRIBUTO, useTema } from '../tema';
import { Texto } from './Texto';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ALTURA = 92;

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
  return (
    <View style={{ gap: 12 }}>
      <View style={estilos.grafico}>
        {meses.map((m) => (
          <View
            key={m.mes}
            style={estilos.coluna}
            accessibilityLabel={`${m.mes}: ${m.total / 10} pontos`}
          >
            <View style={[estilos.pilha, { height: ALTURA }]}>
              {ATRIBUTOS.map((a) =>
                m.porAtributo[a] > 0 ? (
                  <View
                    key={a}
                    style={{
                      height: (ALTURA * m.porAtributo[a]) / max,
                      backgroundColor: COR_DO_ATRIBUTO[a],
                    }}
                  />
                ) : null,
              )}
            </View>
            <Texto style={{ color: tema.apagado, fontSize: 8.5, textAlign: 'center' }}>
              {MESES[Number(m.mes.slice(5)) - 1] ?? m.mes.slice(5)}
            </Texto>
          </View>
        ))}
      </View>
      <View style={estilos.legenda}>
        {ATRIBUTOS.map((a) => (
          <View key={a} style={estilos.chave}>
            <View style={[estilos.amostra, { backgroundColor: COR_DO_ATRIBUTO[a] }]} />
            <Texto style={{ color: tema.sutil, fontSize: 10.5 }}>{NOMES_ATRIBUTOS[a]}</Texto>
          </View>
        ))}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  grafico: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  coluna: { flex: 1, gap: 4 },
  pilha: { width: '100%', justifyContent: 'flex-start', flexDirection: 'column-reverse' },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chave: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  amostra: { width: 8, height: 8, borderRadius: 2 },
});
