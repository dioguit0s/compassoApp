import { ESFORCOS, iniciais } from '@compasso/core';
import { metadados, perfil } from '@compasso/core/local';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { db } from '../../src/db';
import { atualizarPerfil } from '../../src/perfil';
import { esquecerConexao, lerConexao, salvarConexao } from '../../src/servidor';
import {
  abrirAjusteDeAlarmeExato,
  estadoDaPermissao,
  pedirPermissao,
  type EstadoPermissao,
} from '../../src/notificacoes';
import { sincronizarAgora } from '../../src/sync';
import { useProgresso } from '../../src/hooks';
import { FaixasDeNivel, Radar } from '../../src/ui/Radar';

export default function Perfil() {
  // A tela lê do SQLite, nunca da resposta da API.
  const { data } = useLiveQuery(db.select().from(perfil));
  const conta = data[0];
  const { data: sync } = useLiveQuery(
    db.select().from(metadados).where(eq(metadados.chave, 'ultimaSync')),
  );
  const ultimaSync = sync[0] ? new Date(Number(sync[0].valor)).toLocaleString('pt-BR') : 'nunca';
  const [temConexao, setTemConexao] = useState<boolean | null>(null);
  const [estado, setEstado] = useState('');

  const [permissao, setPermissao] = useState<EstadoPermissao | null>(null);
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

  return (
    <ScrollView contentContainerStyle={estilos.tela}>
      {conta ? (
        <View style={estilos.cabecalho}>
          <View style={[estilos.avatar, { backgroundColor: conta.accentColor }]}>
            <Text style={estilos.iniciais}>{iniciais(conta.displayName)}</Text>
          </View>
          <Text style={estilos.nome}>{conta.displayName}</Text>
          <Text style={estilos.detalhe}>
            desde {conta.createdAt.toLocaleDateString('pt-BR')} · confirmado pelo servidor em{' '}
            {conta.buscadoEm.toLocaleString('pt-BR')}
          </Text>
        </View>
      ) : (
        <Text style={estilos.detalhe}>Nenhum perfil gravado neste aparelho ainda.</Text>
      )}

      {/* Progresso (§7): radar com as duas medidas e as faixas de nível por atributo. */}
      <View style={estilos.bloco}>
        <Text style={estilos.subtitulo}>Progresso</Text>
        {progresso.temLancamentos ? (
          <>
            <Radar medidas={progresso.radar} />
            <FaixasDeNivel medidas={progresso.radar} />
          </>
        ) : (
          <Text style={estilos.detalhe}>
            Nenhum ponto ainda. Dê esforço a uma tarefa e conclua — o radar começa a mostrar onde o
            seu esforço está indo.
          </Text>
        )}
      </View>

      {temConexao === false ? (
        <FormularioConexao
          aoSalvar={async () => {
            setTemConexao(true);
            await atualizar();
          }}
        />
      ) : null}

      {temConexao ? (
        <View style={estilos.bloco}>
          <Button title="Atualizar do servidor" onPress={atualizar} />
          {estado ? <Text style={estilos.detalhe}>{estado}</Text> : null}
          <Text style={estilos.detalhe}>última sincronização: {ultimaSync}</Text>
          <Button
            title="Esquecer servidor e token"
            color="#8C2F4A"
            onPress={async () => {
              await esquecerConexao();
              setTemConexao(false);
            }}
          />
        </View>
      ) : null}

      <View style={estilos.bloco}>
        <Text style={estilos.subtitulo}>Lembretes</Text>
        {permissao === 'concedida' ? (
          <Text style={estilos.detalhe}>Ativados. Disparam neste aparelho, mesmo sem rede.</Text>
        ) : permissao === 'negada' ? (
          <Text style={[estilos.detalhe, estilos.aviso]}>
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
            <Text style={estilos.detalhe}>
              Se um lembrete chegar atrasado, confira em Configurações → Apps → Compasso → Alarmes e
              lembretes. Sem essa permissão o Android adia os disparos.
            </Text>
            <Button title="Abrir Alarmes e lembretes" onPress={abrirAjusteDeAlarmeExato} />
          </>
        ) : null}
        <Link href="/notificacoes" style={estilos.link}>
          Ver lembretes agendados
        </Link>
      </View>

      <View style={estilos.bloco}>
        <Text style={estilos.subtitulo}>Configurações</Text>
        <Link href="/importar" style={estilos.link}>
          Importar calendário (.ics do Google)
        </Link>
        {/* Prova de consumo do packages/core pelo Metro (issue #8). */}
        <Text style={estilos.detalhe}>Escala de esforço (do core): {ESFORCOS.join(' · ')}</Text>
        <Link href="/diagnostico" style={estilos.link}>
          Diagnóstico de fuso e IDs
        </Link>
      </View>
    </ScrollView>
  );
}

function FormularioConexao({ aoSalvar }: { aoSalvar: () => Promise<void> }) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  return (
    <View style={estilos.bloco}>
      <Text style={estilos.subtitulo}>Conectar ao servidor</Text>
      <TextInput
        style={estilos.campo}
        placeholder="https://compasso.seu-dominio"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={url}
        onChangeText={setUrl}
      />
      <TextInput
        style={estilos.campo}
        placeholder="token"
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
  detalhe: { color: '#666', textAlign: 'center' },
  bloco: { gap: 12 },
  campo: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10 },
  link: { color: '#2F6B8C', textAlign: 'center', padding: 8 },
  aviso: { color: '#8C2F4A' },
});
