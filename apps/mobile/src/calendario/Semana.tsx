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
  Alert,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useAgenda, useAulas } from '../hooks';
import { repositorio } from '../sync';
import { FOLGA_DO_FAB, useTema } from '../tema';
import { useAviso } from '../ui/Aviso';
import { EntradaItem } from '../ui/EntradaItem';

const HORA_PX = 44;
const MARGEM = 32;

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
      Alert.alert('Não foi possível agendar', (e as Error).message);
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
      <View style={[estilos.cabecalho, { borderColor: tema.borda }]}>
        <View style={{ width: MARGEM }} />
        {dias.map((d) => {
          const ehHoje = d === hoje;
          return (
            <View key={d} style={{ width: larguraDia, alignItems: 'center' }}>
              <Text style={{ color: ehHoje ? tema.hoje : tema.sutil, fontSize: 11 }}>
                {nomeCurtoDoDia(d)}
              </Text>
              <Text
                style={[
                  estilos.numero,
                  { color: ehHoje ? tema.hoje : tema.texto, fontWeight: ehHoje ? '700' : '400' },
                ]}
              >
                {partesDoDia(d).dia}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Faixa de dia inteiro, vários dias e tarefas com prazo */}
      <View style={[estilos.faixa, { borderColor: tema.borda }]}>
        <View style={{ width: MARGEM }} />
        {dias.map((d) => (
          <View key={d} style={{ width: larguraDia, paddingHorizontal: 1 }}>
            {(porDia.get(d) ?? [])
              .filter((i) => vaiParaFaixaDoDia(i))
              .map((i) =>
                podeAgendarArrastando(i) ? (
                  <EntradaItem
                    key={i.id}
                    item={i}
                    variante="mini"
                    style={arrasto?.item.id === i.id ? { opacity: 0.4 } : undefined}
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
                <Text key={h} style={[estilos.hora, { top: h * HORA_PX - 6, color: tema.sutil }]}>
                  {h === 0 ? '' : `${h}h`}
                </Text>
              ))}
            </View>
            {dias.map((d) => (
              <View
                key={d}
                style={{ width: larguraDia, borderLeftWidth: 1, borderColor: tema.borda }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <View
                    key={h}
                    style={[estilos.linhaHora, { top: h * HORA_PX, borderColor: tema.borda }]}
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
                          backgroundColor: `${a.cor}38`,
                          borderLeftColor: a.cor,
                        },
                      ]}
                    >
                      <Text numberOfLines={2} style={[estilos.textoAula, { color: tema.texto }]}>
                        {a.codigo ?? a.disciplina}
                      </Text>
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
                      left: (b.coluna * larguraDia) / b.colunas,
                      width: larguraDia / b.colunas - 1,
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
                        borderColor: tema.pontuavel,
                      },
                    ]}
                  />
                ) : null}
                {d === hoje && diaDe(agora) === hoje ? (
                  <View
                    style={[
                      estilos.agora,
                      { top: (minutosDoDia(agora) / 60) * HORA_PX, backgroundColor: tema.hoje },
                    ]}
                  />
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
            },
          ]}
        >
          <Text numberOfLines={1} style={{ color: tema.textoSobrePontuavel, fontWeight: '600' }}>
            {arrasto.item.title}
          </Text>
          <Text style={{ color: tema.textoSobrePontuavel, fontSize: 11 }}>
            {destino
              ? `${nomeCurtoDoDia(destino.dia)} ${String(Math.floor(destino.minutos / 60)).padStart(2, '0')}:${String(destino.minutos % 60).padStart(2, '0')}`
              : 'solte na grade'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  cabecalho: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1 },
  numero: { fontSize: 16 },
  faixa: { flexDirection: 'row', minHeight: 8, paddingVertical: 2, borderBottomWidth: 1 },
  hora: { position: 'absolute', right: 4, fontSize: 10 },
  linhaHora: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth },
  agora: { position: 'absolute', left: 0, right: 0, height: 2 },
  aula: { position: 'absolute', left: 0, right: 0, borderRadius: 2, borderLeftWidth: 2 },
  textoAula: { fontSize: 9, padding: 1 },
  alvo: {
    position: 'absolute',
    left: 1,
    right: 1,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 4,
  },
  fantasma: {
    position: 'absolute',
    width: 120,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    elevation: 6,
  },
});
