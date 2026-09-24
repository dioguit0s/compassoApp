import type { Aula } from '@compasso/core';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTema } from '../tema';
import { Seta } from './Icones';
import { Texto } from './Texto';

/**
 * Aula na faixa de cima da aba Hoje (especificação §7): horário, disciplina e sala, na cor da
 * disciplina — sem caixa de marcar, porque aula não é tarefa. Cancelada aparece riscada e
 * esmaecida; sala trocada mostra a regular riscada e a do dia em destaque.
 */
export function LinhaAula({ aula, salaRegular }: { aula: Aula; salaRegular?: string | null }) {
  const tema = useTema();
  const router = useRouter();
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/aula', params: { slotId: aula.slotId, dia: aula.dia } })
      }
      style={[estilos.linha, aula.cancelada && { opacity: 0.5 }]}
      accessibilityLabel={`Aula de ${aula.disciplina}, ${aula.inicio} às ${aula.fim}, sala ${aula.sala ?? 'não informada'}${aula.cancelada ? ', cancelada' : ''}${aula.salaTrocada ? ', sala trocada' : ''}`}
    >
      <View style={estilos.hora}>
        <Texto
          cinzel
          style={[
            { fontSize: 13, color: aula.cancelada ? tema.sutil : tema.texto },
            aula.cancelada && estilos.riscado,
          ]}
        >
          {aula.inicio}
        </Texto>
        <Texto style={{ fontSize: 10, color: tema.apagado }}>{aula.fim}</Texto>
      </View>
      <View style={[estilos.barra, { backgroundColor: aula.cor }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Texto
          style={[
            { fontSize: 14, fontWeight: '600', color: aula.cancelada ? tema.texto2 : tema.texto },
            aula.cancelada && estilos.riscado,
          ]}
        >
          {aula.disciplina}
        </Texto>
        {aula.cancelada ? (
          <Texto style={{ fontSize: 10.5, letterSpacing: 1.3, color: tema.rotulo }}>
            CANCELADA
          </Texto>
        ) : aula.salaTrocada ? (
          <View style={estilos.troca}>
            {salaRegular ? (
              <>
                <Texto style={[{ fontSize: 11.5, color: tema.apagado }, estilos.riscado]}>
                  {salaRegular}
                </Texto>
                <Seta cor={tema.hoje} />
              </>
            ) : null}
            <Texto style={{ fontSize: 11.5, fontWeight: '700', color: tema.hoje }}>
              sala {aula.sala ?? '—'}
            </Texto>
          </View>
        ) : (
          <Texto style={{ fontSize: 11.5, color: tema.sutil }}>
            sala {aula.sala ?? '—'}
            {aula.extra ? ' · reposição' : ''}
          </Texto>
        )}
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  hora: { width: 44 },
  barra: { width: 3, height: 30, borderRadius: 2 },
  troca: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  riscado: { textDecorationLine: 'line-through' },
});
