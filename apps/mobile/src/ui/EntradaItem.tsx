import { horaDe, NOMES_ATRIBUTOS, type Atributo, type EntradaAgenda } from '@compasso/core';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { descreverEfeito } from '../conclusao';
import { useDisciplina } from '../disciplinas';
import { useAviso } from './Aviso';
import { useAlerta } from './Dialogo';
import { CaixaDeMarcar, Escudo, Tracos } from './Icones';
import { Texto } from './Texto';
import { repositorio } from '../sync';
import { COR_DO_ATRIBUTO, useTema, type Tema } from '../tema';

export type EstadoDaEntrada = 'compromisso' | 'aberta' | 'concluida' | 'nao-cumprida';

/**
 * Estado visual. Compromisso puro (sem esforço) é CONTORNO — algo que acontece com você.
 * Pontuável é PREENCHIDO — algo que você faz (especificação §4.8 e §7). Ocorrência pontuável que
 * já passou sem ser concluída fica "não cumprida": informação neutra, tracejada, nunca vermelho de
 * erro (especificação §4.7, issue #45).
 */
export function estadoDaEntrada(e: EntradaAgenda, agora: Date = new Date()): EstadoDaEntrada {
  if (e.effort === null) return 'compromisso';
  if (e.status === 'done') return 'concluida';
  const fim = e.kind === 'task' ? e.dueAt : (e.endAt ?? e.startAt);
  if (e.ocorrencia && fim && fim < agora) return 'nao-cumprida';
  return 'aberta';
}

export function estiloDoEstado(estado: EstadoDaEntrada, tema: Tema) {
  switch (estado) {
    case 'compromisso':
      return {
        caixa: { backgroundColor: 'transparent', borderColor: tema.compromisso, borderWidth: 1.3 },
        texto: { color: tema.texto },
      };
    case 'aberta':
      return {
        caixa: {
          backgroundColor: tema.pontuavel,
          borderColor: tema.pontuavelBorda,
          borderWidth: 1,
        },
        texto: { color: tema.texto },
      };
    case 'concluida':
      return {
        caixa: {
          backgroundColor: tema.pontuavel,
          borderColor: tema.pontuavelBorda,
          borderWidth: 1,
          opacity: 0.55,
        },
        texto: { color: tema.texto, textDecorationLine: 'line-through' as const },
      };
    case 'nao-cumprida':
      return {
        caixa: {
          backgroundColor: 'transparent',
          borderColor: tema.naoCumprido,
          borderWidth: 1.3,
          borderStyle: 'dashed' as const,
        },
        texto: { color: tema.naoCumpridoTexto },
      };
  }
}

export function rotuloDeHora(item: EntradaAgenda): string {
  if (item.allDay) return 'dia inteiro';
  if (item.kind === 'task') return item.dueAt ? `até ${horaDe(item.dueAt)}` : 'sem prazo';
  if (!item.startAt) return '';
  return item.endAt ? `${horaDe(item.startAt)}–${horaDe(item.endAt)}` : horaDe(item.startAt);
}

