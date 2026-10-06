import { nomeCurtoDoDia, partesDoDia, type DiaResumido, type ItemDaSemana } from '@compasso/core';
import {
  FlexWidget,
  TextWidget,
  type ColorProp,
  type FlexWidgetStyle,
} from 'react-native-android-widget';
import { formatarDiaCurtoIntervalo } from '../calendario/rotulos';
import type { EntradaDoApp } from '../hooks';
import { CODICE as tema, COR_DO_ATRIBUTO, FONTES } from '../tema';
import { estadoDaEntrada } from '../ui/EntradaItem';
import type { SemanaDoWidget } from './dados';

/** Nome do widget no app.json (plugin react-native-android-widget). */
export const NOME_DO_WIDGET = 'SemanaCompasso';

const cor = (c: string) => c as ColorProp;

const ABRIR_CALENDARIO = {
  clickAction: 'OPEN_URI',
  clickActionData: { uri: 'compasso://calendario' },
};

// letterSpacing é em px: a lib divide pelo tamanho da fonte para chegar ao valor em em.
// Alturas em dp, usadas também para saber quantos itens cabem por dia.
const PADDING = 8;
const CABECALHO = 22;
const TOPO_DO_DIA = 32;
const ITEM = 15;
const ESPACO = 2;
const EXCEDENTE = 12;

/** Quantos itens cabem em cada coluna na altura atual do widget (redimensionável). */
export function itensPorDia(altura: number): number {
  const livre = altura - 2 * PADDING - CABECALHO - TOPO_DO_DIA - EXCEDENTE;
  return Math.max(1, Math.floor(livre / (ITEM + ESPACO)));
}

/**
 * Mesma distinção visual do app (tema.ts): compromisso é contorno, pontuável é preenchido, não
 * cumprido é tracejado e cinza. A barra à esquerda leva a cor do atributo ou da disciplina.
 */
function estiloDoItem(item: ItemDaSemana<EntradaDoApp>, agora: Date) {
  const base: FlexWidgetStyle = {
    height: ITEM,
    width: 'match_parent',
    marginTop: ESPACO,
    paddingHorizontal: 3,
    borderRadius: 3,
    borderWidth: 1,
    borderLeftWidth: 3,
    justifyContent: 'center',
  };
  if (item.tipo === 'aula') {
    return {
      caixa: {
        ...base,
        backgroundColor: cor(tema.cartao),
        borderColor: cor(tema.linha),
        borderLeftColor: cor(item.aula.cor),
      },
      texto: tema.texto,
    };
  }
  const barra = cor(
    item.entrada.atributo ? COR_DO_ATRIBUTO[item.entrada.atributo] : tema.compromisso,
  );
  switch (estadoDaEntrada(item.entrada, agora)) {
    case 'compromisso':
      return {
        caixa: { ...base, borderColor: cor(tema.compromisso), borderLeftColor: barra },
        texto: tema.texto,
      };
    case 'aberta':
      return {
        caixa: {
          ...base,
          backgroundColor: cor(tema.pontuavel),
          borderColor: cor(tema.pontuavelBorda),
          borderLeftColor: barra,
        },
        texto: tema.texto,
      };
    case 'concluida':
      return {
        caixa: {
          ...base,
          backgroundColor: cor(tema.ouroFundo),
          borderColor: cor(tema.pontuavelBorda),
          borderLeftColor: barra,
        },
        texto: tema.apagado,
      };
    case 'nao-cumprida':
      return {
        caixa: {
          ...base,
          borderColor: cor(tema.naoCumprido),
          borderLeftColor: cor(tema.naoCumprido),
          borderStyle: 'dashed' as const,
        },
        texto: tema.naoCumpridoTexto,
      };
  }
}

function Item({ item, agora }: { item: ItemDaSemana<EntradaDoApp>; agora: Date }) {
  const { caixa, texto } = estiloDoItem(item, agora);
  return (
    <FlexWidget style={caixa}>
      <TextWidget
        text={item.tipo === 'aula' ? item.aula.disciplina : item.entrada.title}
        maxLines={1}
        truncate="END"
        allowFontScaling={false}
        style={{ fontSize: 9, fontFamily: FONTES.archivo[500], color: cor(texto) }}
      />
    </FlexWidget>
  );
}

