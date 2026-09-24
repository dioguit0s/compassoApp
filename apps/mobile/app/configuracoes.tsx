import { FUSO_PADRAO } from '@compasso/core';
import { perfil } from '@compasso/core/local';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { db } from '../src/db';
import { reagendar } from '../src/notificacoes';
import { salvarPreferencias } from '../src/perfil';
import { encerrarSessaoNoServidor, esquecerConexao, trocarSenha } from '../src/servidor';
import { apagarDadosLocais, repositorio } from '../src/sync';
import { useTema } from '../src/tema';
import { Botao, Campo, Chip } from '../src/ui/Campos';

const LEMBRETES: { rotulo: string; minutos: number | null }[] = [
  { rotulo: 'Nenhum', minutos: null },
  { rotulo: '10 min', minutos: 10 },
  { rotulo: '30 min', minutos: 30 },
  { rotulo: '1 h', minutos: 60 },
  { rotulo: '1 dia', minutos: 1440 },
];

/** Configurações (especificação §7, issue #85). Nome e lembrete padrão funcionam offline. */
export default function Configuracoes() {
  const tema = useTema();
  const router = useRouter();
  const { data } = useLiveQuery(db.select().from(perfil));
  const conta = data[0];
  const [nome, setNome] = useState(conta?.displayName ?? '');
  // A consulta viva começa vazia: preenche o nome quando a conta chega (ou muda pelo sync).
  useEffect(() => {
    if (conta) setNome(conta.displayName);
  }, [conta?.displayName]);
  const [erro, setErro] = useState('');

  return (
    <ScrollView style={{ backgroundColor: tema.fundo }} contentContainerStyle={estilos.tela}>
      {conta ? (
        <>
          <Campo rotulo="Nome de exibição" value={nome} onChangeText={setNome} />
          <Botao
            rotulo="Salvar nome"
            desativado={!nome.trim() || nome.trim() === conta.displayName}
            aoTocar={() => {
              try {
                salvarPreferencias({ displayName: nome });
                setErro('');
              } catch (e) {
                setErro((e as Error).message);
              }
            }}
          />
          <Text style={{ color: tema.sutil }}>Lembrete padrão de itens novos</Text>
          <View style={estilos.chips}>
            {LEMBRETES.map((l) => (
              <Chip
                key={l.rotulo}
                rotulo={l.rotulo}
                ativo={(conta.defaultReminderMinutes ?? null) === l.minutos}
                aoTocar={() => salvarPreferencias({ defaultReminderMinutes: l.minutos })}
              />
            ))}
          </View>
          {conta.pendente ? (
            <Text style={{ color: tema.sutil, fontSize: 12 }}>
              Alterações salvas aqui; vão ao servidor na próxima conexão.
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={{ color: tema.sutil }}>Conecte ao servidor uma vez para editar o perfil.</Text>
      )}
      {erro ? <Text style={{ color: tema.perigo }}>{erro}</Text> : null}

      <View style={estilos.bloco}>
        <Text style={[estilos.subtitulo, { color: tema.texto }]}>Fuso horário</Text>
        <Text style={{ color: tema.sutil }}>
          Todo horário do Compasso é hora de São Paulo ({FUSO_PADRAO}), esteja o aparelho onde
          estiver (ADR-0003).
        </Text>
      </View>

      <Link href="/regua" style={[estilos.link, { color: tema.destaque }]}>
        Régua de esforço
      </Link>
      <Link href="/lixeira" style={[estilos.link, { color: tema.destaque }]}>
        Lixeira
      </Link>
      <Link href="/importar" style={[estilos.link, { color: tema.destaque }]}>
        Importar calendário (.ics)
      </Link>

      {conta ? <TrocaDeSenha /> : null}

      <Botao
        perigo
        rotulo="Sair da conta"
        aoTocar={() => {
          const pendentes = Object.values(repositorio.sujos()).reduce((n, l) => n + l.length, 0);
          Alert.alert(
            'Sair da conta?',
            `Encerra a sessão e apaga todos os dados deste aparelho.${pendentes ? ` ${pendentes} alteração(ões) ainda não foram enviadas ao servidor e serão perdidas.` : ' Tudo já está no servidor.'}`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Sair',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await encerrarSessaoNoServidor();
                    await esquecerConexao();
                    apagarDadosLocais();
                    await reagendar(); // cancela os lembretes da conta que saiu
                    router.replace('/perfil');
                  } catch (e) {
                    setErro((e as Error).message);
                  }
                },
              },
            ],
          );
        }}
      />
    </ScrollView>
  );
}

/** Troca de senha (F10, ADR-0008). Precisa de rede; encerra a sessão dos outros aparelhos. */
function TrocaDeSenha() {
  const tema = useTema();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const naoConfere = confirmacao !== '' && nova !== confirmacao;

  return (
    <View style={estilos.bloco}>
      <Text style={[estilos.subtitulo, { color: tema.texto }]}>Trocar senha</Text>
      <Campo
        rotulo="Senha atual"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        value={atual}
        onChangeText={setAtual}
      />
      <Campo
        rotulo="Senha nova (mínimo 8 caracteres)"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        value={nova}
        onChangeText={setNova}
      />
      <Campo
        rotulo="Repita a senha nova"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        value={confirmacao}
        onChangeText={setConfirmacao}
      />
      {naoConfere ? (
        <Text style={{ color: tema.perigo }}>As duas senhas novas diferem.</Text>
      ) : null}
      {mensagem ? (
        <Text style={{ color: mensagem.erro ? tema.perigo : tema.sutil }}>{mensagem.texto}</Text>
      ) : null}
      <Botao
        rotulo={enviando ? 'Enviando…' : 'Trocar senha'}
        desativado={enviando || !atual || nova.length < 8 || nova !== confirmacao}
        aoTocar={async () => {
          setEnviando(true);
          try {
            const n = await trocarSenha(atual, nova);
            setAtual('');
            setNova('');
            setConfirmacao('');
            setMensagem({
              texto: `Senha trocada.${n ? ` ${n} outro(s) aparelho(s) precisarão entrar de novo.` : ''}`,
              erro: false,
            });
          } catch (e) {
            setMensagem({ texto: (e as Error).message, erro: true });
          } finally {
            setEnviando(false);
          }
        }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: 16, gap: 12 },
  bloco: { gap: 4 },
  subtitulo: { fontSize: 16, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  link: { paddingVertical: 8, fontSize: 16 },
});
