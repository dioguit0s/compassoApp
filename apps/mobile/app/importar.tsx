import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { enviarArquivo, lerConexao } from '../src/servidor';
import { sincronizarAgora } from '../src/sync';
import { useTema } from '../src/tema';
import { CabecalhoInterno } from '../src/ui/Cabecalho';
import { Botao, Rotulo } from '../src/ui/Campos';
import { Texto } from '../src/ui/Texto';

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

  const numeros: { n: number; rotulo: string; forte: boolean }[] = resumo
    ? [
        { n: resumo.criados, rotulo: 'criados', forte: true },
        { n: resumo.atualizados, rotulo: 'atualizados', forte: true },
        { n: resumo.inalterados, rotulo: 'já estavam iguais', forte: false },
        { n: resumo.desvios, rotulo: 'exceções de séries', forte: false },
      ]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <CabecalhoInterno voltar="Configurações" titulo="Importar calendário" />
      <ScrollView contentContainerStyle={estilos.tela}>
        <Texto style={{ fontSize: 12.5, lineHeight: 19, color: tema.texto2 }}>
          No Google Calendar, abra Configurações › Importar e exportar › Exportar, descompacte o
          .zip e escolha o arquivo .ics. Esta é a única tela que precisa de rede; importar de novo
          não duplica nada. Tudo entra como compromisso, sem esforço.
        </Texto>
        <Botao
          variante="primario"
          rotulo="Escolher arquivo .ics"
          desativado={estado !== 'parado'}
          aoTocar={() => void escolherEEnviar()}
        />
        {estado !== 'parado' ? (
          <View style={estilos.progresso}>
            <ActivityIndicator color={tema.ouro} />
            <Texto style={{ fontSize: 13, color: tema.texto2 }}>
              {estado === 'enviando' ? 'Enviando e convertendo…' : 'Trazendo para o aparelho…'}
            </Texto>
          </View>
        ) : null}
        {erro ? <Texto style={{ color: tema.perigo, fontSize: 12.5 }}>{erro}</Texto> : null}
        {resumo ? (
          <>
            <View style={estilos.grade}>
              {numeros.map((x) => (
                <View
                  key={x.rotulo}
                  style={[
                    estilos.numero,
                    { backgroundColor: tema.cartao, borderColor: tema.bordaCampo },
                  ]}
                >
                  <Texto
                    cinzel
                    style={{
                      fontSize: 24,
                      fontWeight: '700',
                      color: x.forte ? tema.moedaTexto : tema.apagado,
                    }}
                  >
                    {x.n}
                  </Texto>
                  <Texto style={{ fontSize: 11.5, color: tema.rotulo }}>{x.rotulo}</Texto>
                </View>
              ))}
            </View>
            {resumo.expandidos.length ? (
              <View style={[estilos.aviso, { borderColor: tema.hoje }]}>
                <Texto style={{ fontSize: 13, fontWeight: '700', color: tema.hoje }}>
                  Repetições que o Compasso não sabe seguir
                </Texto>
                <Texto style={{ fontSize: 12, lineHeight: 17, color: tema.sutil }}>
                  Viraram eventos avulsos de 1 ano atrás até 2 anos à frente. Depois disso, cadastre
                  a repetição de novo.
                </Texto>
                {resumo.expandidos.map((e) => (
                  <Texto key={e.titulo + e.regra} style={{ fontSize: 12, color: tema.texto2 }}>
                    {e.titulo} · {e.motivo} ({e.ocorrencias} ocorrências)
                  </Texto>
                ))}
              </View>
            ) : null}
            {resumo.ignorados.length ? (
              <View style={{ gap: 6 }}>
                <Rotulo>Não importados</Rotulo>
                {resumo.ignorados.map((i, n) => (
                  <Texto key={n} style={{ fontSize: 12, color: tema.texto2 }}>
                    {i.titulo ?? i.uid ?? '?'} · {i.motivo}
                  </Texto>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 14 },
  progresso: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  numero: { width: '48%', flexGrow: 1, padding: 12, borderWidth: 1, borderRadius: 8 },
  aviso: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
});
