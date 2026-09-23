import { useColorScheme } from 'react-native';

/**
 * Cores do app. A distinção central (especificação §7, issue #35): compromisso puro é CONTORNO
 * (algo que acontece com você); item pontuável é PREENCHIDO (algo que você faz).
 */
const claro = {
  fundo: '#FAF8F4',
  superficie: '#FFFFFF',
  texto: '#1F1B16',
  sutil: '#6B645A',
  borda: '#DDD6CB',
  destaque: '#2F6B8C',
  hoje: '#8C4A2F',
  perigo: '#8C2F4A',
  compromisso: '#2F6B8C',
  pontuavel: '#4A7A3A',
  textoSobrePontuavel: '#FFFFFF',
  foraDoMes: '#B8B0A4',
};

const escuro: typeof claro = {
  fundo: '#16140F',
  superficie: '#221F19',
  texto: '#F2EEE7',
  sutil: '#A69E92',
  borda: '#3A352D',
  destaque: '#7FB4D1',
  hoje: '#E0976F',
  perigo: '#E08AA0',
  compromisso: '#7FB4D1',
  pontuavel: '#8CC47A',
  textoSobrePontuavel: '#10200A',
  foraDoMes: '#5A544A',
};

export type Tema = typeof claro;

export function useTema(): Tema {
  return useColorScheme() === 'dark' ? escuro : claro;
}
