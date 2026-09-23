import {
  diaDe,
  FUSO_PADRAO,
  inicioDoDia,
  limitesDiaInteiro,
  ocorrencias,
  somarDias,
  type Dia,
} from '@compasso/core';
import { ErroDeValidacao, serieDoItem, type DadosItem, type ItemLocal } from '@compasso/core/local';
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
import { fusoDoAparelhoDifere, tituloDoDia } from '../../src/datasUi';
import { pedirPermissao } from '../../src/notificacoes';
import { repositorio } from '../../src/sync';
import { useTema } from '../../src/tema';
import { CampoDataHora } from '../../src/ui/CampoDataHora';
import { EditorRecorrencia } from '../../src/ui/EditorRecorrencia';
import { useGrade } from '../../src/hooks';
import { Chip } from '../../src/ui/Campos';
import { SeletorEsforco, type Pontuacao } from '../../src/ui/SeletorEsforco';
import { useAviso } from '../../src/ui/Aviso';
import { descreverEfeito } from '../../src/conclusao';
import type { Esforco } from '@compasso/core';

const LEMBRETES: { rotulo: string; minutos: number | null }[] = [
  { rotulo: 'Nenhum', minutos: null },
  { rotulo: '5 min', minutos: 5 },
  { rotulo: '15 min', minutos: 15 },
  { rotulo: '30 min', minutos: 30 },
  { rotulo: '1 h', minutos: 60 },
  { rotulo: '1 dia', minutos: 1440 },
];

const HORA_MS = 3_600_000;

/**
 * Detalhe do item (especificação §7): edição completa, recorrência, notas, lembrete, exclusão.
 * Aberto a partir de uma ocorrência de série (`?ocorrencia=AAAA-MM-DD`), toda edição e exclusão
 * pergunta o alcance: só esta ou esta e as futuras (issue #44). Nunca aplica em silêncio à série.
 */
export default function DetalheDoItem() {
  const { id, ocorrencia } = useLocalSearchParams<{ id: string; ocorrencia?: string }>();
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
  return (
    <Formulario
      item={item}
      ocorrencia={item.rrule && ocorrencia ? ocorrencia : null}
      aoTerminar={() => router.back()}
    />
  );
}

/** Início e fim de uma ocorrência: o desvio (se movida) ou a posição original na regra. */
function limitesDaOcorrencia(item: ItemLocal, data: Dia): { inicio: Date; fim: Date | null } {
  const desvio = repositorio.obterDesvio(item.id, data);
  if (desvio?.startAt && !desvio.deletedAt) return { inicio: desvio.startAt, fim: desvio.endAt };
  const serie = serieDoItem(item)!;
  const o = ocorrencias(serie, inicioDoDia(data), inicioDoDia(somarDias(data, 2))).find(
    (x) => x.data === data,
  );
  return { inicio: o?.inicio ?? serie.inicio, fim: o?.fim ?? null };
}

