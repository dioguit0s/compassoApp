import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTema } from '../tema';
import { Texto } from './Texto';

interface Aviso {
  texto: string;
  acao?: { rotulo: string; aoTocar: () => void };
}

const Contexto = createContext<(a: Aviso) => void>(() => {});

/** Barra de aviso temporária no rodapé (ex.: "+3,5 Mente · +5 moedas — DESFAZER"). */
export function ProvedorDeAvisos({ children }: { children: ReactNode }) {
  const tema = useTema();
  const { bottom } = useSafeAreaInsets();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mostrar = useCallback((a: Aviso) => {
    if (timer.current) clearTimeout(timer.current);
    setAviso(a);
    timer.current = setTimeout(() => setAviso(null), 6000);
  }, []);
  return (
    <Contexto.Provider value={mostrar}>
      {children}
      {aviso ? (
        <View
          // Logo acima da barra de abas (64 + margem de gestos), por cima do botão "+".
          style={[
            estilos.barra,
            { bottom: 76 + bottom, backgroundColor: tema.noite, borderColor: tema.noiteBorda },
          ]}
          accessibilityLiveRegion="polite"
        >
          <Texto style={[estilos.texto, { color: tema.noiteTexto }]}>{aviso.texto}</Texto>
          {aviso.acao ? (
            <Pressable
              hitSlop={10}
              onPress={() => {
                aviso.acao!.aoTocar();
                setAviso(null);
              }}
            >
              <Texto
                cinzel
                style={{
                  fontSize: 12,
                  letterSpacing: 1.7,
                  color: tema.noiteAcao,
                  fontWeight: '600',
                }}
              >
                {aviso.acao.rotulo.toLocaleUpperCase('pt-BR')}
              </Texto>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Contexto.Provider>
  );
}

export function useAviso() {
  return useContext(Contexto);
}

const estilos = StyleSheet.create({
  barra: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
  },
  texto: { flex: 1, fontSize: 13 },
});
