import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { reagendar } from '../notificacoes';
import { perfilLocal } from '../perfil';
import { acessar, lerUrl, salvarConexao, urlDeServidorValida } from '../servidor';
import { apagarDadosLocais } from '../sync';
import { useTema } from '../tema';
import { Botao, Campo, Segmentado } from './Campos';
import { Texto } from './Texto';

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
  const senhaCurta = modo === 'cadastro' && senha !== '' && senha.length < 8;
  const pronto =
    urlOk &&
    email.trim() !== '' &&
    senha !== '' &&
    !senhaCurta &&
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
      <Texto cinzel style={{ fontSize: 20, fontWeight: '700' }}>
        {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
      </Texto>
      <Segmentado
        tom="ouro"
        valor={modo}
        aoMudar={setModo}
        opcoes={[
          { valor: 'entrar', rotulo: 'Já tenho conta' },
          { valor: 'cadastro', rotulo: 'Tenho um convite' },
        ]}
        style={{ borderRadius: 8 }}
      />
      <Campo
        rotulo="Servidor"
        placeholder="https://compasso.seu-dominio"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={url}
        onChangeText={setUrl}
        erro={url && !urlOk ? 'Use o endereço completo: http:// ou https://' : null}
      />
      {modo === 'cadastro' ? (
        <>
          <Campo
            rotulo="Convite"
            cinzel
            placeholder="XXXX-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect={false}
            value={convite}
            onChangeText={setConvite}
            style={{ letterSpacing: 1.1 }}
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
        rotulo="Senha"
        placeholder={modo === 'cadastro' ? 'mínimo 8 caracteres' : undefined}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={modo === 'cadastro' ? 'new-password' : 'current-password'}
        secureTextEntry
        value={senha}
        onChangeText={setSenha}
        erro={senhaCurta ? 'A senha precisa ter pelo menos 8 caracteres.' : null}
      />
      {erro ? <Texto style={{ color: tema.perigo, fontSize: 12.5 }}>{erro}</Texto> : null}
      <Botao
        variante="primario"
        rotulo={enviando ? 'Enviando…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        desativado={!pronto || enviando}
        aoTocar={() => void enviar()}
      />
      <Texto style={{ color: tema.rotulo, fontSize: 11.5, lineHeight: 17, textAlign: 'center' }}>
        Esqueceu a senha? Peça ao administrador do servidor uma senha temporária.
      </Texto>
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 14 },
});
