import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { dataHoraCurta } from '../src/datasUi';
import {
  gerarTokenDeServico,
  lerConexao,
  listarTokensDeServico,
  revogarTokenDeServico,
  type TokenDeServico,
} from '../src/servidor';
import { useTema } from '../src/tema';
import { CabecalhoInterno } from '../src/ui/Cabecalho';
import { Botao, Campo, Rotulo, Segmentado } from '../src/ui/Campos';
import { useAlerta } from '../src/ui/Dialogo';
import { Texto } from '../src/ui/Texto';

type Acesso = 'escrita' | 'leitura';

/**
 * Tokens de serviço da Luna, assistente de voz (ADR-0012). Precisa de rede: o token vive só no
 * servidor, e o segredo aparece uma vez, logo depois de gerado.
 */
export default function Luna() {
  const tema = useTema();
  const alerta = useAlerta();
  const [tokens, setTokens] = useState<TokenDeServico[] | null>(null);
  const [urlBase, setUrlBase] = useState('');
  const [nome, setNome] = useState('Luna');
  const [acesso, setAcesso] = useState<Acesso>('escrita');
  const [novo, setNovo] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setTokens(await listarTokensDeServico());
      setErro('');
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
    void lerConexao().then((c) => setUrlBase(c ? `${c.url}/api/v1` : ''));
  }, [carregar]);

  const gerar = async () => {
    setOcupado(true);
    try {
      const t = await gerarTokenDeServico(nome.trim(), acesso === 'leitura');
      setNovo(t.token);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const revogar = (t: TokenDeServico) =>
    alerta('Revogar token?', `"${t.label}" deixa de funcionar na hora.`, [
      {
        text: 'Revogar',
        style: 'destructive',
        onPress: async () => {
          try {
            await revogarTokenDeServico(t.id);
            await carregar();
          } catch (e) {
            setErro((e as Error).message);
          }
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <CabecalhoInterno voltar="Configurações" titulo="Luna" />
      <ScrollView contentContainerStyle={estilos.tela} keyboardShouldPersistTaps="handled">
        <Texto style={{ fontSize: 12.5, lineHeight: 19, color: tema.texto2 }}>
          A Luna consulta a agenda, cria eventos e tarefas e conclui tarefas por voz, com um token
          próprio. Ele só alcança a API da Luna, não o resto da conta. Trocar a senha revoga todos.
        </Texto>
        {urlBase ? (
          <View style={estilos.bloco}>
            <Rotulo>Endereço da API</Rotulo>
            <Texto selectable style={{ fontSize: 12.5, color: tema.sutil }}>
              {urlBase}
            </Texto>
          </View>
        ) : null}

        {novo ? (
          <View style={[estilos.novo, { backgroundColor: tema.ouroFundo, borderColor: tema.ouro }]}>
            <Rotulo>Token gerado — copie agora, ele não aparece de novo</Rotulo>
            <Texto selectable style={{ fontSize: 13, fontFamily: 'monospace' }}>
              {novo}
            </Texto>
            <View style={estilos.inline}>
              <Botao
                compacto
                rotulo="Compartilhar"
                aoTocar={() => void Share.share({ message: novo })}
              />
              <Botao compacto variante="contorno" rotulo="Pronto" aoTocar={() => setNovo(null)} />
            </View>
          </View>
        ) : null}

        <View style={estilos.bloco}>
          <Rotulo>Tokens ativos</Rotulo>
          {tokens === null ? (
            <Texto style={{ color: tema.sutil, fontSize: 13 }}>{erro ? '—' : 'Carregando…'}</Texto>
          ) : tokens.length === 0 ? (
            <Texto style={{ color: tema.sutil, fontSize: 13 }}>Nenhum token ativo.</Texto>
          ) : (
            tokens.map((t) => (
              <View key={t.id} style={[estilos.linha, { borderBottomColor: tema.divisoria }]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Texto style={{ fontSize: 14, fontWeight: '600' }}>{t.label}</Texto>
                  <Texto style={{ color: tema.rotulo, fontSize: 11.5 }}>
                    {t.scopes.includes('agenda:write') ? 'leitura e escrita' : 'só leitura'} ·
                    criado {dataHoraCurta(new Date(t.createdAt))}
                  </Texto>
                </View>
                <Botao compacto perigo rotulo="Revogar" aoTocar={() => revogar(t)} />
              </View>
            ))
          )}
        </View>

        <View style={estilos.bloco}>
          <Rotulo>Gerar token</Rotulo>
          <Campo
            value={nome}
            onChangeText={setNome}
            maxLength={100}
            accessibilityLabel="Nome do token"
          />
          <Segmentado<Acesso>
            opcoes={[
              { valor: 'escrita', rotulo: 'Leitura e escrita' },
              { valor: 'leitura', rotulo: 'Só leitura' },
            ]}
            valor={acesso}
            aoMudar={setAcesso}
          />
          <Botao
            rotulo={ocupado ? 'Gerando…' : 'Gerar token'}
            desativado={ocupado || !nome.trim()}
            aoTocar={() => void gerar()}
          />
        </View>
        {erro ? <Texto style={{ color: tema.perigo, fontSize: 12.5 }}>{erro}</Texto> : null}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 20 },
  bloco: { gap: 8 },
  inline: { flexDirection: 'row', gap: 8 },
  novo: { gap: 8, borderWidth: 1, borderRadius: 8, padding: 12 },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
});
