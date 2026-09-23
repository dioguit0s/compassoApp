import { NOMES_ATRIBUTOS, type MedidaDoAtributo } from '@compasso/core';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { useTema } from '../tema';

const pontos = (d: number) => (d / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Radar dos cinco atributos (especificação §4.5), com as duas medidas sobrepostas: acumulado
 * total e janela de 30 dias. As duas têm ordens de grandeza diferentes, então cada uma é
 * desenhada na SUA escala (normalizada pelo seu próprio máximo) — a forma compara as áreas entre
 * si; os números ao lado dão o tamanho real. Não existe nível global (§4.4).
 */
export function Radar({
  medidas,
  tamanho = 260,
}: {
  medidas: MedidaDoAtributo[];
  tamanho?: number;
}) {
  const tema = useTema();
  const c = tamanho / 2;
  const r = c - 34;
  const n = medidas.length;
  const angulo = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const ponto = (i: number, f: number) =>
    `${c + r * f * Math.cos(angulo(i))},${c + r * f * Math.sin(angulo(i))}`;
  const maxAcum = Math.max(1, ...medidas.map((m) => Math.max(0, m.acumulado)));
  const max30 = Math.max(1, ...medidas.map((m) => Math.max(0, m.janela30)));
  const poligono = (valor: (m: MedidaDoAtributo) => number, max: number) =>
    medidas.map((m, i) => ponto(i, Math.max(0, valor(m)) / max)).join(' ');

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Svg width={tamanho} height={tamanho} accessibilityLabel="Radar dos atributos">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <Polygon
            key={f}
            points={medidas.map((_, i) => ponto(i, f)).join(' ')}
            fill="none"
            stroke={tema.borda}
            strokeWidth={1}
          />
        ))}
        {medidas.map((m, i) => (
          <Line
            key={m.attribute}
            x1={c}
            y1={c}
            x2={c + r * Math.cos(angulo(i))}
            y2={c + r * Math.sin(angulo(i))}
            stroke={tema.borda}
          />
        ))}
        <Polygon
          points={poligono((m) => m.acumulado, maxAcum)}
          fill={tema.destaque}
          fillOpacity={0.25}
          stroke={tema.destaque}
          strokeWidth={2}
        />
        <Polygon
          points={poligono((m) => m.janela30, max30)}
          fill={tema.hoje}
          fillOpacity={0.2}
          stroke={tema.hoje}
          strokeWidth={2}
          strokeDasharray="5,3"
        />
        <Circle cx={c} cy={c} r={2} fill={tema.sutil} />
        {medidas.map((m, i) => {
          const x = c + (r + 20) * Math.cos(angulo(i));
          const y = c + (r + 20) * Math.sin(angulo(i));
          return (
            <SvgText
              key={m.attribute}
              x={x}
              y={y}
              fill={tema.texto}
              fontSize={12}
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {NOMES_ATRIBUTOS[m.attribute]}
            </SvgText>
          );
        })}
      </Svg>
      <View style={estilos.legenda}>
        <Text style={{ color: tema.destaque }}>━ acumulado</Text>
        <Text style={{ color: tema.hoje }}>┅ últimos 30 dias</Text>
      </View>
      <Text style={{ color: tema.sutil, fontSize: 11, textAlign: 'center' }}>
        Cada medida na sua escala: a forma compara as áreas; os números abaixo dão o tamanho.
      </Text>
    </View>
  );
}

/** Nível e progresso de cada atributo (issue #75). */
export function FaixasDeNivel({ medidas }: { medidas: MedidaDoAtributo[] }) {
  const tema = useTema();
  return (
    <View style={{ gap: 10 }}>
      {medidas.map((m) => (
        <View key={m.attribute} style={{ gap: 4 }}>
          <View style={estilos.linha}>
            <Text style={{ color: tema.texto, fontWeight: '600' }}>
              {NOMES_ATRIBUTOS[m.attribute]} · nível {m.nivel.nivel}
            </Text>
            <Text style={{ color: tema.sutil }}>
              {pontos(m.acumulado)} pts · {pontos(m.janela30)} em 30 dias
            </Text>
          </View>
          <View style={[estilos.trilha, { backgroundColor: tema.borda }]}>
            <View
              style={[
                estilos.progresso,
                {
                  backgroundColor: tema.destaque,
                  width: `${(100 * m.nivel.naFaixa) / m.nivel.custoDaFaixa}%`,
                },
              ]}
            />
          </View>
          <Text style={{ color: tema.sutil, fontSize: 12 }}>
            faltam {pontos(m.nivel.faltam)} para o nível {m.nivel.nivel + 1}
          </Text>
        </View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  legenda: { flexDirection: 'row', gap: 16 },
  linha: { flexDirection: 'row', justifyContent: 'space-between' },
  trilha: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progresso: { height: 6 },
});
