import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import migracoes from '../drizzle/migrations';
import { db } from '../src/db';
import { ProvedorDeDisciplinas } from '../src/disciplinas';
import { useHoje } from '../src/hooks';
import { repositorio } from '../src/sync';
import { ProvedorDeAvisos } from '../src/ui/Aviso';
import { observarMudancas, reagendar, registrarTarefaDeBackground } from '../src/notificacoes';
import { atualizarPerfil } from '../src/perfil';
import { sincronizarAgora } from '../src/sync';

export default function Raiz() {
  const { success, error } = useMigrations(db, migracoes);
  const router = useRouter();
  const resposta = Notifications.useLastNotificationResponse();
  const hoje = useHoje();

  // Congelamento preguiçoso (ADR-0006): na abertura e na virada do dia, os itens cujo dia chegou
  // ganham effortLockedAt — offline, e sincroniza como qualquer campo.
  useEffect(() => {
    if (success) repositorio.congelarEsforcosDoDia();
  }, [success, hoje]);

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
  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Abrindo o Compasso…</Text>
      </View>
    );
  }

  return (
    <ProvedorDeDisciplinas>
      <ProvedorDeAvisos>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="(abas)" options={{ headerShown: false }} />
          <Stack.Screen name="diagnostico" options={{ title: 'Diagnóstico' }} />
          <Stack.Screen
            name="captura"
            options={{ title: 'Captura rápida', presentation: 'modal' }}
          />
          <Stack.Screen name="item/[id]" options={{ title: 'Item', presentation: 'modal' }} />
          <Stack.Screen name="notificacoes" options={{ title: 'Lembretes agendados' }} />
          <Stack.Screen name="importar" options={{ title: 'Importar calendário' }} />
          <Stack.Screen name="semestre" options={{ title: 'Semestre' }} />
          <Stack.Screen name="disciplina" options={{ title: 'Disciplina' }} />
          <Stack.Screen name="aula" options={{ title: 'Aula', presentation: 'modal' }} />
          <Stack.Screen
            name="recompensa"
            options={{ title: 'Recompensa', presentation: 'modal' }}
          />
        </Stack>
      </ProvedorDeAvisos>
    </ProvedorDeDisciplinas>
  );
}
