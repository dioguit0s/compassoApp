import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { ColorValue } from 'react-native';

type Props = { color: ColorValue; size: number; focused: boolean };

/**
 * Ícones da barra de abas: ativa é preenchida em ouro, inativa é contorno. Sem `tabBarIcon`, o
 * React Navigation cai num ícone de fonte que o app não empacota e o Android desenha um
 * retângulo vazio (visto no emulador).
 */
const FUNDO = '#EFE3CC';

export function IconeHoje({ color, size, focused }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2 21 6v9c0 5-5 8-9 9-4-1-9-4-9-9V6Z"
        fill={focused ? color : 'none'}
        stroke={focused ? 'none' : color}
        strokeWidth={1.6}
      />
    </Svg>
  );
}

export function IconeCalendario({ color, size, focused }: Props) {
  if (focused) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect x={3} y={5} width={18} height={16} rx={2} fill={color} />
        <Path d="M3 10h18" stroke={FUNDO} strokeWidth={1.6} />
        <Path d="M8 3v4M16 3v4" stroke={color} strokeWidth={1.6} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect
        x={3}
        y={5}
        width={18}
        height={16}
        rx={2}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
      />
      <Path d="M3 10h18M8 3v4M16 3v4" stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

export function IconeRecompensas({ color, size, focused }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle
        cx={12}
        cy={12}
        r={8.6}
        fill={focused ? color : 'none'}
        stroke={focused ? 'none' : color}
        strokeWidth={1.6}
      />
      <Path
        d="M12 6.6l1.7 3.8 4.1.4-3.1 2.8.9 4-3.6-2.1-3.6 2.1.9-4-3.1-2.8 4.1-.4Z"
        fill={focused ? FUNDO : color}
      />
    </Svg>
  );
}

export function IconePerfil({ color, size, focused }: Props) {
  const p = focused ? { fill: color } : { fill: 'none', stroke: color, strokeWidth: 1.6 };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={3.8} {...p} />
      <Path d="M4.5 20c0-4.2 3.4-6.6 7.5-6.6s7.5 2.4 7.5 6.6" {...p} />
    </Svg>
  );
}
