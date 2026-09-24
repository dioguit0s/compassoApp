import {
  agruparPorDia,
  intervaloDosDias,
  nomeCurtoDoDia,
  partesDoDia,
  recortarDia,
  semanasDoMes,
  type Dia,
} from '@compasso/core';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAgenda } from '../hooks';
import { useTema } from '../tema';
import { EntradaItem } from '../ui/EntradaItem';
import { Texto } from '../ui/Texto';
import { quantas } from '../texto';

/**
 * Visão de mês: densidade e viagens. No máximo três linhas por dia e "+N" (especificação §7).
 * Evento de vários dias aparece em cada dia que ocupa, como uma linha repetida — mais simples que
 * uma faixa contínua e legível na largura do celular (regra alternativa registrada na issue #29).
 */
export function Mes({
  referencia,
  hoje,
  aoTocarDia,
}: {
  referencia: Dia;
  hoje: Dia;
  aoTocarDia: (dia: Dia) => void;
}) {
  const tema = useTema();
  const semanas = useMemo(() => semanasDoMes(referencia), [referencia]);
  const dias = useMemo(() => semanas.flat(), [semanas]);
  const { de, ate } = useMemo(() => intervaloDosDias(dias[0]!, dias.at(-1)!), [dias]);
  const itens = useAgenda(de, ate);
  const porDia = useMemo(() => agruparPorDia(itens, dias), [itens, dias]);
  const mesAtual = partesDoDia(referencia).mes;

  return (
    <View style={{ flex: 1 }}>
      <View
        style={[
          estilos.semana,
          { backgroundColor: tema.faixa, borderColor: tema.borda },
          estilos.nomes,
        ]}
      >
        {semanas[0]!.map((d) => (
          <Texto key={d} cinzel style={[estilos.nomeDia, { color: tema.rotulo }]}>
            {nomeCurtoDoDia(d).charAt(0).toLocaleUpperCase('pt-BR')}
          </Texto>
        ))}
      </View>
      {semanas.map((semana) => (
        <View key={semana[0]} style={[estilos.semana, { flex: 1 }]}>
          {semana.map((d) => {
            const { visiveis, excedentes } = recortarDia(porDia.get(d) ?? []);
            const fora = partesDoDia(d).mes !== mesAtual;
            const ehHoje = d === hoje;
            return (
              <Pressable
                key={d}
                onPress={() => aoTocarDia(d)}
                style={[
                  estilos.celula,
                  { borderColor: tema.grade },
                  ehHoje && { backgroundColor: tema.hojeFundo },
                ]}
                accessibilityLabel={`dia ${partesDoDia(d).dia}${ehHoje ? ', hoje' : ''}, ${quantas(porDia.get(d)?.length ?? 0, 'item', 'itens')}`}
              >
                <View style={[estilos.numero, ehHoje && { backgroundColor: tema.hoje }]}>
                  <Texto
                    cinzel
                    style={{
                      fontSize: 11,
                      fontWeight: ehHoje ? '700' : '500',
                      color: ehHoje ? tema.sobreOuro : fora ? tema.foraDoMes : tema.texto,
                    }}
                  >
                    {partesDoDia(d).dia}
                  </Texto>
                </View>
                <View style={fora ? { opacity: 0.5 } : undefined}>
                  {visiveis.map((i) => (
                    <EntradaItem key={i.id} item={i} variante="mini" />
                  ))}
                </View>
                {excedentes > 0 ? (
                  <Texto style={[estilos.mais, { color: tema.rotulo }]}>+{excedentes}</Texto>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  semana: { flexDirection: 'row' },
  nomes: { borderBottomWidth: 1 },
  nomeDia: { flex: 1, textAlign: 'center', fontSize: 9.5, paddingVertical: 6 },
  celula: {
    flex: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: 2,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  numero: {
    alignSelf: 'center',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mais: { fontSize: 8.5, paddingLeft: 3, marginTop: 1 },
});
