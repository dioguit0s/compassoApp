import { StyleSheet, View } from 'react-native';
import { useTema } from '../tema';
import { Moeda } from './Icones';
import { Texto } from './Texto';

/** Saldo de moedas em pílula (topo da aba Hoje); negativo em vermelho, só o contorno da moeda. */
export function PilulaDeSaldo({ saldo }: { saldo: number }) {
  const tema = useTema();
  const negativo = saldo < 0;
  return (
    <View
      style={[
        estilos.pilula,
        negativo
          ? { borderColor: tema.perigo, backgroundColor: tema.perigoFundo }
          : { borderColor: tema.ouroClaro, backgroundColor: tema.folha },
      ]}
      accessibilityLabel={`Saldo: ${saldo} ${Math.abs(saldo) === 1 ? 'moeda' : 'moedas'}`}
    >
      <Moeda negativa={negativo} />
      <Texto
        cinzel
        style={{ fontSize: 14, fontWeight: '600', color: negativo ? tema.perigo : tema.moedaTexto }}
      >
        {negativo ? `−${Math.abs(saldo)}` : saldo}
      </Texto>
    </View>
  );
}

const estilos = StyleSheet.create({
  pilula: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 999,
  },
});
