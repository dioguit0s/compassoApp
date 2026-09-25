import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTema } from '../tema';
import { Seta } from './Icones';
import { useAlturaTeclado } from './teclado';
import { Texto } from './Texto';

/**
 * Cabeçalho das telas internas: "← Calendário" e o título em capitulares. `corTopo` é a faixa
 * na cor da disciplina.
 */
export function CabecalhoInterno({
  voltar,
  titulo,
  subtitulo,
  corTopo,
}: {
  voltar: string;
  titulo: string;
  subtitulo?: string;
  corTopo?: string;
}) {
  const tema = useTema();
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  return (
    <View
      style={[
        estilos.interno,
        {
          paddingTop: top + 14,
          backgroundColor: tema.cabecalho,
          borderBottomColor: tema.borda,
        },
        corTopo ? { borderTopWidth: 5, borderTopColor: corTopo } : null,
      ]}
    >
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={`Voltar para ${voltar}`}
        hitSlop={10}
        style={estilos.voltar}
      >
        <Seta cor={tema.ouroEscuro} voltar largura={13} />
        <Texto style={{ fontSize: 12, color: tema.sutil }}>{voltar}</Texto>
      </Pressable>
      <Texto cinzel style={{ fontSize: 21, fontWeight: '700' }} numberOfLines={2}>
        {titulo}
      </Texto>
      {subtitulo ? <Texto style={{ fontSize: 12, color: tema.rotulo }}>{subtitulo}</Texto> : null}
    </View>
  );
}

/** Cabeçalho de modal em página: "Fechar · TÍTULO · SALVAR". */
export function CabecalhoModal({
  titulo,
  aoSalvar,
  rotuloSalvar = 'Salvar',
  emFolha = false,
}: {
  titulo: string;
  aoSalvar?: () => void;
  rotuloSalvar?: string;
  /** Dentro de uma folha (sem fundo nem margem de status). */
  emFolha?: boolean;
}) {
  const tema = useTema();
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  return (
    <View
      style={[
        estilos.modal,
        emFolha
          ? { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }
          : {
              paddingTop: top + 14,
              backgroundColor: tema.cabecalho,
              borderBottomWidth: 1,
              borderBottomColor: tema.borda,
            },
      ]}
    >
      <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
        <Texto style={{ fontSize: 13, color: tema.rotulo }}>Fechar</Texto>
      </Pressable>
      <Texto
        cinzel
        style={{ fontSize: 13, letterSpacing: 2.3, fontWeight: '600', flexShrink: 1 }}
        numberOfLines={1}
      >
        {titulo.toLocaleUpperCase('pt-BR')}
      </Texto>
      {aoSalvar ? (
        <Pressable
          onPress={aoSalvar}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={rotuloSalvar}
        >
          <Texto
            cinzel
            style={{ fontSize: 12.5, letterSpacing: 1.5, color: tema.ouro, fontWeight: '700' }}
          >
            {rotuloSalvar.toLocaleUpperCase('pt-BR')}
          </Texto>
        </Pressable>
      ) : (
        <View style={{ width: 40 }} />
      )}
    </View>
  );
}

/**
 * Folha de pergaminho sobre o véu (captura, aula, recompensa). A tela precisa ser apresentada
 * como `transparentModal`; tocar no véu fecha. `topo` fixa a folha a essa distância do alto.
 * Com o teclado aberto a folha sobe junto (margem medida, não `KeyboardAvoidingView`: o padding
 * dele não empurra filho `absolute`).
 */
export function Folha({
  children,
  topo,
  corFaixa,
  style,
}: {
  children: ReactNode;
  topo?: number;
  corFaixa?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const tema = useTema();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const teclado = useAlturaTeclado();
  // No iOS a altura do teclado já cobre a área do indicador; no Android vem sem a barra de
  // navegação, que continua embaixo do teclado e segue precisando do respiro.
  const respiro = teclado > 0 && Platform.OS === 'ios' ? 0 : bottom;
  return (
    <View style={{ flex: 1 }}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: tema.veu }]}
        onPress={() => router.back()}
        accessibilityLabel="Fechar"
      />
      <View style={{ flex: 1, marginBottom: teclado }} pointerEvents="box-none">
        <View
          style={[
            estilos.folha,
            {
              backgroundColor: tema.folha,
              borderTopColor: tema.ouroClaro,
              paddingBottom: respiro,
            },
            topo !== undefined ? { top: topo, bottom: 0 } : { bottom: 0 },
            style,
          ]}
        >
          {corFaixa ? <View style={{ height: 6, backgroundColor: corFaixa }} /> : null}
          <View style={[estilos.alca, { backgroundColor: tema.bordaCampo }]} />
          {children}
        </View>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  interno: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, gap: 8 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  modal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 12,
  },
  folha: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 2,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    maxHeight: '100%',
  },
  alca: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12 },
});
