import { nomeDoMes, partesDoDia, somarDias, somarMeses, type Dia } from '@compasso/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mes } from '../../src/calendario/Mes';
import { Semana } from '../../src/calendario/Semana';
import { formatarDiaCurtoIntervalo } from '../../src/calendario/rotulos';
import { useGrade, useHoje } from '../../src/hooks';
import { gravarPreferencia, lerPreferencia } from '../../src/preferencias';
import { useTema } from '../../src/tema';
import { Segmentado } from '../../src/ui/Campos';
import { Seta } from '../../src/ui/Icones';
import { Texto } from '../../src/ui/Texto';

type Visao = 'semana' | 'mes';

/**
 * Uma aba só, alternando semana e mês (especificação §7). A data de referência é mantida na
 * troca: a semana do dia 15 vira o mês que contém o dia 15, e vice-versa.
 */
export default function Calendario() {
  const tema = useTema();
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const hoje = useHoje();
  const grade = useGrade();
  const semestre = grade.semestres.find((s) => s.active);
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
  const nome = nomeDoMes(mes);
  const titulo =
    visao === 'mes'
      ? `${nome.charAt(0).toLocaleUpperCase('pt-BR')}${nome.slice(1)} ${ano}`
      : formatarDiaCurtoIntervalo(referencia);

  return (
    <View style={[estilos.tela, { backgroundColor: tema.fundo }]}>
      <View
        style={[
          estilos.topo,
          { paddingTop: top + 14, backgroundColor: tema.cabecalho, borderBottomColor: tema.borda },
        ]}
      >
        <View style={estilos.linha1}>
          <Texto cinzel style={{ fontSize: 20, fontWeight: '700' }}>
            Calendário
          </Texto>
          {/* Tela Semestre: no cabeçalho do Calendário, não numa quinta aba (especificação §7). */}
          <Pressable
            onPress={() => router.push('/semestre')}
            accessibilityRole="button"
            accessibilityLabel="Semestre e grade de aulas"
            style={[estilos.grade, { borderColor: tema.ouroClaro, backgroundColor: tema.folha }]}
          >
            <Texto cinzel style={{ fontSize: 10, letterSpacing: 0.6, color: tema.moedaTexto }}>
              {semestre ? `GRADE ${semestre.label}` : 'GRADE'}
            </Texto>
            <Seta cor={tema.ouroEscuro} largura={10} />
          </Pressable>
        </View>
        <View style={estilos.linha2}>
          <Caixa rotulo="‹" dica="período anterior" aoTocar={() => andar(-1)} />
          {/* Com fonte grande do sistema o intervalo da semana era cortado ("20/09 – 2…"). */}
          <Texto
            cinzel
            style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '600' }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {titulo}
          </Texto>
          <Caixa rotulo="›" dica="próximo período" aoTocar={() => andar(1)} />
          <Caixa rotulo="HOJE" aoTocar={() => setReferencia(hoje)} />
          <Segmentado
            cinzel
            tom="ouro"
            valor={visao}
            aoMudar={setVisao}
            opcoes={[
              { valor: 'semana', rotulo: 'SEM' },
              { valor: 'mes', rotulo: 'MÊS' },
            ]}
            style={{ borderRadius: 6 }}
          />
        </View>
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

function Caixa({ rotulo, dica, aoTocar }: { rotulo: string; dica?: string; aoTocar: () => void }) {
  const tema = useTema();
  const seta = rotulo.length === 1;
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={dica ?? rotulo}
      hitSlop={4}
      style={[seta ? estilos.caixaSeta : estilos.caixaTexto, { borderColor: tema.borda }]}
    >
      <Texto
        cinzel={!seta}
        style={
          seta
            ? { fontSize: 18, lineHeight: 20, color: tema.moedaTexto }
            : { fontSize: 10, letterSpacing: 1, color: tema.moedaTexto }
        }
      >
        {rotulo}
      </Texto>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  topo: { paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, gap: 10 },
  linha1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grade: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 8,
  },
  linha2: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  caixaSeta: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caixaTexto: { paddingHorizontal: 9, paddingVertical: 6, borderWidth: 1, borderRadius: 6 },
});
