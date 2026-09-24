import { instanteDoDisparo, ORCAMENTO_NOTIFICACOES } from '@compasso/core';
import type { NotificationRequest } from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { dataHoraCurta } from '../src/datasUi';
import { pendentes, reagendar } from '../src/notificacoes';
import { useTema } from '../src/tema';
import { CabecalhoInterno } from '../src/ui/Cabecalho';
import { Botao } from '../src/ui/Campos';
import { Texto } from '../src/ui/Texto';

/** Diagnóstico (issue #49): as notificações pendentes, em ordem, contra o orçamento. */
export default function Notificacoes() {
  const tema = useTema();
  const [lista, setLista] = useState<NotificationRequest[]>([]);
  const carregar = useCallback(async () => setLista(await pendentes()), []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <CabecalhoInterno voltar="Configurações" titulo="Lembretes agendados" />
      <FlatList
        contentContainerStyle={estilos.tela}
        data={lista}
        keyExtractor={(n) => n.identifier}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 4 }}>
            <View style={{ gap: 6 }}>
              <View style={estilos.orcamento}>
                <Texto cinzel style={{ fontSize: 22, fontWeight: '700' }}>
                  {lista.length}{' '}
                  <Texto style={{ fontSize: 13, color: tema.rotulo }}>
                    de {ORCAMENTO_NOTIFICACOES}
                  </Texto>
                </Texto>
                <Texto style={{ fontSize: 11, color: tema.apagado }}>
                  orçamento; o iOS aceita 64
                </Texto>
              </View>
              <View style={[estilos.trilha, { backgroundColor: tema.divisoria }]}>
                <View
                  style={{
                    width: `${Math.min(100, (100 * lista.length) / ORCAMENTO_NOTIFICACOES)}%`,
                    height: '100%',
                    backgroundColor: tema.ouro,
                  }}
                />
              </View>
            </View>
            <Botao
              compacto
              rotulo="Reagendar agora"
              aoTocar={async () => {
                await reagendar();
                await carregar();
              }}
            />
          </View>
        }
        renderItem={({ item }) => {
          const ms = instanteDoDisparo(item.identifier);
          return (
            <View style={[estilos.linha, { borderBottomColor: tema.divisoria }]}>
              <View style={estilos.orcamento}>
                <Texto style={{ fontSize: 13.5, fontWeight: '600', flexShrink: 1 }}>
                  {item.content.title}
                </Texto>
                <Texto cinzel style={{ fontSize: 11, color: tema.sutil }}>
                  {ms ? dataHoraCurta(new Date(ms)) : '?'}
                </Texto>
              </View>
              <Texto style={{ fontSize: 11.5, color: tema.rotulo }}>{item.content.body}</Texto>
            </View>
          );
        }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  orcamento: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  trilha: { height: 5, borderRadius: 3, overflow: 'hidden' },
  linha: { paddingVertical: 11, gap: 2, borderBottomWidth: 1 },
});
