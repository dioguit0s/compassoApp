import { agruparPorDia, intervaloDosDias } from '@compasso/core';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { tituloDoDia } from '../../src/datasUi';
import { useHoje, useItensNoIntervalo } from '../../src/hooks';
import { sincronizarAgora } from '../../src/sync';
import { useTema } from '../../src/tema';
import { EntradaItem } from '../../src/ui/EntradaItem';

/**
 * Aba Hoje (especificação §7). Ordem fixa, de cima para baixo: saldo de moedas (F7), aulas do
 * dia (F5), itens do dia. Nesta fase só existe a faixa de itens; os dois lugares estão marcados.
 */
export default function Hoje() {
  const tema = useTema();
  const hoje = useHoje();
  const { de, ate } = useMemo(() => intervaloDosDias(hoje, hoje), [hoje]);
  const itens = useItensNoIntervalo(de, ate);
  const doDia = useMemo(() => agruparPorDia(itens, [hoje]).get(hoje) ?? [], [itens, hoje]);
  const [atualizando, setAtualizando] = useState(false);

  return (
    <View style={[estilos.tela, { backgroundColor: tema.fundo }]}>
      {/* F7: saldo de moedas no topo */}
      <Text style={[estilos.data, { color: tema.texto }]}>{tituloDoDia(hoje)}</Text>
      {/* F5: faixa de aulas do dia, acima dos itens */}
      <FlatList
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
          <View style={estilos.vazio}>
            <Text style={[estilos.vazioTitulo, { color: tema.texto }]}>Dia livre.</Text>
            <Text style={{ color: tema.sutil, textAlign: 'center' }}>
              Nada marcado para hoje. Toque em + para registrar algo.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  data: { fontSize: 22, fontWeight: '600', paddingHorizontal: 16, paddingTop: 16 },
  lista: { padding: 16, gap: 8, flexGrow: 1 },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 32 },
  vazioTitulo: { fontSize: 18, fontWeight: '600' },
});