function Coluna({ dia, agora }: { dia: DiaResumido<EntradaDoApp>; agora: Date }) {
  return (
    <FlexWidget
      {...ABRIR_CALENDARIO}
      accessibilityLabel={`${nomeCurtoDoDia(dia.dia)} ${partesDoDia(dia.dia).dia}`}
      style={{
        flex: 1,
        height: 'match_parent',
        flexDirection: 'column',
        alignItems: 'center',
        marginHorizontal: 1,
        paddingHorizontal: 2,
        paddingTop: 3,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: cor(dia.ehHoje ? tema.hoje : tema.fundo),
        backgroundColor: cor(dia.ehHoje ? tema.hojeFundo : tema.fundo),
      }}
    >
      <TextWidget
        text={nomeCurtoDoDia(dia.dia).toLocaleUpperCase('pt-BR')}
        allowFontScaling={false}
        style={{
          fontSize: 8,
          letterSpacing: 0.6,
          fontFamily: FONTES.archivo[600],
          color: cor(dia.ehHoje ? tema.hoje : tema.rotulo),
        }}
      />
      <TextWidget
        text={String(partesDoDia(dia.dia).dia)}
        allowFontScaling={false}
        style={{
          fontSize: 14,
          fontFamily: FONTES.cinzel[700],
          color: cor(dia.ehHoje ? tema.hoje : tema.texto),
        }}
      />
      {dia.itens.map((item) => (
        <Item
          key={item.tipo === 'aula' ? item.aula.id : item.entrada.id}
          item={item}
          agora={agora}
        />
      ))}
      {dia.excedentes > 0 ? (
        <TextWidget
          text={`+${dia.excedentes}`}
          allowFontScaling={false}
          style={{
            marginTop: 1,
            fontSize: 9,
            fontFamily: FONTES.archivo[600],
            color: cor(tema.rotulo),
          }}
        />
      ) : null}
    </FlexWidget>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <FlexWidget
      {...ABRIR_CALENDARIO}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        padding: PADDING,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: cor(tema.borda),
        backgroundColor: cor(tema.fundo),
      }}
    >
      {children}
    </FlexWidget>
  );
}

function Cabecalho({ titulo }: { titulo: string }) {
  return (
    <FlexWidget
      {...ABRIR_CALENDARIO}
      accessibilityLabel="Abrir o calendário"
      style={{
        height: CABECALHO,
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 3,
        borderBottomWidth: 1,
        borderBottomColor: cor(tema.ouroClaro),
      }}
    >
      <TextWidget
        text="SEMANA"
        allowFontScaling={false}
        style={{
          fontSize: 11,
          letterSpacing: 1.6,
          fontFamily: FONTES.cinzel[700],
          color: cor(tema.ouroEscuro),
        }}
      />
      <TextWidget
        text={titulo}
        allowFontScaling={false}
        style={{ fontSize: 11, fontFamily: FONTES.cinzel[600], color: cor(tema.texto2) }}
      />
    </FlexWidget>
  );
}

/** Widget da semana corrente: domingo a sábado em 7 colunas, no visual do códice. */
export function SemanaWidget({ semana, agora }: { semana: SemanaDoWidget; agora: Date }) {
  const vazia = semana.dias.every((d) => d.itens.length === 0);
  return (
    <Moldura>
      <Cabecalho titulo={formatarDiaCurtoIntervalo(semana.hoje)} />
      <FlexWidget style={{ flex: 1, width: 'match_parent', flexDirection: 'row' }}>
        {semana.dias.map((d) => (
          <Coluna key={d.dia} dia={d} agora={agora} />
        ))}
      </FlexWidget>
      {vazia ? (
        <TextWidget
          text="Semana livre"
          allowFontScaling={false}
          style={{
            width: 'match_parent',
            textAlign: 'center',
            fontSize: 10,
            fontFamily: FONTES.archivoItalico,
            color: cor(tema.apagado),
          }}
        />
      ) : null}
    </Moldura>
  );
}

/** Quando o banco não pôde ser lido (ex.: app atualizado e ainda não aberto para migrar). */
export function SemanaIndisponivel() {
  return (
    <Moldura>
      <Cabecalho titulo="" />
      <FlexWidget
        {...ABRIR_CALENDARIO}
        style={{ flex: 1, width: 'match_parent', alignItems: 'center', justifyContent: 'center' }}
      >
        <TextWidget
          text="Abra o Compasso para carregar a semana"
          allowFontScaling={false}
          style={{ fontSize: 10, fontFamily: FONTES.archivoItalico, color: cor(tema.apagado) }}
        />
      </FlexWidget>
    </Moldura>
  );
}
