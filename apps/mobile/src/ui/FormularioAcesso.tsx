import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { reagendar } from '../notificacoes';
import { perfilLocal } from '../perfil';
import { acessar, lerUrl, salvarConexao, urlDeServidorValida } from '../servidor';
import { apagarDadosLocais } from '../sync';
import { useTema } from '../tema';
import { Botao, Campo, Chip } from './Campos';

/**
 * Entrar com e-mail e senha, ou criar conta com um código de convite (F10, ADR-0008). Aparece no
 * Perfil quando não há sessão: primeira abertura, "sair da conta" ou sessão encerrada pelo
 * servidor (a URL já vem preenchida).
 */
export function FormularioAcesso({ aoEntrar }: { aoEntrar: () => Promise<void> }) {
  const tema = useTema();
  const [modo, setModo] = useState<'entrar' | 'cadastro'>('entrar');
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [convite, setConvite] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    void lerUrl().then((u) => u && setUrl((atual) => atual || u));
  }, []);

  const urlOk = urlDeServidorValida(url);
  const pronto =
    urlOk &&
    email.trim() !== '' &&
    senha !== '' &&
    (modo === 'entrar' || (nome.trim() !== '' && convite.trim() !== ''));

  async function enviar() {
    setEnviando(true);
    setErro('');
    const r =
      modo === 'entrar'
        ? await acessar(url, '/auth/entrar', { email, senha })
        : await acessar(url, '/auth/cadastro', { convite, nome, email, senha });
    if (!r.ok) {
      setEnviando(false);
      setErro(r.erro);
      return;
    }
    // Outra conta neste aparelho: os dados locais são da anterior e não podem subir para esta.
    // Mesma conta (sessão encerrada): os dados ficam e o que estava pendente sobe agora.
    const local = perfilLocal();
    if (local && local.id !== r.usuario.id) {
      apagarDadosLocais();
      await reagendar();
    }
    await salvarConexao({ url, token: r.token });
    setSenha('');
    setEnviando(false);
    await aoEntrar();
  }

  return (
    <View style={estilos.bloco}>
      <Text style={[estilos.subtitulo, { color: tema.texto }]}>
        {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
      </Text>
      <View style={estilos.chips}>
        <Chip rotulo="Já tenho conta" ativo={modo === 'entrar'} aoTocar={() => setModo('entrar')} />
        <Chip
          rotulo="Tenho um convite"
          ativo={modo === 'cadastro'}
          aoTocar={() => setModo('cadastro')}
        />
      </View>
      <Campo
        rotulo="Endereço do servidor"
        placeholder="https://compasso.seu-dominio"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={url}
        onChangeText={setUrl}
      />
      {url && !urlOk ? (
        <Text style={{ color: tema.perigo }}>Use o endereço completo: http:// ou https://</Text>
      ) : null}
      {modo === 'cadastro' ? (
        <>
          <Campo
            rotulo="Código de convite"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect={false}
            value={convite}
            onChangeText={setConvite}
          />
          <Campo rotulo="Seu nome" autoComplete="name" value={nome} onChangeText={setNome} />
        </>
      ) : null}
      <Campo
        rotulo="E-mail"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Campo
        rotulo={modo === 'cadastro' ? 'Senha (mínimo 8 caracteres)' : 'Senha'}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={modo === 'cadastro' ? 'new-password' : 'current-password'}
        secureTextEntry
        value={senha}
        onChangeText={setSenha}
      />
      {erro ? <Text style={{ color: tema.perigo }}>{erro}</Text> : null}
      <Botao
        rotulo={enviando ? 'Enviando…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        desativado={!pronto || enviando}
        aoTocar={() => void enviar()}
      />
      {modo === 'entrar' ? (
        <Text style={{ color: tema.sutil, fontSize: 12 }}>
          Esqueceu a senha? Peça ao administrador do servidor uma senha temporária.
        </Text>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 12 },
  subtitulo: { fontSize: 16, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
