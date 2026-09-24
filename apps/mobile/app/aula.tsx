import { aulasDoDia, type Dia } from '@compasso/core';
import { ErroDeValidacao } from '@compasso/core/local';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { salaRegular, tituloDoDia } from '../src/datasUi';
import { useGrade } from '../src/hooks';
import { repositorio } from '../src/sync';
import { useTema } from '../src/tema';
import { Folha } from '../src/ui/Cabecalho';
import { Botao, Campo, Rotulo } from '../src/ui/Campos';
import { useAlerta } from '../src/ui/Dialogo';
import { Texto } from '../src/ui/Texto';

/**
 * Uma aula num dia (issue #61): disciplina, sala e professor — sem conclusão, aula não é tarefa.
 * Daqui se registram as exceções do dia: cancelar, trocar de sala, ou desfazer.
 */
export default function AulaDoDia() {
  const { slotId, dia } = useLocalSearchParams<{ slotId: string; dia: Dia }>();
  const tema = useTema();
  const alerta = useAlerta();
  const { top } = useSafeAreaInsets();
  const grade = useGrade();
  const aula = aulasDoDia(grade, dia).find((a) => a.slotId === slotId);
  const excecoes = grade.excecoes.filter((e) => e.slotId === slotId && e.date === dia);
  const [sala, setSala] = useState('');
  const [erro, setErro] = useState('');
  if (!aula) {
    return (
      <Folha topo={top + 120}>
        <Texto style={{ padding: 20, color: tema.sutil }}>Sem aula deste horário neste dia.</Texto>
      </Folha>
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
  const regular = salaRegular(grade, slotId);
  return (
    <Folha topo={top + 72} corFaixa={aula.cor}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[estilos.cabecalho, { borderBottomColor: tema.linha }]}>
          {aula.codigo ? (
            <Texto cinzel style={{ fontSize: 11, letterSpacing: 1.8, color: aula.cor }}>
              {aula.codigo}
            </Texto>
          ) : null}
          <Texto cinzel style={{ fontSize: 21, fontWeight: '600' }}>
            {aula.disciplina}
          </Texto>
          <Texto style={{ fontSize: 13, color: tema.texto2 }}>
            {tituloDoDia(aula.dia)} · {aula.inicio}–{aula.fim}
          </Texto>
          {aula.salaTrocada ? (
            <View style={estilos.linhaSala}>
              {regular ? (
                <Texto
                  style={{ fontSize: 13, color: tema.apagado, textDecorationLine: 'line-through' }}
                >
                  Sala {regular}
                </Texto>
              ) : null}
              <Texto style={{ fontSize: 13, color: tema.hoje, fontWeight: '700' }}>
                {aula.sala ?? '—'} (trocada neste dia)
              </Texto>
            </View>
          ) : (
            <Texto style={{ fontSize: 13, color: tema.texto2 }}>Sala {aula.sala ?? '—'}</Texto>
          )}
          {aula.professor ? (
            <Texto style={{ fontSize: 13, color: tema.texto2 }}>Prof. {aula.professor}</Texto>
          ) : null}
          {aula.cancelada ? (
            <Texto cinzel style={{ fontSize: 11, letterSpacing: 1.5, color: tema.perigo }}>
              CANCELADA NESTE DIA
            </Texto>
          ) : null}
          {aula.nota ? (
            <Texto style={{ fontSize: 12.5, color: tema.sutil, fontStyle: 'italic' }}>
              {aula.nota}
            </Texto>
          ) : null}
        </View>

        {excecoes.length ? (
          <View style={[estilos.bloco, { borderBottomWidth: 1, borderBottomColor: tema.linha }]}>
            <Rotulo>Exceções neste dia</Rotulo>
            {excecoes.map((e) => (
              <View
                key={e.id}
                style={[estilos.excecao, { backgroundColor: tema.campo, borderColor: tema.linha }]}
              >
                <Texto style={{ fontSize: 13, flex: 1 }}>
                  {e.type === 'cancelled'
                    ? 'Cancelamento'
                    : e.type === 'room_change'
                      ? `Troca para ${e.room}`
                      : 'Reposição'}
                </Texto>
                <Pressable
                  hitSlop={8}
                  accessibilityRole="button"
                  onPress={() => repositorio.removerExcecao(e.id)}
                >
                  <Texto
                    style={{
                      fontSize: 12,
                      color: tema.ouroEscuro,
                      borderBottomWidth: 1,
                      borderBottomColor: tema.ouroClaro,
                    }}
                  >
                    desfazer
                  </Texto>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={estilos.bloco}>
          <Rotulo>Sala só neste dia</Rotulo>
          <View style={estilos.trocar}>
            <View style={{ flex: 1 }}>
              <Campo value={sala} onChangeText={setSala} placeholder="ex.: C-101" />
            </View>
            <Botao
              compacto
              rotulo="Trocar"
              desativado={!sala.trim()}
              style={{ paddingVertical: 11 }}
              aoTocar={() =>
                tentar(() =>
                  repositorio.registrarExcecao({ ...base, type: 'room_change', room: sala.trim() }),
                )
              }
            />
          </View>
          {!aula.cancelada ? (
            <Botao
              perigo
              rotulo="Cancelar a aula deste dia"
              style={{ marginTop: 8 }}
              aoTocar={() =>
                tentar(() => repositorio.registrarExcecao({ ...base, type: 'cancelled' }))
              }
            />
          ) : null}
          <Botao
            variante="neutro"
            rotulo="Sem aula nenhuma neste dia (feriado, recesso)"
            aoTocar={() =>
              alerta('Cancelar todas as aulas do dia?', tituloDoDia(dia), [
                {
                  text: 'Cancelar todas',
                  style: 'destructive',
                  onPress: () => tentar(() => repositorio.cancelarAulasDoDia(dia)),
                },
                { text: 'Não', style: 'cancel' },
              ])
            }
          />
          {erro ? <Texto style={{ color: tema.perigo, fontSize: 12.5 }}>{erro}</Texto> : null}
        </View>
      </ScrollView>
    </Folha>
  );
}

const estilos = StyleSheet.create({
  cabecalho: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 6,
    borderBottomWidth: 1,
  },
  linhaSala: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  bloco: { paddingHorizontal: 20, paddingVertical: 16, gap: 10 },
  excecao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  trocar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
