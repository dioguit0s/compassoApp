import {
  diaDe,
  FUSO_PADRAO,
  inicioDoDia,
  limitesDiaInteiro,
  somarDias,
  type Dia,
} from '@compasso/core';
import { ErroDeValidacao, type ItemLocal } from '@compasso/core/local';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fusoDoAparelhoDifere } from '../../src/datasUi';
import { repositorio } from '../../src/sync';
import { useTema } from '../../src/tema';
import { CampoDataHora } from '../../src/ui/CampoDataHora';

const LEMBRETES: { rotulo: string; minutos: number | null }[] = [
  { rotulo: 'Nenhum', minutos: null },
  { rotulo: '5 min', minutos: 5 },
  { rotulo: '15 min', minutos: 15 },
  { rotulo: '30 min', minutos: 30 },
  { rotulo: '1 h', minutos: 60 },
  { rotulo: '1 dia', minutos: 1440 },
];

const HORA_MS = 3_600_000;

/** Detalhe do item (especificação §7): edição completa, notas, lembrete, exclusão. */
export default function DetalheDoItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = id ? repositorio.obter(id) : null;
  const router = useRouter();
  const tema = useTema();
  if (!item) {
    return (
      <View style={[estilos.tela, { backgroundColor: tema.superficie }]}>
        <Text style={{ color: tema.texto }}>Item não encontrado (talvez excluído).</Text>
      </View>
    );
  }
  return <Formulario item={item} aoTerminar={() => router.back()} />;
}

