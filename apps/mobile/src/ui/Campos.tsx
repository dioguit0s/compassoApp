import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTema } from '../tema';

/** Campo de texto com rótulo, no estilo dos formulários do app. */
export function Campo({ rotulo, ...props }: { rotulo: string } & TextInputProps) {
  const tema = useTema();
  return (
    <View style={estilos.campo}>
      <Text style={{ color: tema.sutil, fontSize: 12 }}>{rotulo}</Text>
      <TextInput
        placeholderTextColor={tema.sutil}
        {...props}
        style={[estilos.entrada, { color: tema.texto, borderColor: tema.borda }, props.style]}
      />
    </View>
  );
}

export function Chip(p: {
  rotulo: string;
  ativo?: boolean;
  aoTocar: () => void;
  cor?: string;
  dica?: string;
}) {
  const tema = useTema();
  const cor = p.cor ?? tema.destaque;
  return (
    <Pressable
      onPress={p.aoTocar}
      accessibilityLabel={p.dica ?? p.rotulo}
      accessibilityState={{ selected: !!p.ativo }}
      style={[
        estilos.chip,
        { borderColor: p.cor ?? tema.borda },
        p.ativo && { backgroundColor: cor, borderColor: cor },
      ]}
    >
      <Text style={{ color: p.ativo ? tema.superficie : tema.texto }}>{p.rotulo}</Text>
    </Pressable>
  );
}

export function Botao(p: {
  rotulo: string;
  aoTocar: () => void;
  perigo?: boolean;
  desativado?: boolean;
}) {
  const tema = useTema();
  const cor = p.perigo ? tema.perigo : tema.destaque;
  return (
    // Desativado continua capturando o toque (só não faz nada): com `disabled`, o toque passava
    // para o Pressable de fora — no cartão de recompensa, "Resgatar" em carência abria a edição.
    <Pressable
      onPress={p.desativado ? undefined : p.aoTocar}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!p.desativado }}
      style={[estilos.botao, { borderColor: cor, opacity: p.desativado ? 0.4 : 1 }]}
    >
      <Text style={{ color: cor, fontWeight: '600' }}>{p.rotulo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  campo: { gap: 4 },
  entrada: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  botao: { borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
});
