import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTema } from '../tema';
import { Repetir } from './Icones';
import { Texto } from './Texto';

export interface BotaoDoDialogo {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
  /** Linha de explicação embaixo da opção ("a partir de 23/09; as passadas ficam como estão"). */
  detalhe?: string;
}

interface Pedido {
  titulo: string;
  texto?: string;
  botoes: BotaoDoDialogo[];
  serie: boolean;
}

type Perguntar = (
  titulo: string,
  texto?: string,
  botoes?: BotaoDoDialogo[],
  opcoes?: { serie?: boolean },
) => void;

const Contexto = createContext<Perguntar>(() => {});

/**
 * Diálogo próprio no lugar do `Alert` nativo (design "Alcance da série"): mesma assinatura do
 * `Alert.alert`, opções em cartões de pergaminho, "Cancelar" no rodapé. Tocar no véu cancela.
 */
export function ProvedorDeDialogos({ children }: { children: ReactNode }) {
  const tema = useTema();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const perguntar = useCallback<Perguntar>((titulo, texto, botoes, opcoes) => {
    setPedido({
      titulo,
      texto,
      botoes: botoes?.length ? botoes : [{ text: 'OK', style: 'cancel' }],
      serie: !!opcoes?.serie,
    });
  }, []);

  const escolher = (b?: BotaoDoDialogo) => {
    setPedido(null);
    b?.onPress?.();
  };
  const cancelar = pedido?.botoes.find((b) => b.style === 'cancel');
  const opcoes = pedido?.botoes.filter((b) => b.style !== 'cancel') ?? [];

  return (
    <Contexto.Provider value={perguntar}>
      {children}
      <Modal
        visible={pedido !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => escolher(cancelar)}
      >
        <View style={estilos.centro}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: tema.veu }]}
            onPress={() => escolher(cancelar)}
            accessibilityLabel="Cancelar"
          />
          {pedido ? (
            <View
              style={[estilos.cartao, { backgroundColor: tema.folha, borderColor: tema.ouroClaro }]}
              accessibilityViewIsModal
            >
              <ScrollView contentContainerStyle={{ gap: 14 }} bounces={false}>
                <View style={estilos.topo}>
                  {pedido.serie ? <Repetir cor={tema.ouro} tamanho={30} traco={1.1} /> : null}
                  <Texto
                    cinzel
                    style={{ fontSize: 17, fontWeight: '600', textAlign: 'center' }}
                    accessibilityRole="header"
                  >
                    {pedido.titulo}
                  </Texto>
                  {pedido.texto ? (
                    <Texto
                      style={{
                        fontSize: 12.5,
                        lineHeight: 18,
                        color: tema.texto3,
                        textAlign: 'center',
                      }}
                    >
                      {pedido.texto}
                    </Texto>
                  ) : null}
                </View>
                {opcoes.length ? (
                  <View style={{ gap: 8 }}>
                    {opcoes.map((b) => (
                      <Pressable
                        key={b.text}
                        onPress={() => escolher(b)}
                        accessibilityRole="button"
                        style={[
                          estilos.opcao,
                          {
                            backgroundColor: tema.campo,
                            borderColor: b.style === 'destructive' ? tema.perigo : tema.bordaCampo,
                          },
                        ]}
                      >
                        <Texto
                          style={{
                            fontSize: 14,
                            fontWeight: '600',
                            color: b.style === 'destructive' ? tema.perigo : tema.texto,
                          }}
                        >
                          {b.text}
                        </Texto>
                        {b.detalhe ? (
                          <Texto style={{ fontSize: 11.5, color: tema.rotulo }}>{b.detalhe}</Texto>
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {cancelar ? (
                  <Pressable
                    onPress={() => escolher(cancelar)}
                    accessibilityRole="button"
                    style={estilos.cancelar}
                  >
                    <Texto
                      cinzel
                      style={{
                        fontSize: 12,
                        letterSpacing: 1.7,
                        color: opcoes.length ? tema.rotulo : tema.ouro,
                        fontWeight: opcoes.length ? '400' : '700',
                      }}
                    >
                      {cancelar.text.toLocaleUpperCase('pt-BR')}
                    </Texto>
                  </Pressable>
                ) : null}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
    </Contexto.Provider>
  );
}

/** `alerta(titulo, texto?, botoes?, { serie })` — substitui o `Alert.alert` nativo. */
export function useAlerta(): Perguntar {
  return useContext(Contexto);
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  cartao: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '85%',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 10,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 20 },
  },
  topo: { alignItems: 'center', gap: 8 },
  opcao: { paddingVertical: 13, paddingHorizontal: 14, borderWidth: 1, borderRadius: 9, gap: 2 },
  cancelar: { alignItems: 'center', paddingVertical: 10 },
});
