import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTema } from '../tema';

interface Aviso {
  texto: string;
  acao?: { rotulo: string; aoTocar: () => void };
}

const Contexto = createContext<(a: Aviso) => void>(() => {});

/** Barra de aviso temporária no rodapé (ex.: "+3,5 Mente · +5 moedas — Desfazer"). */
export function ProvedorDeAvisos({ children }: { children: ReactNode }) {
  const tema = useTema();
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
          style={[estilos.barra, { backgroundColor: tema.texto }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[estilos.texto, { color: tema.fundo }]}>{aviso.texto}</Text>
          {aviso.acao ? (
            <Pressable
              onPress={() => {
                aviso.acao!.aoTocar();
                setAviso(null);
              }}
            >
              <Text style={{ color: tema.hoje, fontWeight: '700' }}>{aviso.acao.rotulo}</Text>
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
    left: 16,
    right: 16,
    bottom: 100,
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  texto: { flex: 1 },
});
