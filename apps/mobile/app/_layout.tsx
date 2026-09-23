import { configurarAleatoriedade } from '@compasso/core';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import migracoes from '../drizzle/migrations';
import { db } from '../src/db';
import { observarMudancas, reagendar, registrarTarefaDeBackground } from '../src/notificacoes';
import { atualizarPerfil } from '../src/perfil';
import { sincronizarAgora } from '../src/sync';

// UUIDv7 do core usa a aleatoriedade nativa do expo-crypto — sem polyfill global no Hermes.
configurarAleatoriedade((bytes) => {
  Crypto.getRandomValues(bytes);
});

export default function Raiz() {
  const { success, error } = useMigrations(db, migracoes);
  const router = useRouter();
  const resposta = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!success) return;
    // Na abertura: perfil e sincronização, sem bloquear a tela — ela já lê do SQLite.
    void atualizarPerfil();
    void sincronizarAgora();
    void reagendar();
    void registrarTarefaDeBackground();
    return observarMudancas();
  }, [success]);

  // Tocar num lembrete abre o detalhe do item (ou da ocorrência).
  useEffect(() => {
    if (!success || !resposta) return;
    const dados = resposta.notification.request.content.data as {
      itemId?: string;
      ocorrencia?: string | null;
    };
    if (!dados?.itemId) return;
    router.push({
      pathname: '/item/[id]',
      params: dados.ocorrencia
        ? { id: dados.itemId, ocorrencia: dados.ocorrencia }
        : { id: dados.itemId },
    });
  }, [success, resposta, router]);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontWeight: 'bold' }}>Falha ao migrar o banco local</Text>
        <Text>{error.message}</Text>
      </View>
    );
  }
  if (!success) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="(abas)" options={{ headerShown: false }} />
        <Stack.Screen name="diagnostico" options={{ title: 'Diagnóstico' }} />
        <Stack.Screen name="captura" options={{ title: 'Captura rápida', presentation: 'modal' }} />
        <Stack.Screen name="item/[id]" options={{ title: 'Item', presentation: 'modal' }} />
        <Stack.Screen name="notificacoes" options={{ title: 'Lembretes agendados' }} />
        <Stack.Screen name="importar" options={{ title: 'Importar calendário' }} />
      </Stack>
    </>
  );
}
