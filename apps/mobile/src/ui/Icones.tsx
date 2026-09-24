import type { Atributo } from '@compasso/core';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { COR_DO_ATRIBUTO, FONTES, useTema } from '../tema';

const ESTRELA = 'M10 5.4l1.3 3 3.2.3-2.4 2.1.7 3.1-2.8-1.7-2.8 1.7.7-3.1L5.5 8.7l3.2-.3Z';
export const CAMINHO_ESCUDO = 'M9 0 18 4v7c0 4-4 6.5-9 7.5C4 17.5 0 15 0 11V4Z';

/** Moeda de ouro com estrela; `negativa` é só o contorno, em vermelho. */
export function Moeda({
  tamanho = 15,
  negativa = false,
  apagada = false,
  anel = false,
}: {
  tamanho?: number;
  negativa?: boolean;
  apagada?: boolean;
  anel?: boolean;
}) {
  const tema = useTema();
  if (negativa) {
    return (
      <Svg width={tamanho} height={tamanho} viewBox="0 0 20 20">
        <Circle cx={10} cy={10} r={8.4} fill="none" stroke={tema.perigo} strokeWidth={1.4} />
      </Svg>
    );
  }
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 20 20" opacity={apagada ? 0.6 : 1}>
      <Circle
        cx={10}
        cy={10}
        r={8.4}
        fill={tema.moeda}
        stroke={tema.moedaTraco}
        strokeWidth={1.2}
      />
      {anel ? (
        <Circle cx={10} cy={10} r={6.4} fill="none" stroke={tema.moedaTraco} strokeWidth={0.6} />
      ) : null}
      {tamanho >= 15 ? <Path d={ESTRELA} fill={tema.ouroEscuro} /> : null}
    </Svg>
  );
}

/** Escudo do atributo, na cor dele; `letra` escreve a inicial dentro (radar). */
export function Escudo({
  atributo,
  cor,
  tamanho = 11,
}: {
  atributo?: Atributo;
  cor?: string;
  tamanho?: number;
}) {
  return (
    <Svg width={tamanho} height={(tamanho * 19) / 18} viewBox="0 0 18 19">
      <Path d={CAMINHO_ESCUDO} fill={cor ?? (atributo ? COR_DO_ATRIBUTO[atributo] : '#000')} />
    </Svg>
  );
}

/** Esforço em traços de contagem: grupos de cinco (quatro traços cortados) e o resto. */
export function Tracos({ valor, cor }: { valor: number; cor?: string }) {
  const tema = useTema();
  const c = cor ?? tema.texto2;
  const grupos = Math.floor(valor / 5);
  const resto = valor % 5;
  const formas: React.ReactNode[] = [];
  let x = 1;
  for (let g = 0; g < grupos; g++) {
    const x0 = x;
    for (let i = 0; i < 4; i++) {
      formas.push(<Rect key={`g${g}${i}`} x={x} y={1} width={1.8} height={10} fill={c} />);
      x += 4;
    }
    formas.push(<Path key={`c${g}`} d={`M${x0 - 1} 11 ${x - 3} 1`} stroke={c} strokeWidth={1.6} />);
    x += 2;
  }
  for (let i = 0; i < resto; i++) {
    formas.push(<Rect key={`r${i}`} x={x} y={1} width={1.8} height={10} fill={c} />);
    x += 4.5;
  }
  const largura = Math.max(6, x);
  return (
    <Svg width={largura} height={11} viewBox={`0 0 ${largura} 12`}>
      {formas}
    </Svg>
  );
}

/** Seta → (ou ← com `voltar`). */
export function Seta({
  cor,
  voltar = false,
  largura = 11,
}: {
  cor: string;
  voltar?: boolean;
  largura?: number;
}) {
  return (
    <Svg width={largura} height={(largura * 10) / 12} viewBox="0 0 12 10">
      <Path
        d={voltar ? 'M12 5H3M6 1.5 2.4 5 6 8.5' : 'M0 5h9M6 1.5 9.6 5 6 8.5'}
        stroke={cor}
        strokeWidth={1.4}
        fill="none"
      />
    </Svg>
  );
}

export function Relogio({ cor, tamanho = 13 }: { cor: string; tamanho?: number }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 16 16">
      <Circle cx={8} cy={8} r={6.6} fill="none" stroke={cor} strokeWidth={1.3} />
      <Path d="M8 4.4V8l2.4 1.6" stroke={cor} strokeWidth={1.3} fill="none" />
    </Svg>
  );
}