function Formulario({ item, aoTerminar }: { item: ItemLocal; aoTerminar: () => void }) {
  const tema = useTema();
  const [titulo, setTitulo] = useState(item.title);
  const [notas, setNotas] = useState(item.notes ?? '');
  const [diaInteiro, setDiaInteiro] = useState(item.allDay);
  const [inicio, setInicio] = useState<Date>(item.startAt ?? item.dueAt ?? new Date());
  const [fim, setFim] = useState<Date | null>(item.endAt);
  const [lembrete, setLembrete] = useState<number | null>(item.reminderMinutesBefore);
  const [erros, setErros] = useState<string[]>([]);
  const ehTarefa = item.kind === 'task';

  // Dia inteiro guarda fim exclusivo; na tela, mostra o último dia (inclusive).
  const primeiroDia: Dia = diaDe(inicio);
  const ultimoDia: Dia = fim && fim > inicio ? diaDe(new Date(fim.getTime() - 1)) : primeiroDia;

  function alternarDiaInteiro(valor: boolean) {
    setDiaInteiro(valor);
    if (valor) {
      const { startAt, endAt } = limitesDiaInteiro(primeiroDia, ultimoDia);
      setInicio(startAt);
      setFim(endAt);
    } else {
      const noveHoras = new Date(inicioDoDia(primeiroDia).getTime() + 9 * HORA_MS);
      setInicio(noveHoras);
      setFim(new Date(noveHoras.getTime() + HORA_MS));
    }
  }

  function salvar() {
    try {
      repositorio.editar(item.id, {
        title: titulo.trim(),
        notes: notas.trim() ? notas : null,
        allDay: ehTarefa ? false : diaInteiro,
        ...(ehTarefa ? { dueAt: inicio } : { startAt: inicio, endAt: fim }),
        reminderMinutesBefore: lembrete,
      });
      aoTerminar();
    } catch (e) {
      setErros(e instanceof ErroDeValidacao ? e.motivos : [(e as Error).message]);
    }
  }

  function excluir() {
    Alert.alert('Excluir item?', 'Ele vai para a lixeira por 30 dias.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => {
          repositorio.excluir(item.id);
          aoTerminar();
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={{ backgroundColor: tema.superficie }}
      contentContainerStyle={estilos.tela}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: ehTarefa ? 'Tarefa' : 'Evento',
          headerRight: () => (
            <Pressable onPress={salvar} accessibilityLabel="Salvar">
              <Text style={{ color: tema.destaque, fontWeight: '600', fontSize: 16 }}>Salvar</Text>
            </Pressable>
          ),
        }}
      />
      <TextInput
        style={[estilos.titulo, { color: tema.texto, borderColor: tema.borda }]}
        value={titulo}
        onChangeText={setTitulo}
        placeholder="Título"
        placeholderTextColor={tema.sutil}
      />

      <View style={estilos.linha}>
        <Text style={{ color: tema.sutil }}>Tipo</Text>
        <Text style={{ color: tema.texto }}>
          {ehTarefa ? 'Tarefa (pontua)' : item.effort ? 'Evento que pontua' : 'Compromisso'}
        </Text>
      </View>
      {!ehTarefa && item.effort === null ? (
        <Text style={[estilos.dica, { color: tema.sutil }]}>
          Tarefas e esforço entram com a gamificação. Por enquanto, todo item é compromisso.
        </Text>
      ) : null}

      {ehTarefa ? (
        <CampoDataHora rotulo="Prazo" valor={inicio} aoMudar={setInicio} />
      ) : (
        <>
          <View style={estilos.linha}>
            <Text style={{ color: tema.texto }}>Dia inteiro</Text>
            <Switch value={diaInteiro} onValueChange={alternarDiaInteiro} />
          </View>
          {diaInteiro ? (
            <>
              <CampoDataHora
                rotulo="De"
                somenteData
                valor={inicio}
                aoMudar={(v) => {
                  const primeiro = diaDe(v);
                  const ultimo = primeiro > ultimoDia ? primeiro : ultimoDia;
                  const l = limitesDiaInteiro(primeiro, ultimo);
                  setInicio(l.startAt);
                  setFim(l.endAt);
                }}
              />
              <CampoDataHora
                rotulo="Até"
                somenteData
                valor={inicioDoDia(ultimoDia)}
                aoMudar={(v) => setFim(inicioDoDia(somarDias(diaDe(v), 1)))}
              />
            </>
          ) : (
            <>
              <CampoDataHora
                rotulo="Início"
                valor={inicio}
                aoMudar={(v) => {
                  // Mover o início leva o fim junto, mantendo a duração.
                  if (fim) setFim(new Date(fim.getTime() + (v.getTime() - inicio.getTime())));
                  setInicio(v);
                }}
              />
              {fim ? (
                <CampoDataHora rotulo="Fim" valor={fim} aoMudar={setFim} />
              ) : (
                <Pressable onPress={() => setFim(new Date(inicio.getTime() + HORA_MS))}>
                  <Text style={{ color: tema.destaque }}>+ adicionar fim</Text>
                </Pressable>
              )}
            </>
          )}
        </>
      )}
      {fusoDoAparelhoDifere() ? (
        <Text style={[estilos.dica, { color: tema.sutil }]}>
          Horários em hora de São Paulo ({FUSO_PADRAO}), não no fuso deste aparelho.
        </Text>
      ) : null}

      <Text style={{ color: tema.sutil }}>Lembrete antes</Text>
      <View style={estilos.chips}>
        {LEMBRETES.map((l) => {
          const ativo = lembrete === l.minutos;
          return (
            <Pressable
              key={l.rotulo}
              onPress={() => setLembrete(l.minutos)}
              style={[
                estilos.chip,
                { borderColor: tema.borda },
                ativo && { backgroundColor: tema.destaque, borderColor: tema.destaque },
              ]}
            >
              <Text style={{ color: ativo ? tema.superficie : tema.texto }}>{l.rotulo}</Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        style={[estilos.notas, { color: tema.texto, borderColor: tema.borda }]}
        value={notas}
        onChangeText={setNotas}
        placeholder="Notas"
        placeholderTextColor={tema.sutil}
        multiline
      />

      {erros.map((e) => (
        <Text key={e} style={{ color: tema.perigo }}>
          • {e}
        </Text>
      ))}

      <Pressable onPress={excluir} style={[estilos.excluir, { borderColor: tema.perigo }]}>
        <Text style={{ color: tema.perigo }}>Excluir</Text>
      </Pressable>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: 16, gap: 14 },
  titulo: { fontSize: 20, borderBottomWidth: 1, paddingVertical: 8 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dica: { fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  notas: { borderWidth: 1, borderRadius: 8, padding: 10, minHeight: 100, textAlignVertical: 'top' },
  excluir: { borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 },
});
