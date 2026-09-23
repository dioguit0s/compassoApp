import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { enviarArquivo, lerConexao } from '../src/servidor';
import { sincronizarAgora } from '../src/sync';
import { useTema } from '../src/tema';

interface Resumo {
  criados: number;
  atualizados: number;
  inalterados: number;
  desvios: number;
  expandidos: { titulo: string; regra: string; motivo: string; ocorrencias: number }[];
  ignorados: { uid: string | null; titulo: string | null; motivo: string }[];
}

/**
 * Importação única do .ics exportado do Google Calendar (especificação §6.5, issue #53). É a
 * única operação do app que exige rede: o servidor converte e grava, e o sync traz de volta.
 */
export default function Importar() {
  const tema = useTema();
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'sincronizando'>('parado');
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState('');

  async function escolherEEnviar() {
    setErro('');
    setResumo(null);
    const escolha = await DocumentPicker.getDocumentAsync({
      type: ['text/calendar', 'text/x-vcalendar', 'application/octet-stream', '*/*'],
      copyToCacheDirectory: true,
    });
    if (escolha.canceled || !escolha.assets[0]) return;
    const conexao = await lerConexao();
    if (!conexao) {
      setErro('Configure o servidor na aba Perfil antes de importar.');
      return;
    }
    try {
      setEstado('enviando');
      const r = await enviarArquivo<Resumo>(conexao, '/import/ics', escolha.assets[0]);
      setResumo(r);
      setEstado('sincronizando');
      await sincronizarAgora();
    } catch (e) {
      setErro(`A importação falhou e nada foi gravado: ${(e as Error).message}`);
    } finally {
      setEstado('parado');
    }
  }

  return (
    <ScrollView style={{ backgroundColor: tema.fundo }} contentContainerStyle={estilos.tela}>
      <Text style={{ color: tema.texto }}>
        No Google Calendar: Configurações → Importar e exportar → Exportar. Descompacte o .zip e
        escolha o .ics do calendário aqui.
      </Text>
      <Text style={{ color: tema.sutil }}>
        Precisa de rede: é a única tela do Compasso que não funciona offline. Pode importar o mesmo
        arquivo de novo — o que já veio é atualizado, nada é duplicado. Tudo entra como compromisso,
        sem esforço.
      </Text>
      <Pressable
        onPress={escolherEEnviar}
        disabled={estado !== 'parado'}
        style={[
          estilos.botao,
          { backgroundColor: tema.destaque, opacity: estado === 'parado' ? 1 : 0.5 },
        ]}
      >
        <Text style={{ color: tema.superficie, fontWeight: '600' }}>Escolher arquivo .ics</Text>
      </Pressable>
      {estado !== 'parado' ? (
        <View style={estilos.linha}>
          <ActivityIndicator />
          <Text style={{ color: tema.texto }}>
            {estado === 'enviando' ? 'Enviando e convertendo…' : 'Trazendo para o aparelho…'}
          </Text>
        </View>
      ) : null}
      {erro ? <Text style={{ color: tema.perigo }}>{erro}</Text> : null}
      {resumo ? (
        <View style={estilos.bloco}>
          <Text style={[estilos.titulo, { color: tema.texto }]}>Resultado</Text>
          <Text style={{ color: tema.texto }}>
            {resumo.criados} criados · {resumo.atualizados} atualizados · {resumo.inalterados} já
            estavam iguais · {resumo.desvios} exceções de séries
          </Text>
          {resumo.expandidos.length ? (
            <View style={[estilos.aviso, { borderColor: tema.hoje }]}>
              <Text style={{ color: tema.texto, fontWeight: '600' }}>
                Repetições que o Compasso não sabe seguir
              </Text>
              <Text style={{ color: tema.sutil }}>
                Viraram eventos avulsos de 1 ano atrás até 2 anos à frente. Depois disso, cadastre a
                repetição de novo.
              </Text>
              {resumo.expandidos.map((e) => (
                <Text key={e.titulo + e.regra} style={{ color: tema.texto }}>
                  • {e.titulo}: {e.ocorrencias} ocorrências ({e.motivo})
                </Text>
              ))}
            </View>
          ) : null}
          {resumo.ignorados.length ? (
            <View style={estilos.bloco}>
              <Text style={{ color: tema.texto, fontWeight: '600' }}>Não importados</Text>
              {resumo.ignorados.map((i, n) => (
                <Text key={n} style={{ color: tema.sutil }}>
                  • {i.titulo ?? i.uid ?? '?'}: {i.motivo}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: 16, gap: 14 },
  botao: { padding: 14, borderRadius: 10, alignItems: 'center' },
  linha: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  bloco: { gap: 6 },
  titulo: { fontSize: 18, fontWeight: '600' },
  aviso: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 4 },
});
