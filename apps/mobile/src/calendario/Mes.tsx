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
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useItensNoIntervalo } from '../hooks';
import { useTema } from '../tema';
import { EntradaItem } from '../ui/EntradaItem';

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
  const itens = useItensNoIntervalo(de, ate);
  const porDia = useMemo(() => agruparPorDia(itens, dias), [itens, dias]);
  const mesAtual = partesDoDia(referencia).mes;

  return (
    <View style={{ flex: 1 }}>
      <View style={estilos.semana}>
        {semanas[0]!.map((d) => (
          <Text key={d} style={[estilos.nomeDia, { color: tema.sutil }]}>
            {nomeCurtoDoDia(d)}
          </Text>
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
                style={[estilos.celula, { borderColor: tema.borda, opacity: fora ? 0.45 : 1 }]}
                accessibilityLabel={`dia ${partesDoDia(d).dia}, ${porDia.get(d)?.length ?? 0} itens`}
              >
                <Text
                  style={[
                    estilos.numero,
                    ehHoje && { color: tema.hoje, fontWeight: '700' },
                    !ehHoje && { color: fora ? tema.foraDoMes : tema.texto },
                  ]}
                >
                  {partesDoDia(d).dia}
                </Text>
                {visiveis.map((i) => (
                  <EntradaItem key={i.id} item={i} variante="mini" />
                ))}
                {excedentes > 0 ? (
                  <Text style={[estilos.mais, { color: tema.sutil }]}>+{excedentes}</Text>
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
  nomeDia: { flex: 1, textAlign: 'center', fontSize: 11, paddingVertical: 4 },
  celula: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, padding: 1, overflow: 'hidden' },
  numero: { fontSize: 12, textAlign: 'center' },
  mais: { fontSize: 10, textAlign: 'center' },
});
