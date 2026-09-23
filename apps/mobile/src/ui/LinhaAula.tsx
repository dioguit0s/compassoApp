import type { Aula } from '@compasso/core';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTema } from '../tema';

/**
 * Aula na faixa de cima da aba Hoje (especificação §7): horário, disciplina e sala, na cor da
 * disciplina — sem caixa de marcar, porque aula não é tarefa. Cancelada aparece riscada; sala
 * trocada, em destaque.
 */
export function LinhaAula({ aula }: { aula: Aula }) {
  const tema = useTema();
  const router = useRouter();
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/aula', params: { slotId: aula.slotId, dia: aula.dia } })
      }
      style={[estilos.linha, { backgroundColor: tema.superficie }]}
      accessibilityLabel={`Aula de ${aula.disciplina}, ${aula.inicio} às ${aula.fim}, sala ${aula.sala ?? 'não informada'}${aula.cancelada ? ', cancelada' : ''}${aula.salaTrocada ? ', sala trocada' : ''}`}
    >
      <View
        style={[estilos.barra, { backgroundColor: aula.cor, opacity: aula.cancelada ? 0.35 : 1 }]}
      />
      <Text style={[estilos.hora, { color: tema.sutil }]}>
        {aula.inicio}
        {'\n'}
        {aula.fim}
      </Text>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            estilos.nome,
            { color: aula.cancelada ? tema.sutil : tema.texto },
            aula.cancelada && estilos.riscado,
          ]}
        >
          {aula.disciplina}
          {aula.extra ? ' · reposição' : ''}
        </Text>
        <Text
          style={{
            color: aula.salaTrocada ? tema.hoje : tema.sutil,
            fontWeight: aula.salaTrocada ? '700' : '400',
          }}
        >
          {aula.cancelada
            ? 'cancelada'
            : `sala ${aula.sala ?? '—'}${aula.salaTrocada ? ' (trocada)' : ''}`}
        </Text>
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingRight: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  barra: { width: 5, alignSelf: 'stretch' },
  hora: { fontSize: 12, width: 40, textAlign: 'right' },
  nome: { fontSize: 15, fontWeight: '500' },
  riscado: { textDecorationLine: 'line-through' },
});
