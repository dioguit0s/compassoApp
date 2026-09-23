import { PALETA_DESTAQUE, REGEX_HORA } from '@compasso/core';
import { ErroDeValidacao, type DisciplinaLocal, type HorarioLocal } from '@compasso/core/local';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGrade } from '../src/hooks';
import { repositorio } from '../src/sync';
import { useTema } from '../src/tema';
import { Botao, Campo, Chip } from '../src/ui/Campos';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Criar/editar disciplina e seus horários (issue #59). `?id=` edita; `?semestre=` cria. */
export default function Disciplina() {
  const { id, semestre } = useLocalSearchParams<{ id?: string; semestre?: string }>();
  const grade = useGrade();
  const existente = id ? grade.disciplinas.find((c) => c.id === id) : undefined;
  if (id && !existente) return null; // carregando (ou excluída)
  return (
    <Formulario disciplina={existente ?? null} semestreId={existente?.semesterId ?? semestre!} />
  );
}

function Formulario({
  disciplina,
  semestreId,
}: {
  disciplina: DisciplinaLocal | null;
  semestreId: string;
}) {
  const tema = useTema();
  const router = useRouter();
  const grade = useGrade();
  const [nome, setNome] = useState(disciplina?.name ?? '');
  const [codigo, setCodigo] = useState(disciplina?.code ?? '');
  const [professor, setProfessor] = useState(disciplina?.professor ?? '');
  const [cor, setCor] = useState(
    disciplina?.color ?? PALETA_DESTAQUE[grade.disciplinas.length % PALETA_DESTAQUE.length]!,
  );
  const [sala, setSala] = useState(disciplina?.defaultRoom ?? '');
  const [notas, setNotas] = useState(disciplina?.notes ?? '');
  const [erro, setErro] = useState('');
  const horarios = disciplina
    ? grade.horarios
        .filter((h) => h.courseId === disciplina.id)
        .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
    : [];

  const tentar = (fn: () => void) => {
    try {
      fn();
      setErro('');
    } catch (e) {
      setErro(e instanceof ErroDeValidacao ? e.motivos.join('; ') : (e as Error).message);
    }
  };
  const vazio = (t: string) => (t.trim() ? t.trim() : null);
  const dados = () => ({
    name: nome.trim(),
    code: vazio(codigo),
    professor: vazio(professor),
    color: cor,
    defaultRoom: vazio(sala),
    notes: vazio(notas),
  });

  return (
    <ScrollView
      style={{ backgroundColor: tema.fundo }}
      contentContainerStyle={estilos.tela}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: disciplina ? disciplina.name : 'Nova disciplina' }} />
      <Campo
        rotulo="Nome"
        value={nome}
        onChangeText={setNome}
        placeholder="Sistemas Reconfiguráveis"
      />
      <Campo rotulo="Código" value={codigo} onChangeText={setCodigo} autoCapitalize="characters" />
      <Campo rotulo="Professor" value={professor} onChangeText={setProfessor} />
      <Campo rotulo="Sala padrão" value={sala} onChangeText={setSala} />
      <Text style={{ color: tema.sutil, fontSize: 12 }}>Cor</Text>
      <View style={estilos.chips}>
        {PALETA_DESTAQUE.map((c) => (
          <Chip
            key={c}
            rotulo="  "
            cor={c}
            ativo={cor === c}
            aoTocar={() => setCor(c)}
            dica={`cor ${c}`}
          />
        ))}
      </View>
      <Campo rotulo="Notas (ex.: prova vale 40%)" value={notas} onChangeText={setNotas} multiline />
      {erro ? <Text style={{ color: tema.perigo }}>{erro}</Text> : null}
      <Botao
        rotulo={disciplina ? 'Salvar disciplina' : 'Criar disciplina'}
        aoTocar={() =>
          tentar(() => {
            if (disciplina) repositorio.editarDisciplina(disciplina.id, dados());
            else {
              const nova = repositorio.criarDisciplina({ ...dados(), semesterId: semestreId });
              router.replace({ pathname: '/disciplina', params: { id: nova.id } });
            }
          })
        }
      />

      {disciplina ? (
        <>
          <Text style={[estilos.subtitulo, { color: tema.texto }]}>Horários</Text>
          {horarios.map((h) => (
            <LinhaHorario key={h.id} horario={h} />
          ))}
          <NovoHorario disciplinaId={disciplina.id} />
          <Botao
            perigo
            rotulo="Excluir disciplina"
            aoTocar={() =>
              Alert.alert(
                'Excluir disciplina?',
                'Horários e exceções saem junto. Provas e trabalhos ligados a ela ficam, sem o selo.',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Excluir',
                    style: 'destructive',
                    onPress: () => {
                      repositorio.excluirDisciplina(disciplina.id);
                      router.back();
                    },
                  },
                ],
              )
            }
          />
        </>
      ) : null}
    </ScrollView>
  );
}

function LinhaHorario({ horario }: { horario: HorarioLocal }) {
  const tema = useTema();
  return (
    <View style={[estilos.linha, { borderColor: tema.borda }]}>
      <Text style={{ color: tema.texto, flex: 1 }}>
        {DIAS[horario.weekday]} {horario.startTime}–{horario.endTime}
        {horario.room ? ` · sala ${horario.room}` : ''}
      </Text>
      <Text
        style={{ color: tema.perigo }}
        onPress={() =>
          Alert.alert('Excluir horário?', '', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Excluir',
              style: 'destructive',
              onPress: () => repositorio.excluirHorario(horario.id),
            },
          ])
        }
      >
        excluir
      </Text>
    </View>
  );
}

function NovoHorario({ disciplinaId }: { disciplinaId: string }) {
  const tema = useTema();
  const [dia, setDia] = useState(1);
  const [inicio, setInicio] = useState('19:00');
  const [fim, setFim] = useState('20:40');
  const [sala, setSala] = useState('');
  const [erro, setErro] = useState('');
  const valido = REGEX_HORA.test(inicio) && REGEX_HORA.test(fim);
  return (
    <View style={[estilos.bloco, { borderColor: tema.borda }]}>
      <View style={estilos.chips}>
        {DIAS.map((d, i) => (
          <Chip key={d} rotulo={d} ativo={dia === i} aoTocar={() => setDia(i)} />
        ))}
      </View>
      <View style={estilos.chips}>
        <Campo
          rotulo="Início (HH:mm)"
          value={inicio}
          onChangeText={setInicio}
          keyboardType="numbers-and-punctuation"
          style={estilos.hora}
        />
        <Campo
          rotulo="Fim (HH:mm)"
          value={fim}
          onChangeText={setFim}
          keyboardType="numbers-and-punctuation"
          style={estilos.hora}
        />
        <Campo
          rotulo="Sala (se diferente)"
          value={sala}
          onChangeText={setSala}
          style={estilos.hora}
        />
      </View>
      {erro ? <Text style={{ color: tema.perigo }}>{erro}</Text> : null}
      <Botao
        rotulo="+ Horário"
        desativado={!valido}
        aoTocar={() => {
          try {
            repositorio.criarHorario({
              courseId: disciplinaId,
              weekday: dia,
              startTime: inicio,
              endTime: fim,
              room: sala.trim() || null,
            });
            setErro('');
          } catch (e) {
            setErro(e instanceof ErroDeValidacao ? e.motivos.join('; ') : (e as Error).message);
          }
        }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: 16, gap: 10 },
  subtitulo: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  linha: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  bloco: { gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  hora: { minWidth: 90 },
});
