import { NOMES_ATRIBUTOS, type Atributo, type MedidaDoAtributo } from '@compasso/core';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Path, Polygon } from 'react-native-svg';
import { COR_DO_ATRIBUTO, useTema } from '../tema';
import { Escudo, EscudoComLetra } from './Icones';
import { Texto } from './Texto';

const pontos = (d: number) => (d / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const LETRA: Record<Atributo, string> = {
  corpo: 'C',
  mente: 'M',
  oficio: 'O',
  casa: 'Ca',
  social: 'S',
};
const ROMANO = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const romano = (n: number) => ROMANO[n] ?? String(n);

/**
 * Radar dos cinco atributos (especificação §4.5), com as duas medidas sobrepostas: acumulado
 * total (sólido, ouro) e janela de 30 dias (tracejado). As duas têm ordens de grandeza
 * diferentes, então cada uma é desenhada na SUA escala (normalizada pelo seu próprio máximo) — a
 * forma compara as áreas entre si; as faixas de nível dão o tamanho real. Não existe nível
 * global (§4.4).
 */
export function Radar({ medidas }: { medidas: MedidaDoAtributo[] }) {
  const tema = useTema();
  const { width } = useWindowDimensions();
  const largura = Math.min(350, width - 40);
  const cx = 140;
  const cy = 130;
  const R = 96;
  const n = medidas.length;
  const pt = (k: number, v: number): [number, number] => {
    const ang = ((-90 + (360 / n) * k) * Math.PI) / 180;
    return [cx + R * v * Math.cos(ang), cy + R * v * Math.sin(ang)];
  };
  const poli = (vs: number[]) =>
    vs
      .map((v, k) =>
        pt(k, v)
          .map((x) => x.toFixed(1))
          .join(','),
      )
      .join(' ');
  const maxAcum = Math.max(1, ...medidas.map((m) => Math.max(0, m.acumulado)));
  const max30 = Math.max(1, ...medidas.map((m) => Math.max(0, m.janela30)));
  const tem30 = medidas.some((m) => m.janela30 > 0);

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Svg
        width={largura}
        height={(largura * 262) / 280}
        viewBox="0 0 280 262"
        accessibilityLabel={`Radar dos atributos: ${medidas.map((m) => `${NOMES_ATRIBUTOS[m.attribute]} ${pontos(m.acumulado)}`).join(', ')}`}
      >
        {[1, 0.75, 0.5, 0.25].map((v, i) => (
          <Polygon
            key={v}
            points={poli(medidas.map(() => v))}
            fill={i === 0 ? '#E4D5B6' : 'none'}
            stroke={tema.borda}
            strokeWidth={0.8}
          />
        ))}
        {medidas.map((m, k) => {
          const [x, y] = pt(k, 1);
          return (
            <Path
              key={m.attribute}
              d={`M${cx} ${cy}L${x.toFixed(1)} ${y.toFixed(1)}`}
              stroke={tema.borda}
              strokeWidth={0.8}
            />
          );
        })}
        <Polygon
          points={poli(medidas.map((m) => Math.max(0, m.acumulado) / maxAcum))}
          fill={tema.ouro}
          fillOpacity={0.16}
          stroke={tema.ouro}
          strokeWidth={2}
        />
        {tem30 ? (
          <Polygon
            points={poli(medidas.map((m) => Math.max(0, m.janela30) / max30))}
            fill="none"
            stroke={tema.hoje}
            strokeWidth={1.6}
            strokeDasharray="5 4"
          />
        ) : null}
        {medidas.map((m, k) => {
          const [x, y] = pt(k, 1.17);
          return (
            <EscudoComLetra
              key={m.attribute}
              x={x - 9}
              y={y - 9}
              cor={COR_DO_ATRIBUTO[m.attribute]}
              letra={LETRA[m.attribute]}
            />
          );
        })}
      </Svg>
      <View style={estilos.legenda}>
        <View style={estilos.chave}>
          <View style={{ width: 18, height: 3, backgroundColor: tema.ouro }} />
          <Texto style={{ fontSize: 10.5, color: tema.sutil }}>acumulado</Texto>
        </View>
        {tem30 ? (
          <View style={estilos.chave}>
            <View
              style={{
                width: 18,
                height: 0,
                borderTopWidth: 2,
                borderStyle: 'dashed',
                borderColor: tema.hoje,
              }}
            />
            <Texto style={{ fontSize: 10.5, color: tema.sutil }}>últimos 30 dias</Texto>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Nível e progresso de cada atributo (issue #75), na cor do atributo. */
export function FaixasDeNivel({ medidas }: { medidas: MedidaDoAtributo[] }) {
  const tema = useTema();
  return (
    <View style={{ gap: 12 }}>
      {medidas.map((m) => {
        const cor = COR_DO_ATRIBUTO[m.attribute];
        return (
          <View
            key={m.attribute}
            style={estilos.faixa}
            accessibilityLabel={`${NOMES_ATRIBUTOS[m.attribute]}, nível ${m.nivel.nivel}, ${pontos(m.acumulado)} pontos, faltam ${pontos(m.nivel.faltam)} para o nível ${m.nivel.nivel + 1}`}
          >
            <Escudo cor={cor} tamanho={15} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={estilos.linha}>
                <Texto cinzel style={{ fontSize: 11, letterSpacing: 0.7 }} numberOfLines={1}>
                  {NOMES_ATRIBUTOS[m.attribute].toLocaleUpperCase('pt-BR')} ·{' '}
                  {romano(m.nivel.nivel)}
                </Texto>
                <Texto style={{ fontSize: 10.5, color: tema.apagado }} numberOfLines={1}>
                  {pontos(m.acumulado)} pts · faltam {pontos(m.nivel.faltam)}
                </Texto>
              </View>
              <View style={[estilos.trilha, { backgroundColor: tema.divisoria }]}>
                <View
                  style={{
                    height: '100%',
                    backgroundColor: cor,
                    width: `${(100 * m.nivel.naFaixa) / m.nivel.custoDaFaixa}%`,
                  }}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  legenda: { flexDirection: 'row', justifyContent: 'center', gap: 18, paddingBottom: 6 },
  chave: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  faixa: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  trilha: { height: 5, borderRadius: 3, overflow: 'hidden' },
});
