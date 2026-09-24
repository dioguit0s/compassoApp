import {
  agendarTarefa,
  agruparPorDia,
  diaDe,
  diasDaSemana,
  DURACAO_DO_AGENDAMENTO_MIN,
  horaDe,
  intervaloDosDias,
  minutosDeHora,
  minutosDoDia,
  minutosNaGrade,
  nomeCurtoDoDia,
  partesDoDia,
  podeAgendarArrastando,
  posicionarNoDia,
  vaiParaFaixaDoDia,
  type Dia,
  type EntradaAgenda,
} from '@compasso/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useAgenda, useAulas } from '../hooks';
import { repositorio } from '../sync';
import { FOLGA_DO_FAB, useTema } from '../tema';
import { useAviso } from '../ui/Aviso';
import { useAlerta } from '../ui/Dialogo';
import { EntradaItem } from '../ui/EntradaItem';
import { Texto } from '../ui/Texto';

const HORA_PX = 44;
const MARGEM = 34;

/** Visão de semana: onde o dia tem altura e dá para ver os buracos entre compromissos. */
export function Semana({ referencia, hoje }: { referencia: Dia; hoje: Dia }) {
  const tema = useTema();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const dias = useMemo(() => diasDaSemana(referencia), [referencia]);
  const { de, ate } = useMemo(() => intervaloDosDias(dias[0]!, dias[6]!), [dias]);
  const itens = useAgenda(de, ate);
  const porDia = useMemo(() => agruparPorDia(itens, dias), [itens, dias]);
  const aulas = useAulas(dias);
  const larguraDia = (width - MARGEM) / 7;
  const rolagem = useRef<ScrollView>(null);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    rolagem.current?.scrollTo({ y: 7 * HORA_PX, animated: false });
  }, []);

  // ---- arrastar tarefa da faixa para a grade (especificação §3, §7) --------------------------
  // Segurar a tarefa na faixa começa o arrasto; a raiz captura o movimento (a grade não rola) e,
  // ao soltar sobre a grade, a tarefa vira um bloco de 1 h naquele horário. Soltar fora cancela.
  const aviso = useAviso();
  const alerta = useAlerta();
  const raiz = useRef<View>(null);
  const grade = useRef<View>(null);
  const origem = useRef({ raizX: 0, raizY: 0, gradeX: 0, gradeY: 0, gradeAltura: 0 });
  const deslocamento = useRef(7 * HORA_PX);
  const [arrasto, setArrasto] = useState<{ item: EntradaAgenda; x: number; y: number } | null>(
    null,
  );
  const arrastoAtual = useRef(arrasto);
  arrastoAtual.current = arrasto;
  const capturado = useRef(false);

  const alvo = (x: number, y: number): { dia: Dia; minutos: number } | null => {
    const o = origem.current;
    const coluna = Math.floor((x - o.gradeX - MARGEM) / larguraDia);
    const yNaGrade = y - o.gradeY;
    if (coluna < 0 || coluna > 6 || yNaGrade < 0 || yNaGrade > o.gradeAltura) return null;
    return {
      dia: dias[coluna]!,
      minutos: minutosNaGrade(yNaGrade + deslocamento.current, HORA_PX),
    };
  };

  const medir = () => {
    raiz.current?.measure((_x, _y, _l, _a, px, py) => {
      origem.current.raizX = px;
      origem.current.raizY = py;
    });
    grade.current?.measure((_x, _y, _l, altura, px, py) => {
      origem.current.gradeX = px;
      origem.current.gradeY = py;
      origem.current.gradeAltura = altura;
    });
  };

  const soltar = (x: number, y: number) => {
    const a = arrastoAtual.current;
    setArrasto(null);
    capturado.current = false;
    const destino = a ? alvo(x, y) : null;
    if (!a || !destino) return;
    const antes = repositorio.obter(a.item.itemId);
    if (!antes) return;
    try {
      const m = agendarTarefa(destino.dia, destino.minutos);
      repositorio.editar(a.item.itemId, m);
      aviso({
        texto: `Agendada: ${nomeCurtoDoDia(destino.dia)} ${horaDe(m.startAt)}–${horaDe(m.endAt)}`,
        acao: {
          rotulo: 'Desfazer',
          aoTocar: () =>
            repositorio.editar(a.item.itemId, {
              kind: antes.kind,
              allDay: antes.allDay,
              dueAt: antes.dueAt,
              startAt: antes.startAt,
              endAt: antes.endAt,
            }),
        },
      });
    } catch (e) {
      alerta('Não foi possível agendar', (e as Error).message);
    }
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: () => arrastoAtual.current !== null,
        onPanResponderGrant: () => {
          capturado.current = true;
        },
        onPanResponderMove: (e) => {
          // Lê já: o evento sintético é reciclado antes de o updater do estado rodar.
          const { pageX: x, pageY: y } = e.nativeEvent;
          setArrasto((a) => (a ? { ...a, x, y } : a));
        },
        onPanResponderRelease: (e) => soltar(e.nativeEvent.pageX, e.nativeEvent.pageY),
        onPanResponderTerminate: () => {
          setArrasto(null);
          capturado.current = false;
        },
      }),
    // `soltar` e `alvo` leem o resto por ref; o que muda a conta são os dias e a largura.
    [dias, larguraDia],
  );

  const destino = arrasto ? alvo(arrasto.x, arrasto.y) : null;

  return (
    <View ref={raiz} style={{ flex: 1 }} {...responder.panHandlers}>
      <View style={[estilos.cabecalho, { borderColor: tema.borda, backgroundColor: tema.faixa }]}>
        <View style={{ width: MARGEM }} />
        {dias.map((d) => {
          const ehHoje = d === hoje;
          const cor = ehHoje ? tema.hoje : tema.rotulo;
          return (
            <View
              key={d}
              style={{ width: larguraDia, alignItems: 'center', gap: 1 }}
              accessibilityLabel={`${nomeCurtoDoDia(d)} ${partesDoDia(d).dia}${ehHoje ? ', hoje' : ''}`}
            >
              <Texto cinzel style={{ color: cor, fontSize: 9 }}>
                {nomeCurtoDoDia(d).charAt(0).toLocaleUpperCase('pt-BR')}
              </Texto>
              <Texto
                cinzel
                style={{ fontSize: 13, color: cor, fontWeight: ehHoje ? '700' : '500' }}
              >
                {partesDoDia(d).dia}
              </Texto>
            </View>
          );
        })}
      </View>

      {/* Faixa de dia inteiro, vários dias e tarefas com prazo */}
      <View style={[estilos.faixa, { borderColor: tema.borda, backgroundColor: tema.faixaClara }]}>
        <Texto cinzel style={[estilos.rotuloDia, { width: MARGEM, color: tema.inativo }]}>
          dia
        </Texto>
        {dias.map((d) => (
          <View
            key={d}
            style={[estilos.colunaFaixa, { width: larguraDia, borderColor: tema.grade }]}
          >
            {(porDia.get(d) ?? [])
              .filter((i) => vaiParaFaixaDoDia(i))
              .map((i) =>
                podeAgendarArrastando(i) ? (
                  <EntradaItem
                    key={i.id}
                    item={i}
                    variante="mini"
                    style={
                      arrasto?.item.id === i.id
                        ? {
                            backgroundColor: 'transparent',
                            borderStyle: 'dashed',
                            opacity: 0.6,
                          }
                        : undefined
                    }
                    aoSegurar={(x, y) => {
                      medir();
                      capturado.current = false;
                      // A ref já, sem esperar o render: o próximo movimento decide a captura.
                      arrastoAtual.current = { item: i, x, y };
                      setArrasto(arrastoAtual.current);
                    }}
                    aoSoltar={() => {
                      // Soltou sem arrastar: a raiz nunca capturou o toque. Só cancela.
                      if (!capturado.current) setArrasto(null);
                    }}
                  />
                ) : (
                  <EntradaItem key={i.id} item={i} variante="mini" />
                ),
              )}
          </View>
        ))}
      </View>

      <View ref={grade} style={{ flex: 1 }} onLayout={medir}>
        <ScrollView
          ref={rolagem}
          contentContainerStyle={{ paddingBottom: FOLGA_DO_FAB }}
          scrollEventThrottle={16}
          onScroll={(e) => {
            deslocamento.current = e.nativeEvent.contentOffset.y;
          }}
        >
          <View style={{ flexDirection: 'row', height: 24 * HORA_PX }}>
            <View style={{ width: MARGEM }}>
              {Array.from({ length: 24 }, (_, h) => (
                <View key={h} style={[estilos.hora, { top: h * HORA_PX, borderColor: tema.grade }]}>
                  <Texto cinzel style={{ fontSize: 8.5, color: tema.inativo }}>
                    {String(h).padStart(2, '0')}
                  </Texto>
                </View>
              ))}
            </View>
            {dias.map((d) => (
              <View
                key={d}
                style={{
                  width: larguraDia,
                  borderLeftWidth: 1,
                  borderColor: tema.grade,
                  backgroundColor: d === hoje ? 'rgba(154,75,38,0.06)' : 'transparent',
                }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <View
                    key={h}
                    style={[estilos.linhaHora, { top: h * HORA_PX, borderColor: tema.grade }]}
                  />
                ))}
                {/* Aulas ao fundo: ocupam o tempo sem competir com os itens (issue #61). Canceladas
                  não aparecem na semana — a aba Hoje é quem mostra o cancelamento. */}
                {(aulas.get(d) ?? [])
                  .filter((a) => !a.cancelada)
                  .map((a) => (
                    <Pressable
                      key={a.id}
                      onPress={() =>
                        router.push({ pathname: '/aula', params: { slotId: a.slotId, dia: a.dia } })
                      }
                      style={[
                        estilos.aula,
                        {
                          top: (minutosDeHora(a.inicio) / 60) * HORA_PX,
                          height: ((minutosDeHora(a.fim) - minutosDeHora(a.inicio)) / 60) * HORA_PX,
                          // Cor da disciplina com transparência no fundo, texto opaco por cima.
                          backgroundColor: `${a.cor}26`,
                          borderLeftColor: a.cor,
                        },
                      ]}
                    >
                      <Texto numberOfLines={2} style={[estilos.textoAula, { color: '#3B2F23' }]}>
                        {a.codigo ?? a.disciplina}
                      </Texto>
                    </Pressable>
                  ))}
                {posicionarNoDia(porDia.get(d) ?? [], d).map((b) => (
                  <EntradaItem
                    key={b.item.id}
                    item={b.item}
                    variante="bloco"
                    style={{
                      position: 'absolute',
                      top: (b.inicioMin / 60) * HORA_PX,
                      height: Math.max(16, ((b.fimMin - b.inicioMin) / 60) * HORA_PX - 1),
                      left: (b.coluna * larguraDia) / b.colunas + 1,
                      width: larguraDia / b.colunas - 2,
                    }}
                  />
                ))}
                {destino?.dia === d ? (
                  <View
                    pointerEvents="none"
                    style={[
                      estilos.alvo,
                      {
                        top: (destino.minutos / 60) * HORA_PX,
                        height: (DURACAO_DO_AGENDAMENTO_MIN / 60) * HORA_PX,
                        borderColor: tema.ouro,
                      },
                    ]}
                  />
                ) : null}
                {d === hoje && diaDe(agora) === hoje ? (
                  <View
                    pointerEvents="none"
                    style={[estilos.agora, { top: (minutosDoDia(agora) / 60) * HORA_PX - 4 }]}
                  >
                    <View style={[estilos.agoraPonto, { backgroundColor: tema.hoje }]} />
                    <View style={[estilos.agoraLinha, { backgroundColor: tema.hoje }]} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {arrasto ? (
        <View
          pointerEvents="none"
          style={[
            estilos.fantasma,
            {
              left: arrasto.x - origem.current.raizX - 60,
              top: arrasto.y - origem.current.raizY - 44,
              backgroundColor: tema.pontuavel,
              borderColor: tema.ouro,
              shadowColor: tema.texto,
            },
          ]}
        >
          <Texto numberOfLines={1} style={{ fontSize: 11, fontWeight: '600' }}>
            {arrasto.item.title}
          </Texto>
          <Texto cinzel style={{ color: tema.moedaTexto, fontSize: 10, letterSpacing: 0.8 }}>
            {destino
              ? `${nomeCurtoDoDia(destino.dia)} ${String(Math.floor(destino.minutos / 60)).padStart(2, '0')}:${String(destino.minutos % 60).padStart(2, '0')}`
              : 'solte na grade'}
          </Texto>
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  cabecalho: { flexDirection: 'row', paddingTop: 6, paddingBottom: 5, borderBottomWidth: 1 },
  faixa: { flexDirection: 'row', minHeight: 46, borderBottomWidth: 1 },
  rotuloDia: { fontSize: 8, paddingTop: 6, paddingLeft: 5 },
  colunaFaixa: { paddingHorizontal: 2, paddingBottom: 3, paddingTop: 2, borderLeftWidth: 1 },
  hora: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: HORA_PX,
    paddingTop: 2,
    paddingLeft: 6,
    borderTopWidth: 1,
  },
  linhaHora: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1 },
  agora: {
    position: 'absolute',
    left: -4,
    right: 0,
    height: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  agoraPonto: { width: 9, height: 9, borderRadius: 5 },
  agoraLinha: { flex: 1, height: 2, marginLeft: -2 },
  aula: {
    position: 'absolute',
    left: 1,
    right: 1,
    borderRadius: 4,
    borderLeftWidth: 2.5,
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  textoAula: { fontSize: 8.5, lineHeight: 10 },
  alvo: {
    position: 'absolute',
    left: 1,
    right: 1,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 5,
    backgroundColor: 'rgba(150,116,42,0.12)',
  },
  fantasma: {
    position: 'absolute',
    width: 118,
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
    elevation: 8,
    shadowOpacity: 0.4,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 14 },
    transform: [{ rotate: '-3deg' }],
  },
});
