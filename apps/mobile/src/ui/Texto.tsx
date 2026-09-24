import { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';
import { FONTES, useTema } from '../tema';

type Peso = 400 | 500 | 600 | 700;

function peso(w: TextStyle['fontWeight']): Peso {
  const n = w === 'bold' ? 700 : w === 'normal' || w === undefined ? 400 : Number(w);
  if (n >= 700) return 700;
  if (n >= 600) return 600;
  if (n >= 500) return 500;
  return 400;
}

/** Família da fonte pelo peso — no Android, fonte própria não tem negrito sintético confiável. */
export function familia(estilo: TextStyle, cinzel = false): TextStyle {
  const { fontWeight, fontStyle, ...resto } = estilo;
  if (!cinzel && fontStyle === 'italic') {
    return { ...resto, fontFamily: FONTES.archivoItalico };
  }
  return { ...resto, fontFamily: (cinzel ? FONTES.cinzel : FONTES.archivo)[peso(fontWeight)] };
}

/**
 * Texto do app: Archivo por padrão, Cinzel (capitulares, números, rótulos) com `cinzel`.
 * Aceita `fontWeight` no estilo, como o `Text`, e troca pela família do peso.
 */
export function Texto({ cinzel = false, style, ...props }: TextProps & { cinzel?: boolean }) {
  const tema = useTema();
  const plano = StyleSheet.flatten([{ color: tema.texto }, style]) ?? {};
  return <Text {...props} style={familia(plano, cinzel)} />;
}

/** Campo de texto com a fonte do app. */
export const Entrada = forwardRef<TextInput, TextInputProps & { cinzel?: boolean }>(
  function Entrada({ cinzel = false, style, ...props }, ref) {
    const tema = useTema();
    const plano = StyleSheet.flatten([{ color: tema.texto }, style]) ?? {};
    return (
      <TextInput
        ref={ref}
        placeholderTextColor={tema.apagado}
        selectionColor={tema.ouro}
        cursorColor={tema.ouro}
        {...props}
        style={familia(plano, cinzel)}
      />
    );
  },
);
