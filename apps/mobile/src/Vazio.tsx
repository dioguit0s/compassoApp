import { StyleSheet, Text, View } from 'react-native';

export function Vazio({ titulo, detalhe }: { titulo: string; detalhe?: string }) {
  return (
    <View style={estilos.tela}>
      <Text style={estilos.titulo}>{titulo}</Text>
      {detalhe ? <Text style={estilos.detalhe}>{detalhe}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  titulo: { fontSize: 20, fontWeight: '600' },
  detalhe: { marginTop: 8, color: '#666', textAlign: 'center' },
});
