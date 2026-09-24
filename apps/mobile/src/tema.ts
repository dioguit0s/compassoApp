import type { Atributo } from '@compasso/core';

/**
 * Cores do app: o códice — pergaminho, tinta, dourado com avareza (design "Compasso em códice").
 * A distinção central (especificação §7, issue #35) continua: compromisso puro é CONTORNO (algo
 * que acontece com você); item pontuável é PREENCHIDO (algo que você faz); não cumprido é
 * tracejado e cinza, nunca vermelho de erro. Um tema só: temas estão fora do escopo (§3).
 */
const codice = {
  // Superfícies, da mais funda para a mais clara.
  fundo: '#EFE3CC',
  cabecalho: '#E7D8BB',
  faixa: '#E9DCC2',
  faixaClara: '#EDE0C7',
  barraAbas: '#E4D6BB',
  folha: '#F3E7CC',
  cartao: '#F7EEDC',
  cartaoApagado: '#F1E6D0',
  painel: '#EBDFC0',
  campo: '#FBF4E4',
  // Linhas.
  borda: '#CDBB98',
  bordaCampo: '#C9B693',
  linha: '#D6C6A8',
  divisoria: '#DFD0B3',
  grade: '#E0D0B2',
  // Tinta.
  texto: '#241C12',
  texto2: '#4A3B28',
  texto3: '#5A4B36',
  sutil: '#6B5B45',
  rotulo: '#7A6647',
  apagado: '#8C7B60',
  inativo: '#9C8865',
  // Dourado.
  ouro: '#96742A',
  ouroEscuro: '#7A5E20',
  ouroClaro: '#C2A85F',
  ouroFundo: '#F6E9C6',
  sobreOuro: '#F5EBD3',
  moeda: '#C9A33F',
  moedaTraco: '#8A6A1E',
  moedaTexto: '#5C4718',
  // Estados de item.
  pontuavel: '#E3CF9E',
  pontuavelBorda: '#C2A85F',
  compromisso: '#8C7B60',
  naoCumprido: '#A89A80',
  naoCumpridoTexto: '#9C8E74',
  foraDoMes: '#B3A488',
  // Avisos.
  hoje: '#9A4B26',
  hojeFundo: 'rgba(154,75,38,0.07)',
  perigo: '#8C2F3A',
  perigoFundo: '#F1DCD2',
  // Barra de aviso (snackbar) e véu dos modais.
  noite: '#2A2118',
  noiteBorda: '#4A3B28',
  noiteTexto: '#EFE3CC',
  noiteAcao: '#D9B55A',
  veu: 'rgba(59,47,35,0.78)',
};

export type Tema = typeof codice;

/** Cor de cada atributo — escudo, radar, faixas de nível e histórico. */
export const COR_DO_ATRIBUTO: Record<Atributo, string> = {
  corpo: '#9E3B2E',
  mente: '#2F4E7A',
  oficio: '#8A5A2B',
  casa: '#46653F',
  social: '#6A4573',
};

/**
 * Famílias carregadas em `app/_layout.tsx`. Com fonte própria, o Android ignora `fontWeight`:
 * cada peso é uma família (o `Texto` escolhe pelo peso).
 */
export const FONTES = {
  cinzel: {
    400: 'Cinzel_400Regular',
    500: 'Cinzel_500Medium',
    600: 'Cinzel_600SemiBold',
    700: 'Cinzel_700Bold',
  },
  archivo: {
    400: 'Archivo_400Regular',
    500: 'Archivo_500Medium',
    600: 'Archivo_600SemiBold',
    700: 'Archivo_700Bold',
  },
  archivoItalico: 'Archivo_400Regular_Italic',
} as const;

/**
 * Folga no fim das listas das abas para a última linha poder rolar para cima do botão "+" da
 * captura rápida, que flutua sobre o conteúdo (visto no Perfil: cobria os pontos).
 */
export const FOLGA_DO_FAB = 88;

export function useTema(): Tema {
  return codice;
}
