import { items, perfil } from '@compasso/core/local';
import { isNotNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { db } from '../src/db';
import { reagendar } from '../src/notificacoes';
import { salvarPreferencias } from '../src/perfil';
import { encerrarSessaoNoServidor, esquecerConexao, trocarSenha } from '../src/servidor';
import { apagarDadosLocais, repositorio } from '../src/sync';
import { useTema } from '../src/tema';
import { quantas } from '../src/texto';
import { CabecalhoInterno } from '../src/ui/Cabecalho';
import { Botao, Campo, Chip, LinhaDeLista, Rotulo } from '../src/ui/Campos';
import { useAlerta } from '../src/ui/Dialogo';
import { Texto } from '../src/ui/Texto';

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
  const alerta = useAlerta();
  const { data } = useLiveQuery(db.select().from(perfil));
  const conta = data[0];
  const { data: naLixeira } = useLiveQuery(
    db.select({ id: items.id }).from(items).where(isNotNull(items.deletedAt)),
  );
  const [nome, setNome] = useState(conta?.displayName ?? '');
  // A consulta viva começa vazia: preenche o nome quando a conta chega (ou muda pelo sync).
  useEffect(() => {
    if (conta) setNome(conta.displayName);
  }, [conta?.displayName]);
  const [erro, setErro] = useState('');
  const contarPendentes = () =>
    Object.values(repositorio.sujos()).reduce((n, l) => n + l.length, 0);
  // Legenda do botão Sair: recontada quando o perfil ou a lixeira mudam, não a cada tecla.
  const pendentes = useMemo(contarPendentes, [conta, naLixeira]);

  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <CabecalhoInterno voltar="Perfil" titulo="Configurações" />
      <ScrollView contentContainerStyle={estilos.tela} keyboardShouldPersistTaps="handled">
        {conta ? (
          <>
            <View style={estilos.bloco}>
              <Rotulo>Nome de exibição</Rotulo>
              <View style={estilos.inline}>
                <View style={{ flex: 1 }}>
                  <Campo
                    value={nome}
                    onChangeText={setNome}
                    accessibilityLabel="Nome de exibição"
                  />
                </View>
                <Botao
                  compacto
                  rotulo="Salvar"
                  style={{ paddingVertical: 11 }}
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
              </View>
            </View>
            <View style={estilos.bloco}>
              <Rotulo>Lembrete padrão de itens novos</Rotulo>
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
                <Texto style={{ color: tema.rotulo, fontSize: 11.5 }}>
                  Alterações salvas aqui; vão ao servidor na próxima conexão.
                </Texto>
              ) : null}
            </View>
          </>
        ) : (
          <Texto style={{ color: tema.sutil, fontSize: 13 }}>
            Conecte ao servidor uma vez para editar o perfil.
          </Texto>
        )}
        {erro ? <Texto style={{ color: tema.perigo, fontSize: 12.5 }}>{erro}</Texto> : null}

        <View style={[estilos.bloco, { gap: 6 }]}>
          <Rotulo>Fuso horário</Rotulo>
          <Texto style={{ fontSize: 12.5, lineHeight: 19, color: tema.texto2 }}>
            Todos os horários do Compasso são de São Paulo, qualquer que seja o fuso do aparelho.
          </Texto>
        </View>

        <View style={[estilos.lista, { borderTopColor: tema.linha }]}>
          <LinhaDeLista rotulo="Régua de esforço" aoTocar={() => router.push('/regua')} />
          <LinhaDeLista
            rotulo="Lixeira"
            dica={naLixeira.length ? quantas(naLixeira.length, 'item', 'itens') : undefined}
            aoTocar={() => router.push('/lixeira')}
          />
          <LinhaDeLista
            rotulo="Importar calendário (.ics)"
            aoTocar={() => router.push('/importar')}
          />
          <LinhaDeLista
            rotulo="Lembretes agendados"
            dica="diagnóstico"
            seta={false}
            aoTocar={() => router.push('/notificacoes')}
          />
          <LinhaDeLista
            rotulo="Fuso e IDs do aparelho"
            dica="diagnóstico"
            seta={false}
            aoTocar={() => router.push('/diagnostico')}
          />
        </View>

        {conta ? <TrocaDeSenha /> : null}

        <View style={[estilos.bloco, estilos.sair, { borderTopColor: tema.linha }]}>
          <Botao
            perigo
            rotulo="Sair da conta"
            aoTocar={() => {
              const pendentes = contarPendentes();
              alerta(
                'Sair da conta?',
                `Encerra a sessão e apaga todos os dados deste aparelho.${pendentes ? ` ${pendentes} alteração(ões) ainda não foram enviadas ao servidor e serão perdidas.` : ' Tudo já está no servidor.'}`,
                [
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
                  { text: 'Cancelar', style: 'cancel' },
                ],
              );
            }}
          />
          <Texto
            style={{ fontSize: 11.5, lineHeight: 17, color: tema.rotulo, textAlign: 'center' }}
          >
            Apaga os dados deste aparelho.{' '}
            {pendentes
              ? `${quantas(pendentes, 'alteração ainda não foi enviada', 'alterações ainda não foram enviadas')}.`
              : 'Tudo já está no servidor.'}
          </Texto>
        </View>
      </ScrollView>
    </View>
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
      <Rotulo>Trocar senha</Rotulo>
      <Campo
        placeholder="Senha atual"
        accessibilityLabel="Senha atual"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        value={atual}
        onChangeText={setAtual}
      />
      <Campo
        placeholder="Nova senha (mín. 8)"
        accessibilityLabel="Nova senha, mínimo 8 caracteres"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        value={nova}
        onChangeText={setNova}
      />
      <Campo
        placeholder="Repetir a nova senha"
        accessibilityLabel="Repetir a nova senha"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        value={confirmacao}
        onChangeText={setConfirmacao}
        erro={naoConfere ? 'As duas senhas novas diferem.' : null}
      />
      {mensagem ? (
        <Texto style={{ fontSize: 12.5, color: mensagem.erro ? tema.perigo : tema.sutil }}>
          {mensagem.texto}
        </Texto>
      ) : null}
      <Botao
        compacto
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
  tela: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 20 },
  bloco: { gap: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  lista: { borderTopWidth: 1 },
  sair: { borderTopWidth: 1, paddingTop: 14 },
});
