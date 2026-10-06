import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  buscarNovidades,
  dataDaNovidade,
  aindaVaiChegar,
  tituloDaNovidade,
  type Novidade,
} from '../src/novidades';
import { useTema } from '../src/tema';
import { CabecalhoInterno } from '../src/ui/Cabecalho';
import { Botao } from '../src/ui/Campos';
import { Texto } from '../src/ui/Texto';

/**
 * O que mudou em cada atualização (ADR-0014), a mesma lista da página de download. Precisa de
 * rede: as novidades vivem só no servidor.
 */
export default function Novidades() {
  const tema = useTema();
  const [lista, setLista] = useState<Novidade[] | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const novidades = await buscarNovidades();
      if (novidades === null) setErro('Configure o servidor no Perfil para ver as novidades.');
      setLista(novidades ?? []);
    } catch {
      setErro('Sem resposta do servidor. Confira a rede e tente de novo.');
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <CabecalhoInterno
        voltar="Configurações"
        titulo="Novidades"
        subtitulo="o que mudou em cada atualização"
      />
      <ScrollView contentContainerStyle={estilos.tela}>
        {erro ? (
          <View style={{ gap: 12 }}>
            <Texto style={{ color: tema.texto2 }}>{erro}</Texto>
            <Botao rotulo="Tentar de novo" variante="contorno" aoTocar={() => void carregar()} />
          </View>
        ) : lista === null ? (
          <Texto style={{ color: tema.sutil }}>Carregando…</Texto>
        ) : lista.length === 0 ? (
          <Texto style={{ color: tema.texto2 }}>Nenhuma novidade publicada ainda.</Texto>
        ) : (
          lista.map((n, i) => {
            const pendente = aindaVaiChegar(n);
            return (
              <View
                key={n.id}
                style={[
                  estilos.novidade,
                  i > 0 && { borderTopWidth: 1, borderTopColor: tema.divisoria },
                ]}
              >
                <View style={estilos.topo}>
                  <Texto style={{ fontWeight: '600', color: tema.texto }}>
                    {dataDaNovidade(n)}
                  </Texto>
                  <View
                    style={[
                      estilos.etiqueta,
                      n.tipo === 'apk'
                        ? { backgroundColor: tema.ouroFundo, borderColor: tema.ouroClaro }
                        : { backgroundColor: tema.campo, borderColor: tema.borda },
                    ]}
                  >
                    <Texto
                      cinzel
                      style={[
                        estilos.textoEtiqueta,
                        { color: n.tipo === 'apk' ? tema.ouroEscuro : tema.rotulo },
                      ]}
                    >
                      {tituloDaNovidade(n).toUpperCase()}
                    </Texto>
                  </View>
                </View>
                {n.itens.map((item) => (
                  <Texto key={item} style={[estilos.item, { color: tema.texto2 }]}>
                    • {item}
                  </Texto>
                ))}
                {pendente ? (
                  <Texto style={[estilos.pendente, { color: tema.apagado }]}>
                    {n.tipo === 'apk'
                      ? 'Ainda não instalada neste aparelho.'
                      : 'Ainda não chegou aqui: entra numa das próximas aberturas.'}
                  </Texto>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  novidade: { paddingVertical: 14, gap: 6 },
  topo: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  etiqueta: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  textoEtiqueta: { fontSize: 9.5, letterSpacing: 1.1, fontWeight: '600' },
  item: { fontSize: 14, lineHeight: 20 },
  pendente: { fontSize: 12, fontStyle: 'italic' },
});
