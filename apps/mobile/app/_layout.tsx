import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack, useRouter } from 'expo-router';
import {
  Archivo_400Regular,
  Archivo_400Regular_Italic,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from '@expo-google-fonts/archivo';
import {
  Cinzel_400Regular,
  Cinzel_500Medium,
  Cinzel_600SemiBold,
  Cinzel_700Bold,
} from '@expo-google-fonts/cinzel';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import migracoes from '../drizzle/migrations';
import { db } from '../src/db';
import { ProvedorDeDisciplinas } from '../src/disciplinas';
import { useHoje } from '../src/hooks';
import { repositorio } from '../src/sync';
import { ProvedorDeAvisos } from '../src/ui/Aviso';
import { ProvedorDeDialogos } from '../src/ui/Dialogo';
import { Emblema } from '../src/ui/Icones';
import {
  observarMudancas,
  reagendar,
  registrarTarefaDeBackground,
  useUltimaRespostaDeNotificacao,
} from '../src/notificacoes';
import { atualizarPerfil } from '../src/perfil';
import { sincronizarAgora } from '../src/sync';
import { useTema } from '../src/tema';

export default function Raiz() {
  const { success, error } = useMigrations(db, migracoes);
  const router = useRouter();
  const resposta = useUltimaRespostaDeNotificacao();
  const hoje = useHoje();
  const tema = useTema();
  // Sem as fontes a tela abre em fonte do sistema e pula quando elas chegam; se falharem, segue.
  const [fontes, erroDeFonte] = useFonts({
    Archivo_400Regular,
    Archivo_400Regular_Italic,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Cinzel_400Regular,
    Cinzel_500Medium,
    Cinzel_600SemiBold,
    Cinzel_700Bold,
  });
  const fontesProntas = fontes || erroDeFonte !== null;

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
    // Só com o Stack montado (banco migrado e fontes prontas): antes disso não há onde navegar.
    if (!success || !fontesProntas || !resposta) return;
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
  }, [success, fontesProntas, resposta, router]);

  if (error) {
    return (
      <View style={[estilos.abertura, { backgroundColor: tema.cabecalho, padding: 24 }]}>
        <Text style={{ fontWeight: 'bold', color: tema.perigo }}>
          Falha ao migrar o banco local
        </Text>
        <Text style={{ color: tema.texto }}>{error.message}</Text>
      </View>
    );
  }
  if (!success || !fontesProntas) {
    return (
      <View style={[estilos.abertura, { backgroundColor: tema.cabecalho }]}>
        <StatusBar style="dark" />
        <Emblema tamanho={96} abertura />
        {fontesProntas ? (
          <>
            <Text style={[estilos.marca, { color: tema.texto }]}>COMPASSO</Text>
            <Text style={[estilos.abrindo, { color: tema.sutil }]}>Abrindo o Compasso…</Text>
          </>
        ) : null}
      </View>
    );
  }

  const folha = { presentation: 'transparentModal', animation: 'fade' } as const;
  return (
    <ProvedorDeDisciplinas>
      <ProvedorDeDialogos>
        <ProvedorDeAvisos>
          <StatusBar style="dark" />
          {/* Cada tela desenha o próprio cabeçalho (códice): sem o do Stack. */}
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: tema.fundo },
            }}
          >
            <Stack.Screen name="(abas)" />
            <Stack.Screen name="captura" options={folha} />
            <Stack.Screen
              name="item/[id]"
              options={{ presentation: 'modal', contentStyle: { backgroundColor: tema.folha } }}
            />
            <Stack.Screen name="aula" options={folha} />
            <Stack.Screen name="recompensa" options={folha} />
          </Stack>
        </ProvedorDeAvisos>
      </ProvedorDeDialogos>
    </ProvedorDeDisciplinas>
  );
}

const estilos = StyleSheet.create({
  abertura: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 },
  marca: { fontFamily: 'Cinzel_700Bold', fontSize: 28, letterSpacing: 2.2 },
  abrindo: { fontFamily: 'Archivo_400Regular_Italic', fontSize: 13 },
});
