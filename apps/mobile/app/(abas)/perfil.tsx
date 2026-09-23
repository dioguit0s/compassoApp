import { ESFORCOS, iniciais } from '@compasso/core';
import { metadados, perfil, redemptions } from '@compasso/core/local';
import { desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as ImagePicker from 'expo-image-picker';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { db } from '../../src/db';
import { useProgresso } from '../../src/hooks';
import {
  abrirAjusteDeAlarmeExato,
  estadoDaPermissao,
  pedirPermissao,
  type EstadoPermissao,
} from '../../src/notificacoes';
import { atualizarPerfil, enviarFoto, removerFoto } from '../../src/perfil';
import { lerConexao, salvarConexao } from '../../src/servidor';
import { sincronizarAgora } from '../../src/sync';
import { useTema } from '../../src/tema';
import { HistoricoXp } from '../../src/ui/HistoricoXp';
import { FaixasDeNivel, Radar } from '../../src/ui/Radar';

/**
 * Aba Perfil (especificação §7), nesta ordem: cabeçalho (foto ou avatar, nome, desde quando),
 * radar, faixas por atributo, histórico (XP por mês e resgates), configurações.
 */
export default function Perfil() {
  const tema = useTema();
  // A tela lê do SQLite, nunca da resposta da API.
  const { data } = useLiveQuery(db.select().from(perfil));
  const conta = data[0];
  const { data: sync } = useLiveQuery(
    db.select().from(metadados).where(eq(metadados.chave, 'ultimaSync')),
  );
  const { data: resgates } = useLiveQuery(
    db.select().from(redemptions).orderBy(desc(redemptions.redeemedAt)).limit(5),
  );
  const ultimaSync = sync[0] ? new Date(Number(sync[0].valor)).toLocaleString('pt-BR') : 'nunca';
  const [temConexao, setTemConexao] = useState<boolean | null>(null);
  const [permissao, setPermissao] = useState<EstadoPermissao | null>(null);
  const [estado, setEstado] = useState('');
  const progresso = useProgresso();

  useEffect(() => {
    void lerConexao().then((c) => setTemConexao(c !== null));
    void estadoDaPermissao().then(setPermissao);
  }, []);

  async function atualizar() {
    setEstado('buscando…');
    const r = await atualizarPerfil();
    await sincronizarAgora();
    setEstado(
      r === 'ok' ? 'atualizado' : r === 'falhou' ? 'sem resposta do servidor' : 'sem conexão',
    );
  }

  async function trocarFoto() {
    const escolha = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (escolha.canceled || !escolha.assets[0]) return;
    const a = escolha.assets[0];
    try {
      await enviarFoto({
        uri: a.uri,
        name: a.fileName ?? 'foto.jpg',
        mimeType: a.mimeType ?? 'image/jpeg',
      });
    } catch (e) {
      Alert.alert('Não foi possível enviar a foto', `Precisa de rede. ${(e as Error).message}`);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: tema.fundo }} contentContainerStyle={estilos.tela}>
      {conta ? (
        <View style={estilos.cabecalho}>
          <Pressable
            onPress={() =>
              Alert.alert('Foto de perfil', undefined, [
                { text: 'Escolher foto', onPress: () => void trocarFoto() },
                ...(conta.avatarKind === 'uploaded'
                  ? [
                      {
                        text: 'Voltar às iniciais',
                        onPress: () =>
                          void removerFoto().catch(() => Alert.alert('Precisa de rede')),
                      },
                    ]
                  : []),
                { text: 'Cancelar', style: 'cancel' as const },
              ])
            }
            accessibilityLabel="Trocar foto de perfil"
          >
            {conta.avatarKind === 'uploaded' && conta.avatarLocal ? (
              <Image source={{ uri: conta.avatarLocal }} style={estilos.avatar} />
            ) : (
              <View style={[estilos.avatar, { backgroundColor: conta.accentColor }]}>
                <Text style={estilos.iniciais}>{iniciais(conta.displayName)}</Text>
              </View>
            )}
          </Pressable>
          <Text style={[estilos.nome, { color: tema.texto }]}>{conta.displayName}</Text>
          <Text style={[estilos.detalhe, { color: tema.sutil }]}>
            no Compasso desde {conta.createdAt.toLocaleDateString('pt-BR')}
          </Text>
        </View>
      ) : (
        <Text style={[estilos.detalhe, { color: tema.sutil }]}>
          Nenhum perfil gravado neste aparelho ainda.
        </Text>
      )}

      {temConexao === false ? (
        <FormularioConexao
          aoSalvar={async () => {
            setTemConexao(true);
            await atualizar();
          }}
        />
      ) : null}

      <View style={estilos.bloco}>
        <Text style={[estilos.subtitulo, { color: tema.texto }]}>Progresso</Text>
        {progresso.temLancamentos ? (
          <>
            <Radar medidas={progresso.radar} />
            <FaixasDeNivel medidas={progresso.radar} />
          </>
        ) : (
          <Text style={[estilos.detalhe, { color: tema.sutil }]}>
            Nenhum ponto ainda. Dê esforço a uma tarefa e conclua — o radar começa a mostrar onde o
            seu esforço está indo.
          </Text>
        )}
      </View>

      {progresso.temLancamentos || resgates.length ? (
        <View style={estilos.bloco}>
          <Text style={[estilos.subtitulo, { color: tema.texto }]}>Histórico</Text>
          <HistoricoXp gatilho={progresso} />
          {resgates.map((r) => (
            <Text key={r.id} style={{ color: tema.texto }}>
              {r.redeemedAt.toLocaleDateString('pt-BR')} · resgate de {r.pricePaid} moedas
            </Text>
          ))}
        </View>
      ) : null}

      <View style={estilos.bloco}>
        <Text style={[estilos.subtitulo, { color: tema.texto }]}>Lembretes</Text>
        {permissao === 'concedida' ? (
          <Text style={[estilos.detalhe, { color: tema.sutil }]}>
            Ativados. Disparam neste aparelho, mesmo sem rede.
          </Text>
        ) : permissao === 'negada' ? (
          <Text style={[estilos.detalhe, { color: tema.perigo }]}>
            Notificações bloqueadas: os lembretes NÃO vão disparar. Libere nas configurações do
            sistema.
          </Text>
        ) : (
          <Button
            title="Ativar lembretes"
            onPress={async () => setPermissao(await pedirPermissao())}
          />
        )}
        {Platform.OS === 'android' ? (
          <>
            <Text style={[estilos.detalhe, { color: tema.sutil }]}>
              Se um lembrete chegar atrasado, confira em Configurações → Apps → Compasso → Alarmes e
              lembretes. Sem essa permissão o Android adia os disparos.
            </Text>
            <Button title="Abrir Alarmes e lembretes" onPress={abrirAjusteDeAlarmeExato} />
          </>
        ) : null}
        <Link href="/notificacoes" style={[estilos.link, { color: tema.destaque }]}>
          Ver lembretes agendados
        </Link>
      </View>

      <View style={estilos.bloco}>
        <Text style={[estilos.subtitulo, { color: tema.texto }]}>Configurações</Text>
        <Link href="/configuracoes" style={[estilos.link, { color: tema.destaque }]}>
          Nome, lembrete padrão, régua, lixeira, importar, sair
        </Link>
        {temConexao ? (
          <>
            <Button title="Atualizar do servidor" onPress={atualizar} />
            {estado ? <Text style={[estilos.detalhe, { color: tema.sutil }]}>{estado}</Text> : null}
            <Text style={[estilos.detalhe, { color: tema.sutil }]}>
              última sincronização: {ultimaSync}
            </Text>
          </>
        ) : null}
        {/* Prova de consumo do packages/core pelo Metro (issue #8). */}
        <Text style={[estilos.detalhe, { color: tema.sutil }]}>
          Escala de esforço (do core): {ESFORCOS.join(' · ')}
        </Text>
        <Link href="/diagnostico" style={[estilos.link, { color: tema.destaque }]}>
          Diagnóstico de fuso e IDs
        </Link>
      </View>
    </ScrollView>
  );
}