export function EntradaItem({
  item,
  variante,
  style,
  aoSegurar,
  aoSoltar,
}: {
  item: EntradaAgenda & { atributo?: Atributo | null };
  variante: 'linha' | 'bloco' | 'mini';
  style?: StyleProp<ViewStyle>;
  /** Só `mini`: segurar começa a arrastar (tarefa para a grade da semana). */
  aoSegurar?: (pageX: number, pageY: number) => void;
  aoSoltar?: () => void;
}) {
  const tema = useTema();
  const router = useRouter();
  // Disciplina excluída: o vínculo foi anulado e o selo some sozinho.
  const disciplina = useDisciplina(item.courseId);
  const aviso = useAviso();
  const alerta = useAlerta();
  const selo = disciplina ? (disciplina.code ?? disciplina.name.slice(0, 4)) : null;
  const estado = estadoDaEntrada(item);
  const e = estiloDoEstado(estado, tema);
  const abrir = () =>
    router.push({
      pathname: '/item/[id]',
      params: item.ocorrencia
        ? { id: item.itemId, ocorrencia: item.ocorrencia }
        : { id: item.itemId },
    });

  if (variante === 'mini') {
    return (
      <Pressable
        onPress={abrir}
        onLongPress={
          aoSegurar ? (ev) => aoSegurar(ev.nativeEvent.pageX, ev.nativeEvent.pageY) : undefined
        }
        onPressOut={aoSoltar}
        delayLongPress={300}
        accessibilityHint={aoSegurar ? 'Segure e arraste para um horário para agendar' : undefined}
        style={[estilos.mini, e.caixa, style]}
      >
        <Texto numberOfLines={1} style={[estilos.textoMini, e.texto]}>
          {selo ? (
            <Texto style={{ color: disciplina!.color, fontWeight: '700' }}>{selo} </Texto>
          ) : null}
          {item.title}
        </Texto>
      </Pressable>
    );
  }
  if (variante === 'bloco') {
    return (
      <Pressable onPress={abrir} style={[estilos.bloco, e.caixa, style]}>
        <Texto numberOfLines={3} style={[estilos.textoBloco, e.texto]}>
          {selo ? <Texto style={{ fontWeight: '700' }}>{selo} </Texto> : null}
          {item.title}
        </Texto>
      </Pressable>
    );
  }

  // Pontuável (item simples ou ocorrência de série): concluir direto da lista (#45, #71).
  const concluivel = item.effort !== null;
  const alternarConclusao = () => {
    try {
      const efeito =
        item.status === 'done'
          ? repositorio.desfazerConclusao(item.itemId, item.ocorrencia)
          : repositorio.concluir(item.itemId, item.ocorrencia);
      if (efeito.tipo === 'creditar') {
        aviso({
          texto: descreverEfeito(efeito),
          acao: {
            rotulo: 'Desfazer',
            aoTocar: () => repositorio.desfazerConclusao(item.itemId, item.ocorrencia),
          },
        });
      } else if (efeito.tipo === 'estornar') {
        aviso({ texto: `Conclusão desfeita: ${descreverEfeito(efeito)}` });
      }
    } catch (e) {
      alerta('Não foi possível', (e as Error).message);
    }
  };
  // Adiar (§4.7): só item pontuável e simples; o contador aparece sem julgamento.
  const adiavel = concluivel && item.ocorrencia === null && item.status !== 'done';
  const oferecerAdiar = () =>
    alerta(item.title, undefined, [
      {
        text: 'Adiar para amanhã',
        onPress: () => {
          try {
            repositorio.adiar(item.itemId, 1);
          } catch (e) {
            alerta('Não foi possível', (e as Error).message);
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);

  const detalhe = [
    rotuloDeHora(item),
    item.ocorrencia && estado !== 'nao-cumprida' ? 'repete' : '',
    estado === 'nao-cumprida' ? 'não cumprido' : '',
    item.postponeCount > 0
      ? `adiada ${item.postponeCount} ${item.postponeCount === 1 ? 'vez' : 'vezes'}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const marcador =
    estado === 'compromisso' ? (
      <View style={estilos.marcaCaixa}>
        <View style={[estilos.bolinha, { borderColor: tema.rotulo }]} />
      </View>
    ) : estado === 'nao-cumprida' ? (
      <View style={estilos.marcaCaixa}>
        <Texto style={{ color: tema.naoCumpridoTexto, fontSize: 14 }}>–</Texto>
      </View>
    ) : (
      <Pressable
        hitSlop={12}
        accessibilityRole="checkbox"
        accessibilityLabel={item.status === 'done' ? 'Desfazer conclusão' : 'Concluir'}
        accessibilityState={{ checked: item.status === 'done' }}
        onPress={alternarConclusao}
      >
        <CaixaDeMarcar marcada={item.status === 'done'} />
      </Pressable>
    );

  // Concluída: uma linha só, o título riscado e a hora à direita (design).
  if (estado === 'concluida') {
    return (
      <Pressable
        onPress={abrir}
        style={[estilos.linha, e.caixa, style]}
        accessibilityLabel={`${item.title}, ${rotuloDeHora(item)}, concluída`}
      >
        {marcador}
        <View style={estilos.concluida}>
          <Texto style={[estilos.titulo, e.texto, { color: tema.texto2, fontWeight: '400' }]}>
            {item.title}
          </Texto>
          <Texto style={{ fontSize: 11, color: tema.texto2 }}>{rotuloDeHora(item)}</Texto>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={abrir}
      onLongPress={adiavel ? oferecerAdiar : undefined}
      style={[
        estilos.linha,
        e.caixa,
        estado === 'compromisso' && { borderWidth: 1.5, alignItems: 'center' },
        style,
      ]}
      accessibilityLabel={`${item.title}, ${rotuloDeHora(item)}, ${estado.replace('-', ' ')}`}
    >
      {marcador}
      <View style={{ flex: 1, gap: estado === 'aberta' ? 5 : 2 }}>
        <View style={estilos.tituloLinha}>
          <Texto
            style={[
              estilos.titulo,
              estado === 'nao-cumprida' && { color: tema.apagado, fontWeight: '400' },
            ]}
          >
            {item.title}
          </Texto>
          {selo ? (
            <View style={[estilos.selo, { backgroundColor: disciplina!.color }]}>
              <Texto style={estilos.textoSelo}>{selo.toLocaleUpperCase('pt-BR')}</Texto>
            </View>
          ) : null}
        </View>
        {estado === 'aberta' ? (
          <View style={estilos.meta}>
            <Texto style={{ fontSize: 11, color: tema.texto3 }}>{detalhe}</Texto>
            <View style={estilos.metaItem}>
              <Tracos valor={item.effort!} />
              <Texto cinzel style={{ fontSize: 11, color: tema.texto2 }}>
                {item.effort}
              </Texto>
            </View>
            {item.atributo ? (
              <View style={estilos.metaItem}>
                <Escudo atributo={item.atributo} />
                <Texto
                  cinzel
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.2,
                    color: COR_DO_ATRIBUTO[item.atributo],
                  }}
                >
                  {NOMES_ATRIBUTOS[item.atributo].toLocaleUpperCase('pt-BR')}
                </Texto>
              </View>
            ) : null}
          </View>
        ) : (
          <Texto
            style={{
              fontSize: 11,
              color: estado === 'nao-cumprida' ? tema.naoCumpridoTexto : tema.sutil,
            }}
          >
            {detalhe}
          </Texto>
        )}
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  marcaCaixa: { width: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  bolinha: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.6 },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  titulo: { fontSize: 14, fontWeight: '600' },
  concluida: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    minHeight: 20,
  },
  selo: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  textoSelo: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '700', letterSpacing: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', rowGap: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mini: { borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1.5, marginTop: 2 },
  textoMini: { fontSize: 8.5, lineHeight: 11 },
  bloco: { borderRadius: 4, paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden' },
  textoBloco: { fontSize: 9, lineHeight: 11 },
});