function Formulario({
  item,
  ocorrencia,
  aoTerminar,
}: {
  item: ItemLocal;
  ocorrencia: Dia | null;
  aoTerminar: () => void;
}) {
  const tema = useTema();
  const desvio = ocorrencia ? repositorio.obterDesvio(item.id, ocorrencia) : null;
  const vivo = desvio && !desvio.deletedAt ? desvio : null;
  // Concluir não fecha a tela (preserva edições não salvas): relê o status a cada render.
  const [, setVersao] = useState(0);
  const concluido =
    (ocorrencia ? vivo?.status : (repositorio.obter(item.id)?.status ?? item.status)) === 'done';
  const inicial = ocorrencia
    ? limitesDaOcorrencia(item, ocorrencia)
    : { inicio: item.startAt ?? item.dueAt ?? new Date(), fim: item.endAt };
  const tituloInicial = vivo?.titleOverride ?? item.title;
  const notasIniciais = vivo?.notesOverride ?? item.notes ?? '';

  const [titulo, setTitulo] = useState(tituloInicial);
  const [notas, setNotas] = useState(notasIniciais);
  const [diaInteiro, setDiaInteiro] = useState(item.allDay);
  const [inicio, setInicio] = useState<Date>(inicial.inicio);
  const [fim, setFim] = useState<Date | null>(inicial.fim);
  const [lembrete, setLembrete] = useState<number | null>(item.reminderMinutesBefore);
  const [rrule, setRrule] = useState<string | null>(item.rrule);
  const [disciplina, setDisciplina] = useState<string | null>(item.courseId);
  const [pontuacao, setPontuacao] = useState<Pontuacao>({
    effort: item.effort as Esforco | null,
    primaryAttribute: item.primaryAttribute,
    secondaryAttribute: item.secondaryAttribute,
  });
  const [tipo, setTipo] = useState<'task' | 'event'>(item.kind);
  // Numa ocorrência, mudar o esforço é "esta e as futuras" — série nova, ainda livre (ADR-0006).
  const congelado = item.effortLockedAt !== null && !ocorrencia;
  const aviso = useAviso();
  const grade = useGrade();
  const ativo = grade.semestres.find((s) => s.active);
  const disciplinas = grade.disciplinas.filter((c) => c.semesterId === ativo?.id);
  const [erros, setErros] = useState<string[]>([]);
  const ehTarefa = tipo === 'task';
  const concluivel = item.effort !== null;

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

  function tentar(fn: () => void, fechar = true) {
    try {
      fn();
      if (fechar) aoTerminar();
    } catch (e) {
      setErros(e instanceof ErroDeValidacao ? e.motivos : [(e as Error).message]);
    }
  }

  const mudancasDoItem = (): Partial<DadosItem> => ({
    title: titulo.trim(),
    notes: notas.trim() ? notas : null,
    kind: tipo,
    allDay: ehTarefa ? false : diaInteiro,
    ...(ehTarefa
      ? { dueAt: inicio, startAt: null, endAt: null }
      : { startAt: inicio, endAt: fim, dueAt: null }),
    ...(congelado ? {} : pontuacao),
    reminderMinutesBefore: lembrete,
    courseId: disciplina,
    ...(rrule !== item.rrule ? { rrule } : {}),
  });

  function soEsta() {
    const mudou = (a: Date | null, b: Date | null) =>
      (a?.getTime() ?? null) !== (b?.getTime() ?? null);
    tentar(() =>
      repositorio.alterarOcorrencia(item.id, ocorrencia!, {
        ...(mudou(inicio, inicial.inicio) || mudou(fim, inicial.fim)
          ? { startAt: inicio, endAt: fim }
          : {}),
        titleOverride: titulo.trim() !== item.title ? titulo.trim() : null,
        notesOverride: notas.trim() && notas !== (item.notes ?? '') ? notas : null,
      }),
    );
  }

  function salvar() {
    if (!ocorrencia) {
      tentar(() => repositorio.editar(item.id, mudancasDoItem()));
      return;
    }
    // "Só esta" guarda só horário, título e notas; mudar outro campo é "esta e as futuras".
    const soDaSerie =
      rrule !== item.rrule ||
      tipo !== item.kind ||
      diaInteiro !== item.allDay ||
      lembrete !== item.reminderMinutesBefore ||
      disciplina !== item.courseId ||
      pontuacao.effort !== item.effort ||
      pontuacao.primaryAttribute !== item.primaryAttribute ||
      pontuacao.secondaryAttribute !== item.secondaryAttribute;
    Alert.alert(
      'Aplicar a alteração a…',
      `Ocorrência de ${tituloDoDia(ocorrencia)}${soDaSerie ? '\n\nTipo, dia inteiro, lembrete, disciplina, esforço e repetição só mudam nesta e nas futuras.' : ''}`,
      [
        ...(soDaSerie ? [] : [{ text: 'Só esta', onPress: soEsta }]),
        {
          text: 'Esta e as futuras',
          onPress: () =>
            tentar(() => repositorio.alterarDaquiEmDiante(item.id, ocorrencia, mudancasDoItem())),
        },
        { text: 'Cancelar', style: 'cancel' as const },
      ],
    );
  }

  function excluir() {
    if (!ocorrencia) {
      Alert.alert('Excluir item?', 'Ele vai para a lixeira por 30 dias.', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => tentar(() => repositorio.excluir(item.id)),
        },
      ]);
      return;
    }
    Alert.alert('Excluir…', `Ocorrência de ${tituloDoDia(ocorrencia)}`, [
      {
        text: 'Só esta',
        onPress: () => tentar(() => repositorio.cancelarOcorrencia(item.id, ocorrencia)),
      },
      {
        text: 'Esta e as futuras',
        style: 'destructive',
        onPress: () => tentar(() => repositorio.encerrarSerieAntes(item.id, ocorrencia)),
      },
      { text: 'Cancelar', style: 'cancel' },
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
          title: ocorrencia ? 'Ocorrência' : ehTarefa ? 'Tarefa' : 'Evento',
          headerRight: () => (
            <Pressable onPress={salvar} accessibilityLabel="Salvar">
              <Text style={{ color: tema.destaque, fontWeight: '600', fontSize: 16 }}>Salvar</Text>
            </Pressable>
          ),
        }}
      />
      {ocorrencia ? (
        <Text style={{ color: tema.sutil }}>
          Série · ocorrência de {tituloDoDia(ocorrencia)}
          {vivo?.startAt ? ' (movida)' : ''}
        </Text>
      ) : null}
      <TextInput
        style={[estilos.titulo, { color: tema.texto, borderColor: tema.borda }]}
        value={titulo}
        onChangeText={setTitulo}
        placeholder="Título"
        placeholderTextColor={tema.sutil}
      />

      {concluivel ? (
        <Pressable
          onPress={() =>
            tentar(() => {
              const efeito = concluido
                ? repositorio.desfazerConclusao(item.id, ocorrencia)
                : repositorio.concluir(item.id, ocorrencia);
              if (efeito.tipo !== 'nada') aviso({ texto: descreverEfeito(efeito) });
              setVersao((v) => v + 1);
            }, false)
          }
          style={[estilos.botao, { borderColor: tema.pontuavel }]}
        >
          <Text style={{ color: tema.pontuavel, fontWeight: '600' }}>
            {concluido
              ? 'Desfazer conclusão'
              : ocorrencia
                ? 'Concluir esta ocorrência'
                : 'Concluir'}
          </Text>
        </Pressable>
      ) : null}
      {concluivel && !ocorrencia && !item.rrule && !concluido ? (
        <Pressable
          onPress={() => tentar(() => repositorio.adiar(item.id, 1))}
          style={[estilos.botao, { borderColor: tema.borda }]}
        >
          <Text style={{ color: tema.texto }}>Adiar para amanhã</Text>
        </Pressable>
      ) : null}
      {item.postponeCount > 0 ? (
        <Text style={{ color: tema.sutil }}>
          Adiada {item.postponeCount} {item.postponeCount === 1 ? 'vez' : 'vezes'}.
        </Text>
      ) : null}

      <Text style={{ color: tema.sutil }}>Esforço</Text>
      <SeletorEsforco
        valor={pontuacao}
        congelado={congelado}
        aoMudar={(p) => {
          setPontuacao(p);
          if (p.effort === null) setTipo('event'); // tarefa exige esforço
        }}
      />
      {pontuacao.effort !== null && !ocorrencia ? (
        <View style={estilos.chips}>
          <Chip
            rotulo="Evento (horário)"
            ativo={tipo === 'event'}
            aoTocar={() => setTipo('event')}
          />
          <Chip rotulo="Tarefa (prazo)" ativo={tipo === 'task'} aoTocar={() => setTipo('task')} />
        </View>
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

      <Text style={{ color: tema.sutil }}>Repetição</Text>
      <EditorRecorrencia rrule={rrule} inicio={inicio} aoMudar={setRrule} />

      {disciplinas.length || disciplina ? (
        <>
          <Text style={{ color: tema.sutil }}>Disciplina (prova, trabalho, entrega)</Text>
          <View style={estilos.chips}>
            <Chip
              rotulo="Nenhuma"
              ativo={disciplina === null}
              aoTocar={() => setDisciplina(null)}
            />
            {disciplinas.map((c) => (
              <Chip
                key={c.id}
                rotulo={c.code ?? c.name}
                cor={c.color}
                ativo={disciplina === c.id}
                aoTocar={() => setDisciplina(c.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      <Text style={{ color: tema.sutil }}>Lembrete antes</Text>
      <View style={estilos.chips}>
        {LEMBRETES.map((l) => {
          const ativo = lembrete === l.minutos;
          return (
            <Pressable
              key={l.rotulo}
              onPress={() => {
                setLembrete(l.minutos);
                // Momento com contexto para pedir a permissão: a pessoa acabou de pedir um lembrete.
                if (l.minutos !== null) void pedirPermissao();
              }}
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

      <Pressable onPress={excluir} style={[estilos.botao, { borderColor: tema.perigo }]}>
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
  botao: { borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
});