export function Repetir({
  cor,
  tamanho = 13,
  traco = 1.3,
}: {
  cor: string;
  tamanho?: number;
  traco?: number;
}) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 16 16">
      <Path
        d="M2 6a5 5 0 0 1 9-2.5M14 10a5 5 0 0 1-9 2.5M11 1v3h-3M5 15v-3h3"
        stroke={cor}
        strokeWidth={traco}
        fill="none"
      />
    </Svg>
  );
}

export function Sincronizar({ cor }: { cor: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Path
        d="M13.5 8A5.5 5.5 0 1 1 11.8 4M12 1v3.2H8.8"
        stroke={cor}
        strokeWidth={1.4}
        fill="none"
      />
    </Svg>
  );
}

/** Caixa de marcar de item pontuável (vazia ou com o visto). */
export function CaixaDeMarcar({ marcada, tamanho = 20 }: { marcada: boolean; tamanho?: number }) {
  const tema = useTema();
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 20 20">
      <Rect
        x={0.8}
        y={0.8}
        width={18.4}
        height={18.4}
        rx={4}
        fill={tema.campo}
        stroke={tema.ouroEscuro}
        strokeWidth={1.5}
      />
      {marcada ? (
        <Path d="M5 10.4 8.4 14 15 6.6" stroke={tema.ouroEscuro} strokeWidth={2} fill="none" />
      ) : null}
    </Svg>
  );
}

/** A rosa dos ventos do Compasso (abertura e dia livre). */
export function Emblema({
  tamanho = 64,
  abertura = false,
}: {
  tamanho?: number;
  abertura?: boolean;
}) {
  const tema = useTema();
  if (abertura) {
    return (
      <Svg width={tamanho} height={tamanho} viewBox="0 0 64 64">
        <Circle cx={32} cy={32} r={29} fill="none" stroke={tema.ouro} strokeWidth={1.4} />
        <Circle cx={32} cy={32} r={24} fill="none" stroke={tema.ouroClaro} strokeWidth={0.8} />
        <Path d="M32 8 36.5 32 32 56 27.5 32Z" fill={tema.ouro} />
        <Path d="M8 32 32 27.5 56 32 32 36.5Z" fill={tema.ouroClaro} opacity={0.6} />
        <Circle cx={32} cy={32} r={2.4} fill={tema.folha} stroke={tema.ouroEscuro} />
      </Svg>
    );
  }
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 64 64">
      <Circle cx={32} cy={32} r={28} fill="none" stroke={tema.ouroClaro} strokeWidth={1.4} />
      <Circle cx={32} cy={32} r={22} fill="none" stroke={tema.linha} strokeWidth={1} />
      <Path d="M32 12 36 32 32 52 28 32Z" fill={tema.ouro} opacity={0.8} />
      <Path d="M12 32 32 28 52 32 32 36Z" fill={tema.ouroClaro} opacity={0.5} />
    </Svg>
  );
}

export function Mais({ cor, tamanho = 24 }: { cor: string; tamanho?: number }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
      <Path d="M12 4.5v15M4.5 12h15" stroke={cor} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

/** Escudo com a inicial dentro, para os eixos do radar (desenhado dentro de outro Svg). */
export function EscudoComLetra({
  x,
  y,
  cor,
  letra,
}: {
  x: number;
  y: number;
  cor: string;
  letra: string;
}) {
  return (
    <>
      <Path d={CAMINHO_ESCUDO} fill={cor} transform={`translate(${x},${y})`} />
      <SvgText
        x={x + 9}
        y={y + 12}
        textAnchor="middle"
        fontFamily={FONTES.cinzel[700]}
        fontSize={letra.length > 1 ? 7 : 8}
        fill="#FFFFFF"
      >
        {letra}
      </SvgText>
    </>
  );
}

/** Ponto de status (sincronizado: cheio; sem rede: vazado). */
export function Ponto({
  cor,
  vazado = false,
  tamanho = 6,
}: {
  cor: string;
  vazado?: boolean;
  tamanho?: number;
}) {
  return (
    <View
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: tamanho / 2,
        backgroundColor: vazado ? 'transparent' : cor,
        borderWidth: vazado ? 1.2 : 0,
        borderColor: cor,
      }}
    />
  );
}
