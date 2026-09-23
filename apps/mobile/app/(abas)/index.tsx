import { agruparPorDia, intervaloDosDias } from '@compasso/core';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { tituloDoDia } from '../../src/datasUi';
import { useAgenda, useAulas, useHoje, useProgresso } from '../../src/hooks';
import { sincronizarAgora } from '../../src/sync';
import { useTema } from '../../src/tema';
import { EntradaItem } from '../../src/ui/EntradaItem';
import { IndicadorSync } from '../../src/ui/IndicadorSync';
import { LinhaAula } from '../../src/ui/LinhaAula';
import { moedas } from '../../src/texto';

/**
 * Aba Hoje (especificação §7). Ordem fixa, de cima para baixo: saldo de moedas (F7), aulas do
 * dia (F5), itens do dia. Nesta fase só existe a faixa de itens; os dois lugares estão marcados.
 */
export default function Hoje() {
  const tema = useTema();
  const hoje = useHoje();
  const { de, ate } = useMemo(() => intervaloDosDias(hoje, hoje), [hoje]);
  const itens = useAgenda(de, ate);
  const doDia = useMemo(() => agruparPorDia(itens, [hoje]).get(hoje) ?? [], [itens, hoje]);
  const [atualizando, setAtualizando] = useState(false);
  const dias = useMemo(() => [hoje], [hoje]);
  const aulas = useAulas(dias).get(hoje) ?? [];
  const { saldo } = useProgresso();

  return (
    <View style={[estilos.tela, { backgroundColor: tema.fundo }]}>
      {/* Saldo de moedas no topo (especificação §7) — o mesmo da aba Recompensas. */}
      <View style={estilos.topo}>
        <Text style={[estilos.data, { color: tema.texto }]}>{tituloDoDia(hoje)}</Text>
        <Text style={{ color: saldo < 0 ? tema.perigo : tema.sutil, fontWeight: '600' }}>
          {moedas(saldo)}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 16 }}>
        <IndicadorSync />
      </View>
      <FlatList
        ListHeaderComponent={
          // Faixa de aulas do dia, acima dos itens, em ordem fixa (especificação §7).
          aulas.length ? (
            <View style={estilos.aulas}>
              {aulas.map((a) => (
                <LinhaAula key={a.id} aula={a} />
              ))}
            </View>
          ) : null
        }
        data={doDia}
        keyExtractor={(i) => i.id}
        contentContainerStyle={estilos.lista}
        renderItem={({ item }) => <EntradaItem item={item} variante="linha" />}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={async () => {
              setAtualizando(true);
              await sincronizarAgora();
              setAtualizando(false);
            }}
          />
        }
        ListEmptyComponent={
          aulas.length ? null : (
            <View style={estilos.vazio}>
              <Text style={[estilos.vazioTitulo, { color: tema.texto }]}>Dia livre.</Text>
              <Text style={{ color: tema.sutil, textAlign: 'center' }}>
                Nada marcado para hoje. Toque em + para registrar algo.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  topo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  data: { fontSize: 22, fontWeight: '600' },
  lista: { padding: 16, gap: 8, flexGrow: 1 },
  aulas: { gap: 6, marginBottom: 8 },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 32 },
  vazioTitulo: { fontSize: 18, fontWeight: '600' },
});
