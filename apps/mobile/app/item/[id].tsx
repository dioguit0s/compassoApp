import {
  descreverRegra,
  diaDe,
  formatarDiaCurto,
  FUSO_PADRAO,
  inicioDoDia,
  limitesDiaInteiro,
  ocorrencias,
  somarDias,
  type Dia,
} from '@compasso/core';
import { ErroDeValidacao, serieDoItem, type DadosItem, type ItemLocal } from '@compasso/core/local';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { fusoDoAparelhoDifere, tituloDoDia } from '../../src/datasUi';
import { pedirPermissao } from '../../src/notificacoes';
import { repositorio } from '../../src/sync';
import { useTema } from '../../src/tema';
import { CabecalhoModal } from '../../src/ui/Cabecalho';
import { CampoDataHora } from '../../src/ui/CampoDataHora';
import { Botao, Campo, Chip, Rotulo, Segmentado } from '../../src/ui/Campos';
import { useAlerta } from '../../src/ui/Dialogo';
import { EditorRecorrencia } from '../../src/ui/EditorRecorrencia';
import { CaixaDeMarcar, Repetir } from '../../src/ui/Icones';
import { useGrade } from '../../src/hooks';
import { SeletorEsforco, type Pontuacao } from '../../src/ui/SeletorEsforco';
import { useAlturaTeclado } from '../../src/ui/teclado';
import { Entrada, Texto } from '../../src/ui/Texto';
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
      <View style={{ flex: 1, backgroundColor: tema.folha }}>
        <CabecalhoModal titulo="Item" />
        <Texto style={{ padding: 20, color: tema.sutil }}>
          Item não encontrado (talvez excluído).
        </Texto>
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
  const teclado = useAlturaTeclado();
  const alerta = useAlerta();
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
  const rolagem = useRef<ScrollView>(null);

  // Sair com alterações não salvas pergunta antes de descartar (fechar, gesto, botão do sistema).
  // Salvar e excluir fecham pelo `tentar`, que libera a saída.
  const retrato = () =>
    JSON.stringify([
      titulo,
      notas,
      diaInteiro,
      inicio.getTime(),
      fim?.getTime() ?? null,
      lembrete,
      rrule,
      disciplina,
      pontuacao,
      tipo,
    ]);
  const [original] = useState(retrato);
  const alterado = retrato() !== original;
  const saidaLiberada = useRef(false);
  const navegacao = useNavigation();
  useEffect(
    () =>
      navegacao.addListener('beforeRemove', (e) => {
        if (!alterado || saidaLiberada.current) return;
        e.preventDefault();
        alerta('Descartar alterações?', 'O que você mudou nesta tela não foi salvo.', [
          {
            text: 'Descartar',
            style: 'destructive',
            onPress: () => navegacao.dispatch(e.data.action),
          },
          { text: 'Continuar editando', style: 'cancel' },
        ]);
      }),
    [navegacao, alterado, alerta],
  );
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
      if (fechar) {
        saidaLiberada.current = true;
        aoTerminar();
      }
    } catch (e) {
      setErros(e instanceof ErroDeValidacao ? e.motivos : [(e as Error).message]);
      rolagem.current?.scrollTo({ y: 0, animated: true });
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

  /** "Treino na academia — toda segunda, quarta e sexta, sem fim." */
  const regraDaSerie = () => {
    const serie = item.rrule ? serieDoItem(item) : null;
    return serie ? `${item.title} — ${descreverRegra(item.rrule!, serie.inicio)}` : item.title;
  };
  const futuras = (o: Dia) => `a partir de ${formatarDiaCurto(o, 0)}; as passadas ficam como estão`;

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
    alerta(
      'Aplicar a alteração a…',
      `${regraDaSerie()}${soDaSerie ? '\n\nTipo, dia inteiro, lembrete, disciplina, esforço e repetição só mudam nesta e nas futuras.' : ''}`,
      [
        ...(soDaSerie
          ? []
          : [{ text: 'Só esta', detalhe: tituloDoDia(ocorrencia), onPress: soEsta }]),
        {
          text: 'Esta e as futuras',
          detalhe: futuras(ocorrencia),
          onPress: () =>
            tentar(() => repositorio.alterarDaquiEmDiante(item.id, ocorrencia, mudancasDoItem())),
        },
        { text: 'Cancelar', style: 'cancel' as const },
      ],
      { serie: true },
    );
  }

  function excluir() {
    if (!ocorrencia) {
      alerta('Excluir item?', 'Ele vai para a lixeira por 30 dias.', [
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => tentar(() => repositorio.excluir(item.id)),
        },
        { text: 'Cancelar', style: 'cancel' },
      ]);
      return;
    }
    alerta(
      'Excluir…',
      regraDaSerie(),
      [
        {
          text: 'Só esta',
          detalhe: tituloDoDia(ocorrencia),
          onPress: () => tentar(() => repositorio.cancelarOcorrencia(item.id, ocorrencia)),
        },
        {
          text: 'Esta e as futuras',
          detalhe: futuras(ocorrencia),
          style: 'destructive',
          onPress: () => tentar(() => repositorio.encerrarSerieAntes(item.id, ocorrencia)),
        },
        { text: 'Cancelar', style: 'cancel' },
      ],
      { serie: true },
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tema.folha }}>
      <CabecalhoModal
        titulo={ocorrencia ? 'Ocorrência' : ehTarefa ? 'Tarefa' : 'Evento'}
        aoSalvar={salvar}
      />
      <ScrollView
        ref={rolagem}
        style={{ marginBottom: teclado }}
        contentContainerStyle={estilos.tela}
        keyboardShouldPersistTaps="handled"
      >
        {/* No topo: o Salvar fica no cabeçalho e, com a tela rolada, o erro no fim do formulário
            passava despercebido (visto no emulador). */}
        {erros.length ? (
          <View
            style={[estilos.erros, { backgroundColor: tema.perigoFundo, borderColor: tema.perigo }]}
          >
            {erros.map((e) => (
              <Texto key={e} style={{ color: tema.perigo, fontSize: 12.5 }}>
                • {e}
              </Texto>
            ))}
          </View>
        ) : null}
        {ocorrencia ? (
          <View style={[estilos.serie, { backgroundColor: tema.painel }]}>
            <Repetir cor={tema.rotulo} />
            <Texto style={{ fontSize: 12, color: tema.texto3, flex: 1 }}>
              Série · ocorrência de {tituloDoDia(ocorrencia)}
              {vivo?.startAt ? ' (movida)' : ''}
            </Texto>
          </View>
        ) : null}
        <Entrada
          cinzel
          style={[estilos.titulo, { borderBottomColor: tema.bordaCampo }]}
          value={titulo}
          onChangeText={setTitulo}
          placeholder="Título"
        />

        {concluivel ? (
          <View style={{ gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                tentar(() => {
                  const efeito = concluido
                    ? repositorio.desfazerConclusao(item.id, ocorrencia)
                    : repositorio.concluir(item.id, ocorrencia);
                  if (efeito.tipo !== 'nada') aviso({ texto: descreverEfeito(efeito) });
                  setVersao((v) => v + 1);
                }, false)
              }
              style={[estilos.concluir, { borderColor: tema.ouro }]}
            >
              <CaixaDeMarcar marcada={!concluido} tamanho={16} />
              <Texto
                cinzel
                style={{
                  fontSize: 12.5,
                  letterSpacing: 1.7,
                  color: tema.ouroEscuro,
                  fontWeight: '600',
                }}
              >
                {(concluido
                  ? 'Desfazer conclusão'
                  : ocorrencia
                    ? 'Concluir esta ocorrência'
                    : 'Concluir'
                ).toLocaleUpperCase('pt-BR')}
              </Texto>
            </Pressable>
            {!ocorrencia && !item.rrule && !concluido ? (
              <Botao
                variante="neutro"
                rotulo="Adiar para amanhã"
                aoTocar={() => tentar(() => repositorio.adiar(item.id, 1))}
              />
            ) : null}
            {item.postponeCount > 0 ? (
              <Texto style={{ fontSize: 12, color: tema.rotulo }}>
                Adiada {item.postponeCount} {item.postponeCount === 1 ? 'vez' : 'vezes'}.
              </Texto>
            ) : null}
          </View>
        ) : null}

        <SeletorEsforco
          valor={pontuacao}
          congelado={congelado}
          aoMudar={(p) => {
            setPontuacao(p);
            if (p.effort === null) setTipo('event'); // tarefa exige esforço
          }}
        />
        {pontuacao.effort !== null && !ocorrencia ? (
          <Segmentado
            valor={tipo}
            aoMudar={setTipo}
            opcoes={[
              { valor: 'event', rotulo: 'Evento (horário)' },
              { valor: 'task', rotulo: 'Tarefa (prazo)' },
            ]}
          />
        ) : null}

        <View style={{ gap: 9 }}>
          {ehTarefa ? (
            <>
              <Rotulo>Prazo</Rotulo>
              <CampoDataHora rotulo="Até" valor={inicio} aoMudar={setInicio} />
            </>
          ) : (
            <>
              <View style={estilos.linha}>
                <Rotulo>Quando</Rotulo>
                <View style={estilos.chave}>
                  <Texto style={{ fontSize: 12, color: tema.texto3 }}>Dia inteiro</Texto>
                  <Switch
                    value={diaInteiro}
                    onValueChange={alternarDiaInteiro}
                    trackColor={{ false: tema.linha, true: tema.ouroClaro }}
                    thumbColor={diaInteiro ? tema.ouro : tema.campo}
                    ios_backgroundColor={tema.linha}
                    accessibilityLabel="Dia inteiro"
                  />
                </View>
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
                    <Pressable
                      onPress={() => setFim(new Date(inicio.getTime() + HORA_MS))}
                      accessibilityRole="button"
                    >
                      <Texto style={{ fontSize: 12.5, color: tema.ouroEscuro }}>
                        + adicionar fim
                      </Texto>
                    </Pressable>
                  )}
                </>
              )}
            </>
          )}
          {fusoDoAparelhoDifere() ? (
            <Texto style={{ fontSize: 11.5, color: tema.rotulo }}>
              Horários em hora de São Paulo ({FUSO_PADRAO}), não no fuso deste aparelho.
            </Texto>
          ) : null}
        </View>

        <EditorRecorrencia rrule={rrule} inicio={inicio} aoMudar={setRrule} />

        {disciplinas.length || disciplina ? (
          <View style={{ gap: 8 }}>
            <Rotulo>Disciplina</Rotulo>
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
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Rotulo>Lembrete antes</Rotulo>
          <View style={estilos.chips}>
            {LEMBRETES.map((l) => (
              <Chip
                key={l.rotulo}
                rotulo={l.rotulo}
                ativo={lembrete === l.minutos}
                aoTocar={() => {
                  setLembrete(l.minutos);
                  // Momento com contexto para pedir a permissão: a pessoa acabou de pedir um lembrete.
                  if (l.minutos !== null) void pedirPermissao();
                }}
              />
            ))}
          </View>
        </View>

        <Campo rotulo="Notas" value={notas} onChangeText={setNotas} multiline />

        <Botao perigo rotulo="Excluir" aoTocar={excluir} />
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 18 },
  erros: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 4 },
  serie: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 7,
  },
  titulo: { fontSize: 22, fontWeight: '600', paddingBottom: 8, borderBottomWidth: 1 },
  concluir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1.5,
    borderRadius: 8,
  },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chave: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
