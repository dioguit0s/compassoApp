import { nomeDoMes, partesDoDia, somarDias, somarMeses, type Dia } from '@compasso/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Mes } from '../../src/calendario/Mes';
import { Semana } from '../../src/calendario/Semana';
import { formatarDiaCurtoIntervalo } from '../../src/calendario/rotulos';
import { useHoje } from '../../src/hooks';
import { gravarPreferencia, lerPreferencia } from '../../src/preferencias';
import { useTema } from '../../src/tema';

type Visao = 'semana' | 'mes';

/**
 * Uma aba só, alternando semana e mês (especificação §7). A data de referência é mantida na
 * troca: a semana do dia 15 vira o mês que contém o dia 15, e vice-versa.
 */
export default function Calendario() {
  const tema = useTema();
  const router = useRouter();
  const hoje = useHoje();
  const [visao, setVisaoEstado] = useState<Visao>(() =>
    lerPreferencia('calendario.visao') === 'mes' ? 'mes' : 'semana',
  );
  const [referencia, setReferencia] = useState<Dia>(hoje);

  const setVisao = (v: Visao) => {
    setVisaoEstado(v);
    gravarPreferencia('calendario.visao', v);
  };
  const andar = (sentido: 1 | -1) =>
    setReferencia((r) => (visao === 'semana' ? somarDias(r, 7 * sentido) : somarMeses(r, sentido)));

  const { ano, mes } = partesDoDia(referencia);
  const titulo =
    visao === 'mes' ? `${nomeDoMes(mes)} ${ano}` : formatarDiaCurtoIntervalo(referencia);

  return (
    <View style={[estilos.tela, { backgroundColor: tema.fundo }]}>
      <View style={estilos.barra}>
        <Botao rotulo="‹" dica="período anterior" aoTocar={() => andar(-1)} />
        {/* Com fonte grande do sistema o intervalo da semana era cortado ("20/09 – 2…"). */}
        <Text
          style={[estilos.titulo, { color: tema.texto }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {titulo}
        </Text>
        <Botao rotulo="›" dica="próximo período" aoTocar={() => andar(1)} />
        <Botao rotulo="Hoje" aoTocar={() => setReferencia(hoje)} />
        <View style={[estilos.alternancia, { borderColor: tema.borda }]}>
          {(['semana', 'mes'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setVisao(v)}
              style={[estilos.opcao, visao === v && { backgroundColor: tema.destaque }]}
            >
              <Text style={{ color: visao === v ? tema.superficie : tema.texto, fontSize: 13 }}>
                {v === 'semana' ? 'Sem' : 'Mês'}
              </Text>
            </Pressable>
          ))}
        </View>
        {/* Tela Semestre: no cabeçalho do Calendário, não numa quinta aba (especificação §7). */}
        <Botao
          rotulo="Grade"
          dica="Semestre e grade de aulas"
          aoTocar={() => router.push('/semestre')}
        />
      </View>
      {visao === 'semana' ? (
        <Semana referencia={referencia} hoje={hoje} />
      ) : (
        <Mes
          referencia={referencia}
          hoje={hoje}
          aoTocarDia={(d) => {
            setReferencia(d);
            setVisao('semana');
          }}
        />
      )}
    </View>
  );
}

function Botao({ rotulo, dica, aoTocar }: { rotulo: string; dica?: string; aoTocar: () => void }) {
  const tema = useTema();
  return (
    <Pressable onPress={aoTocar} accessibilityLabel={dica ?? rotulo} style={estilos.botao}>
      <Text style={{ color: tema.destaque, fontSize: rotulo.length === 1 ? 22 : 14 }}>
        {rotulo}
      </Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  barra: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  titulo: { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  botao: { paddingHorizontal: 8, paddingVertical: 6 },
  alternancia: { flexDirection: 'row', borderWidth: 1, borderRadius: 6, overflow: 'hidden' },
  opcao: { paddingHorizontal: 8, paddingVertical: 4 },
});
