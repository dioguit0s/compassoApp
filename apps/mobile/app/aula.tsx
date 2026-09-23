import { aulasDoDia, type Dia } from '@compasso/core';
import { ErroDeValidacao } from '@compasso/core/local';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { tituloDoDia } from '../src/datasUi';
import { useGrade } from '../src/hooks';
import { repositorio } from '../src/sync';
import { useTema } from '../src/tema';
import { Botao, Campo } from '../src/ui/Campos';

/**
 * Uma aula num dia (issue #61): disciplina, sala e professor — sem conclusão, aula não é tarefa.
 * Daqui se registram as exceções do dia: cancelar, trocar de sala, ou desfazer.
 */
export default function AulaDoDia() {
  const { slotId, dia } = useLocalSearchParams<{ slotId: string; dia: Dia }>();
  const tema = useTema();
  const grade = useGrade();
  const aula = aulasDoDia(grade, dia).find((a) => a.slotId === slotId);
  const excecoes = grade.excecoes.filter((e) => e.slotId === slotId && e.date === dia);
  const [sala, setSala] = useState('');
  const [erro, setErro] = useState('');
  if (!aula) {
    return (
      <View style={[estilos.tela, { backgroundColor: tema.fundo }]}>
        <Text style={{ color: tema.texto }}>Sem aula deste horário neste dia.</Text>
      </View>
    );
  }
  const tentar = (fn: () => void) => {
    try {
      fn();
      setErro('');
    } catch (e) {
      setErro(e instanceof ErroDeValidacao ? e.motivos.join('; ') : (e as Error).message);
    }
  };
  const base = { slotId, date: dia, room: null, note: null, startTime: null, endTime: null };
  return (
    <ScrollView style={{ backgroundColor: tema.fundo }} contentContainerStyle={estilos.tela}>
      <Stack.Screen options={{ title: aula.codigo ?? 'Aula' }} />
      <View style={[estilos.cabecalho, { borderLeftColor: aula.cor }]}>
        <Text style={[estilos.titulo, { color: tema.texto }]}>{aula.disciplina}</Text>
        <Text style={{ color: tema.sutil }}>
          {tituloDoDia(aula.dia)} · {aula.inicio}–{aula.fim}
        </Text>
        <Text style={{ color: aula.salaTrocada ? tema.hoje : tema.texto }}>
          Sala {aula.sala ?? '—'}
          {aula.salaTrocada ? ' (trocada neste dia)' : ''}
        </Text>
        {aula.professor ? <Text style={{ color: tema.texto }}>Prof. {aula.professor}</Text> : null}
        {aula.cancelada ? <Text style={{ color: tema.perigo }}>Cancelada neste dia</Text> : null}
        {aula.nota ? <Text style={{ color: tema.sutil }}>{aula.nota}</Text> : null}
      </View>

      {excecoes.map((e) => (
        <View key={e.id} style={estilos.linha}>
          <Text style={{ color: tema.texto, flex: 1 }}>
            {e.type === 'cancelled'
              ? 'Cancelamento'
              : e.type === 'room_change'
                ? `Troca para ${e.room}`
                : 'Reposição'}
          </Text>
          <Text style={{ color: tema.perigo }} onPress={() => repositorio.removerExcecao(e.id)}>
            desfazer
          </Text>
        </View>
      ))}

      {!aula.cancelada ? (
        <Botao
          rotulo="Cancelar a aula deste dia"
          perigo
          aoTocar={() => tentar(() => repositorio.registrarExcecao({ ...base, type: 'cancelled' }))}
        />
      ) : null}
      <Campo rotulo="Sala só neste dia" value={sala} onChangeText={setSala} />
      <Botao
        rotulo="Trocar sala neste dia"
        desativado={!sala.trim()}
        aoTocar={() =>
          tentar(() =>
            repositorio.registrarExcecao({ ...base, type: 'room_change', room: sala.trim() }),
          )
        }
      />
      <Botao
        rotulo="Sem aula nenhuma neste dia (feriado, recesso)"
        aoTocar={() =>
          Alert.alert('Cancelar todas as aulas do dia?', tituloDoDia(dia), [
            { text: 'Não', style: 'cancel' },
            {
              text: 'Cancelar todas',
              style: 'destructive',
              onPress: () => tentar(() => repositorio.cancelarAulasDoDia(dia)),
            },
          ])
        }
      />
      {erro ? <Text style={{ color: tema.perigo }}>{erro}</Text> : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: 16, gap: 12 },
  cabecalho: { borderLeftWidth: 6, paddingLeft: 12, gap: 4 },
  titulo: { fontSize: 20, fontWeight: '600' },
  linha: { flexDirection: 'row', paddingVertical: 6 },
});
