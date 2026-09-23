import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { ColorValue } from 'react-native';

type Props = { color: ColorValue; size: number };

/**
 * Ícones da barra de abas. Sem `tabBarIcon`, o React Navigation cai num ícone de fonte que o app
 * não empacota e o Android desenha um retângulo vazio (visto no emulador).
 */
const traco = {
  strokeWidth: 1.8,
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function IconeHoje({ color, size }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={4} stroke={color} {...traco} />
      <Path
        d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke={color}
        {...traco}
      />
    </Svg>
  );
}

export function IconeCalendario({ color, size }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={5} width={18} height={16} rx={2} stroke={color} {...traco} />
      <Path d="M3 10h18M8 3v4M16 3v4" stroke={color} {...traco} />
    </Svg>
  );
}

export function IconeRecompensas({ color, size }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={8} width={18} height={5} rx={1} stroke={color} {...traco} />
      <Path
        d="M5 13v8h14v-8M12 8v13M12 8c-1.5-3-5-4-5.5-1.5S9 8 12 8zM12 8c1.5-3 5-4 5.5-1.5S15 8 12 8z"
        stroke={color}
        {...traco}
      />
    </Svg>
  );
}

export function IconePerfil({ color, size }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} stroke={color} {...traco} />
      <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" stroke={color} {...traco} />
    </Svg>
  );
}
