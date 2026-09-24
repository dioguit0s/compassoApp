import { agruparPorDia, intervaloDosDias } from '@compasso/core';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { partesDoTitulo, salaRegular } from '../../src/datasUi';
import { useAgenda, useAulas, useGrade, useHoje, useProgresso } from '../../src/hooks';
import { sincronizarAgora } from '../../src/sync';
import { FOLGA_DO_FAB, useTema } from '../../src/tema';
import { Secao } from '../../src/ui/Campos';
import { EntradaItem } from '../../src/ui/EntradaItem';
import { Emblema } from '../../src/ui/Icones';
import { IndicadorSync } from '../../src/ui/IndicadorSync';
import { LinhaAula } from '../../src/ui/LinhaAula';
import { PilulaDeSaldo } from '../../src/ui/Saldo';
import { Texto } from '../../src/ui/Texto';

/**
 * Aba Hoje (especificação §7). Ordem fixa, de cima para baixo: saldo de moedas (F7), aulas do
 * dia (F5), itens do dia.
 */
export default function Hoje() {
  const tema = useTema();
  const { top } = useSafeAreaInsets();
  const hoje = useHoje();
  const { de, ate } = useMemo(() => intervaloDosDias(hoje, hoje), [hoje]);
  const itens = useAgenda(de, ate);
  const doDia = useMemo(() => agruparPorDia(itens, [hoje]).get(hoje) ?? [], [itens, hoje]);
  const [atualizando, setAtualizando] = useState(false);
  const dias = useMemo(() => [hoje], [hoje]);
  const aulas = useAulas(dias).get(hoje) ?? [];
  const grade = useGrade();
  const { saldo } = useProgresso();
  const titulo = partesDoTitulo(hoje);

  return (
    <View style={[estilos.tela, { backgroundColor: tema.fundo }]}>
      {/* Saldo de moedas no topo (especificação §7) — o mesmo da aba Recompensas. */}
      <View
        style={[
          estilos.topo,
          { paddingTop: top + 16, backgroundColor: tema.cabecalho, borderBottomColor: tema.borda },
        ]}
      >
        <View style={estilos.topoLinha}>
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Texto cinzel style={{ fontSize: 11, letterSpacing: 2.6, color: tema.rotulo }}>
              {titulo.semana.toLocaleUpperCase('pt-BR')}
            </Texto>
            <Texto cinzel style={{ fontSize: 22, fontWeight: '700' }}>
              {titulo.data}
            </Texto>
          </View>
          <PilulaDeSaldo saldo={saldo} />
        </View>
        <IndicadorSync />
      </View>
      <FlatList
        ListHeaderComponent={
          <>
            {/* Faixa de aulas do dia, acima dos itens, em ordem fixa (especificação §7). */}
            {aulas.length ? (
              <View
                style={[
                  estilos.aulas,
                  { backgroundColor: tema.faixa, borderBottomColor: tema.borda },
                ]}
              >
                <Secao titulo="Aulas" dica="acontecem com você" />
                <View style={{ marginTop: 6 }}>
                  {aulas.map((a) => (
                    <LinhaAula key={a.id} aula={a} salaRegular={salaRegular(grade, a.slotId)} />
                  ))}
                </View>
              </View>
            ) : null}
            {doDia.length ? (
              <View style={estilos.secaoItens}>
                <Secao titulo="Itens do dia" />
              </View>
            ) : null}
          </>
        }
        data={doDia}
        keyExtractor={(i) => i.id}
        contentContainerStyle={estilos.lista}
        renderItem={({ item }) => (
          <View style={estilos.item}>
            <EntradaItem item={item} variante="linha" />
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            colors={[tema.ouro]}
            tintColor={tema.ouro}
            progressBackgroundColor={tema.folha}
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
              <Emblema />
              <Texto cinzel style={{ fontSize: 22, fontWeight: '600' }}>
                Dia livre.
              </Texto>
              <Texto
                style={{ fontSize: 14, lineHeight: 21, color: tema.sutil, textAlign: 'center' }}
              >
                Nada marcado para hoje. Toque em + para registrar algo.
              </Texto>
            </View>
          )
        }
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  topo: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, gap: 8 },
  topoLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },
  aulas: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1 },
  secaoItens: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 2 },
  lista: { paddingBottom: FOLGA_DO_FAB, gap: 8, flexGrow: 1 },
  item: { paddingHorizontal: 16 },
  vazio: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 48,
  },
});
