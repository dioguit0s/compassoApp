import { PALETA_DESTAQUE, REGEX_HORA } from '@compasso/core';
import { ErroDeValidacao, type DisciplinaLocal, type HorarioLocal } from '@compasso/core/local';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useGrade } from '../src/hooks';
import { repositorio } from '../src/sync';
import { useTema } from '../src/tema';
import { CabecalhoInterno } from '../src/ui/Cabecalho';
import { CampoHora } from '../src/ui/CampoDataHora';
import { Botao, Campo, Rotulo, Secao } from '../src/ui/Campos';
import { useAlerta } from '../src/ui/Dialogo';
import { useAlturaTeclado } from '../src/ui/teclado';
import { Entrada, Texto } from '../src/ui/Texto';

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
  const teclado = useAlturaTeclado();
  const router = useRouter();
  const alerta = useAlerta();
  const grade = useGrade();
  const semestre = grade.semestres.find((s) => s.id === semestreId);
  const [nome, setNome] = useState(disciplina?.name ?? '');
  const [codigo, setCodigo] = useState(disciplina?.code ?? '');
  const [professor, setProfessor] = useState(disciplina?.professor ?? '');
  // Sem escolha, a cor padrão acompanha a grade (que chega depois do primeiro render).
  const [corEscolhida, setCor] = useState<string | null>(disciplina?.color ?? null);
  const cor = corEscolhida ?? PALETA_DESTAQUE[grade.disciplinas.length % PALETA_DESTAQUE.length]!;
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
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <CabecalhoInterno
        voltar={semestre ? `Semestre ${semestre.label}` : 'Semestre'}
        titulo={disciplina ? disciplina.name : 'Nova disciplina'}
        corTopo={cor}
      />
      <ScrollView
        style={{ marginBottom: teclado }}
        contentContainerStyle={estilos.tela}
        keyboardShouldPersistTaps="handled"
      >
        <View style={estilos.dupla}>
          <View style={{ flex: 1 }}>
            <Campo
              rotulo="Nome"
              value={nome}
              onChangeText={setNome}
              placeholder="Sistemas Reconfiguráveis"
            />
          </View>
          <View style={estilos.estreito}>
            <Campo
              rotulo="Código"
              value={codigo}
              onChangeText={setCodigo}
              autoCapitalize="characters"
            />
          </View>
        </View>
        <View style={estilos.dupla}>
          <View style={{ flex: 1 }}>
            <Campo rotulo="Professor" value={professor} onChangeText={setProfessor} />
          </View>
          <View style={estilos.estreito}>
            <Campo rotulo="Sala" value={sala} onChangeText={setSala} />
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Rotulo>Cor</Rotulo>
          <View style={estilos.cores}>
            {PALETA_DESTAQUE.map((c) => {
              const ativa = cor === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCor(c)}
                  accessibilityRole="button"
                  accessibilityLabel={`cor ${c}`}
                  accessibilityState={{ selected: ativa }}
                  style={[estilos.anelCor, { borderColor: ativa ? tema.texto : 'transparent' }]}
                >
                  <View style={[estilos.cor, { backgroundColor: c }]} />
                </Pressable>
              );
            })}
          </View>
        </View>
        <Campo
          rotulo="Notas"
          value={notas}
          onChangeText={setNotas}
          placeholder="ex.: prova vale 40%"
          multiline
        />
        {erro ? <Texto style={{ color: tema.perigo, fontSize: 12.5 }}>{erro}</Texto> : null}
        <Botao
          variante="primario"
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
            <View style={{ marginTop: 6 }}>
              <Secao titulo="Horários" />
            </View>
            {horarios.map((h) => (
              <LinhaHorario key={h.id} horario={h} />
            ))}
            <NovoHorario disciplinaId={disciplina.id} />
            <Botao
              perigo
              rotulo="Excluir disciplina"
              aoTocar={() =>
                alerta(
                  'Excluir disciplina?',
                  'Horários e exceções saem junto. Provas e trabalhos ligados a ela ficam, sem o selo.',
                  [
                    {
                      text: 'Excluir',
                      style: 'destructive',
                      onPress: () => {
                        repositorio.excluirDisciplina(disciplina.id);
                        router.back();
                      },
                    },
                    { text: 'Cancelar', style: 'cancel' },
                  ],
                )
              }
            />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function LinhaHorario({ horario }: { horario: HorarioLocal }) {
  const tema = useTema();
  const alerta = useAlerta();
  return (
    <View style={[estilos.horario, { backgroundColor: tema.cartao, borderColor: tema.linha }]}>
      <Texto style={{ fontSize: 13, flex: 1 }}>
        {DIAS[horario.weekday]} {horario.startTime}–{horario.endTime}
        {horario.room ? ` · sala ${horario.room}` : ''}
      </Texto>
      <Pressable
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Excluir horário"
        onPress={() =>
          alerta('Excluir horário?', undefined, [
            {
              text: 'Excluir',
              style: 'destructive',
              onPress: () => repositorio.excluirHorario(horario.id),
            },
            { text: 'Cancelar', style: 'cancel' },
          ])
        }
      >
        <Texto style={{ fontSize: 12, color: tema.perigo }}>excluir</Texto>
      </Pressable>
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
    <View style={[estilos.painel, { backgroundColor: tema.painel, borderColor: tema.linha }]}>
      <Rotulo>Novo horário</Rotulo>
      <View style={estilos.dias}>
        {DIAS.map((d, i) => {
          const ativo = dia === i;
          return (
            <Pressable
              key={d}
              onPress={() => setDia(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: ativo }}
              style={[
                estilos.dia,
                ativo
                  ? { backgroundColor: tema.ouro, borderColor: tema.ouroEscuro }
                  : { backgroundColor: tema.campo, borderColor: tema.bordaCampo },
              ]}
            >
              <Texto style={{ fontSize: 11, color: ativo ? tema.sobreOuro : tema.sutil }}>
                {d}
              </Texto>
            </Pressable>
          );
        })}
      </View>
      <View style={estilos.tres}>
        <CampoHora rotulo="Início" valor={inicio} aoMudar={setInicio} />
        <CampoHora rotulo="Fim" valor={fim} aoMudar={setFim} />
        <View style={{ gap: 4, flex: 1 }}>
          <Texto style={{ fontSize: 10.5, color: tema.rotulo }}>Sala</Texto>
          <Entrada
            value={sala}
            onChangeText={setSala}
            placeholder="opcional"
            style={[estilos.sala, { backgroundColor: tema.campo, borderColor: tema.bordaCampo }]}
          />
        </View>
      </View>
      {erro ? <Texto style={{ color: tema.perigo, fontSize: 12.5 }}>{erro}</Texto> : null}
      <Botao
        compacto
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
  tela: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 14 },
  dupla: { flexDirection: 'row', gap: 10 },
  estreito: { width: 110 },
  cores: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  anelCor: { padding: 2, borderWidth: 2, borderRadius: 20 },
  cor: { width: 28, height: 28, borderRadius: 14 },
  horario: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  painel: { gap: 10, padding: 14, borderWidth: 1, borderRadius: 9 },
  dias: { flexDirection: 'row', gap: 4 },
  dia: { flex: 1, paddingVertical: 7, borderWidth: 1, borderRadius: 6, alignItems: 'center' },
  tres: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  sala: {
    borderWidth: 1,
    borderRadius: 7,
    paddingVertical: 10,
    fontSize: 13,
    textAlign: 'center',
  },
});