function FormularioConexao({ aoSalvar }: { aoSalvar: () => Promise<void> }) {
  const tema = useTema();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  return (
    <View style={estilos.bloco}>
      <Text style={[estilos.subtitulo, { color: tema.texto }]}>Conectar ao servidor</Text>
      <TextInput
        style={[estilos.campo, { color: tema.texto, borderColor: tema.borda }]}
        placeholder="https://compasso.seu-dominio"
        placeholderTextColor={tema.sutil}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={url}
        onChangeText={setUrl}
      />
      <TextInput
        style={[estilos.campo, { color: tema.texto, borderColor: tema.borda }]}
        placeholder="token"
        placeholderTextColor={tema.sutil}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={token}
        onChangeText={setToken}
      />
      <Button
        title="Salvar"
        disabled={!url || !token}
        onPress={async () => {
          await salvarConexao({ url, token });
          await aoSalvar();
        }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: 24, gap: 24 },
  cabecalho: { alignItems: 'center', gap: 8 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iniciais: { color: 'white', fontSize: 32, fontWeight: '600' },
  nome: { fontSize: 22, fontWeight: '600' },
  subtitulo: { fontSize: 16, fontWeight: '600' },
  detalhe: { textAlign: 'center' },
  bloco: { gap: 12 },
  campo: { borderWidth: 1, borderRadius: 6, padding: 10 },
  link: { textAlign: 'center', padding: 8 },
});
