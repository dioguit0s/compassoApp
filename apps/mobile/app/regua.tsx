import { ESFORCOS, REGUA_DE_ESFORCO } from '@compasso/core';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTema } from '../src/tema';

/** Régua de esforço, só leitura: é fixa de propósito, para a escala não inflar (§4.1). */
export default function Regua() {
  const tema = useTema();
  return (
    <ScrollView style={{ backgroundColor: tema.fundo }} contentContainerStyle={estilos.tela}>
      <Text style={{ color: tema.sutil }}>
        A estimativa é feita antes, comparando com estes exemplos. Ela não é configurável: é o que
        impede a escala de inflar com o tempo.
      </Text>
      {ESFORCOS.map((e) => (
        <View key={e} style={[estilos.linha, { borderColor: tema.borda }]}>
          <Text style={[estilos.valor, { color: tema.texto }]}>{e}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: tema.texto, fontWeight: '600' }}>
              {REGUA_DE_ESFORCO[e].resumo}
            </Text>
            <Text style={{ color: tema.sutil }}>{REGUA_DE_ESFORCO[e].exemplos.join(' · ')}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: 16, gap: 12 },
  linha: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  valor: { fontSize: 28, fontWeight: '700', width: 32, textAlign: 'center' },
});
