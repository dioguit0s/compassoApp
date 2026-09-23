import {
  agruparPorDia,
  diaDe,
  diasDaSemana,
  intervaloDosDias,
  minutosDoDia,
  nomeCurtoDoDia,
  partesDoDia,
  posicionarNoDia,
  vaiParaFaixaDoDia,
  type Dia,
} from '@compasso/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useItensNoIntervalo } from '../hooks';
import { useTema } from '../tema';
import { EntradaItem } from '../ui/EntradaItem';

const HORA_PX = 44;
const MARGEM = 32;

/** Visão de semana: onde o dia tem altura e dá para ver os buracos entre compromissos. */
export function Semana({ referencia, hoje }: { referencia: Dia; hoje: Dia }) {
  const tema = useTema();
  const { width } = useWindowDimensions();
  const dias = useMemo(() => diasDaSemana(referencia), [referencia]);
  const { de, ate } = useMemo(() => intervaloDosDias(dias[0]!, dias[6]!), [dias]);
  const itens = useItensNoIntervalo(de, ate);
  const porDia = useMemo(() => agruparPorDia(itens, dias), [itens, dias]);
  const larguraDia = (width - MARGEM) / 7;
  const rolagem = useRef<ScrollView>(null);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    rolagem.current?.scrollTo({ y: 7 * HORA_PX, animated: false });
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <View style={[estilos.cabecalho, { borderColor: tema.borda }]}>
        <View style={{ width: MARGEM }} />
        {dias.map((d) => {
          const ehHoje = d === hoje;
          return (
            <View key={d} style={{ width: larguraDia, alignItems: 'center' }}>
              <Text style={{ color: ehHoje ? tema.hoje : tema.sutil, fontSize: 11 }}>
                {nomeCurtoDoDia(d)}
              </Text>
              <Text
                style={[
                  estilos.numero,
                  { color: ehHoje ? tema.hoje : tema.texto, fontWeight: ehHoje ? '700' : '400' },
                ]}
              >
                {partesDoDia(d).dia}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Faixa de dia inteiro, vários dias e tarefas com prazo */}
      <View style={[estilos.faixa, { borderColor: tema.borda }]}>
        <View style={{ width: MARGEM }} />
        {dias.map((d) => (
          <View key={d} style={{ width: larguraDia, paddingHorizontal: 1 }}>
            {(porDia.get(d) ?? [])
              .filter((i) => vaiParaFaixaDoDia(i))
              .map((i) => (
                <EntradaItem key={i.id} item={i} variante="mini" />
              ))}
          </View>
        ))}
      </View>

      <ScrollView ref={rolagem}>
        <View style={{ flexDirection: 'row', height: 24 * HORA_PX }}>
          <View style={{ width: MARGEM }}>
            {Array.from({ length: 24 }, (_, h) => (
              <Text key={h} style={[estilos.hora, { top: h * HORA_PX - 6, color: tema.sutil }]}>
                {h === 0 ? '' : `${h}h`}
              </Text>
            ))}
          </View>
          {dias.map((d) => (
            <View
              key={d}
              style={{ width: larguraDia, borderLeftWidth: 1, borderColor: tema.borda }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <View
                  key={h}
                  style={[estilos.linhaHora, { top: h * HORA_PX, borderColor: tema.borda }]}
                />
              ))}
              {posicionarNoDia(porDia.get(d) ?? [], d).map((b) => (
                <EntradaItem
                  key={b.item.id}
                  item={b.item}
                  variante="bloco"
                  style={{
                    position: 'absolute',
                    top: (b.inicioMin / 60) * HORA_PX,
                    height: Math.max(16, ((b.fimMin - b.inicioMin) / 60) * HORA_PX - 1),
                    left: (b.coluna * larguraDia) / b.colunas,
                    width: larguraDia / b.colunas - 1,
                  }}
                />
              ))}
              {d === hoje && diaDe(agora) === hoje ? (
                <View
                  style={[
                    estilos.agora,
                    { top: (minutosDoDia(agora) / 60) * HORA_PX, backgroundColor: tema.hoje },
                  ]}
                />
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  cabecalho: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1 },
  numero: { fontSize: 16 },
  faixa: { flexDirection: 'row', minHeight: 8, paddingVertical: 2, borderBottomWidth: 1 },
  hora: { position: 'absolute', right: 4, fontSize: 10 },
  linhaHora: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  agora: { position: 'absolute', left: 0, right: 0, height: 2 },
});
