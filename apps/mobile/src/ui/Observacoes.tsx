import { trechosDaNota } from '@compasso/core';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useTema } from '../tema';
import { Campo, Rotulo } from './Campos';
import { useAlerta } from './Dialogo';
import { Texto } from './Texto';

/**
 * Observações do item no detalhe (especificação §7). Com texto, abre em modo leitura: links,
 * e-mails e telefones viram toque (o link da reunião, o telefone do consultório). Tocar no texto
 * ou em "editar" volta para o campo. Continua texto puro — nada de formatação é gravado.
 */
export function Observacoes({
  valor,
  aoMudar,
}: {
  valor: string;
  aoMudar: (notas: string) => void;
}) {
  const tema = useTema();
  const alerta = useAlerta();
  const [editando, setEditando] = useState(false);

  // `editando` liga no foco: sem isso, a primeira letra digitada num campo vazio já trocaria o
  // campo pelo modo leitura.
  if (editando || !valor.trim()) {
    return (
      <Campo
        rotulo="Observações"
        value={valor}
        onChangeText={aoMudar}
        multiline
        autoFocus={editando}
        onFocus={() => setEditando(true)}
        onBlur={() => setEditando(false)}
        placeholder="Endereço, link da reunião, o que levar…"
        placeholderTextColor={tema.inativo}
      />
    );
  }

  const abrir = (alvo: string) =>
    void Linking.openURL(alvo).catch(() =>
      alerta('Não foi possível abrir', 'Nenhum app neste aparelho abre esse endereço.'),
    );

  return (
    <View style={{ gap: 6 }}>
      <View style={estilos.cabecalho}>
        <Rotulo>Observações</Rotulo>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Editar observações"
          onPress={() => setEditando(true)}
        >
          <Texto style={{ fontSize: 12, color: tema.ouroEscuro }}>editar</Texto>
        </Pressable>
      </View>
      <Pressable
        onPress={() => setEditando(true)}
        accessibilityHint="Toque para editar"
        style={[estilos.leitura, { backgroundColor: tema.campo, borderColor: tema.bordaCampo }]}
      >
        <Texto style={estilos.texto}>
          {trechosDaNota(valor).map((t, i) =>
            t.tipo === 'texto' ? (
              t.texto
            ) : (
              <Texto
                key={i}
                accessibilityRole="link"
                onPress={() => abrir(t.alvo)}
                style={[estilos.texto, { color: tema.ouroEscuro, textDecorationLine: 'underline' }]}
              >
                {t.texto}
              </Texto>
            ),
          )}
        </Texto>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leitura: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    minHeight: 64,
  },
  texto: { fontSize: 14, lineHeight: 19 },
});
