import { instanteDoDisparo, ORCAMENTO_NOTIFICACOES } from '@compasso/core';
import type { NotificationRequest } from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { dataHoraCurta } from '../src/datasUi';
import { pendentes, reagendar } from '../src/notificacoes';
import { useTema } from '../src/tema';

/** Diagnóstico (issue #49): as notificações pendentes, em ordem, contra o orçamento. */
export default function Notificacoes() {
  const tema = useTema();
  const [lista, setLista] = useState<NotificationRequest[]>([]);
  const carregar = useCallback(async () => setLista(await pendentes()), []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <View style={[estilos.tela, { backgroundColor: tema.fundo }]}>
      <Text style={{ color: tema.texto }}>
        {lista.length} de {ORCAMENTO_NOTIFICACOES} (orçamento; o iOS aceita 64)
      </Text>
      <Button
        title="Reagendar agora"
        onPress={async () => {
          await reagendar();
          await carregar();
        }}
      />
      <FlatList
        data={lista}
        keyExtractor={(n) => n.identifier}
        renderItem={({ item }) => {
          const ms = instanteDoDisparo(item.identifier);
          return (
            <View style={[estilos.linha, { borderColor: tema.borda }]}>
              <Text style={{ color: tema.texto }}>{item.content.title}</Text>
              <Text style={{ color: tema.sutil }}>
                {ms ? dataHoraCurta(new Date(ms)) : '?'} · {item.content.body}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, padding: 16, gap: 8 },
  linha: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
