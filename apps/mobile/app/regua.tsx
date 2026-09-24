import { ESFORCOS, REGUA_DE_ESFORCO } from '@compasso/core';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTema } from '../src/tema';
import { CabecalhoInterno } from '../src/ui/Cabecalho';
import { Texto } from '../src/ui/Texto';

/** Régua de esforço, só leitura: é fixa de propósito, para a escala não inflar (§4.1). */
export default function Regua() {
  const tema = useTema();
  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <CabecalhoInterno voltar="Configurações" titulo="Régua de esforço" />
      <ScrollView contentContainerStyle={estilos.tela}>
        <Texto style={{ fontSize: 13, lineHeight: 20, color: tema.texto2, paddingBottom: 10 }}>
          A régua é fixa de propósito e igual para todas as contas: um 3 de hoje vale o mesmo que um
          3 do mês passado. A estimativa é feita antes, comparando com estes exemplos.
        </Texto>
        {ESFORCOS.map((e) => (
          <View key={e} style={[estilos.linha, { borderTopColor: tema.linha }]}>
            <Texto cinzel style={[estilos.valor, { color: tema.ouro }]}>
              {e}
            </Texto>
            <View style={{ flex: 1, gap: 4 }}>
              <Texto style={{ fontSize: 14, fontWeight: '700' }}>
                {REGUA_DE_ESFORCO[e].resumo}
              </Texto>
              <Texto style={{ fontSize: 12.5, lineHeight: 18, color: tema.sutil }}>
                {REGUA_DE_ESFORCO[e].exemplos.join(', ')}
              </Texto>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 4 },
  linha: { flexDirection: 'row', gap: 16, paddingVertical: 14, borderTopWidth: 1 },
  valor: { width: 40, fontSize: 34, fontWeight: '700', lineHeight: 38, textAlign: 'center' },
});
