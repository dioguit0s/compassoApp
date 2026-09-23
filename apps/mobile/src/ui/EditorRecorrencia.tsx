import {
  descreverRegra,
  diaDaSemana,
  diaDe,
  inicioDoDia,
  lerOpcoes,
  montarRRule,
  ordinalNoMes,
  partesDoDia,
  somarMeses,
  type Frequencia,
  type OpcoesRecorrencia,
} from '@compasso/core';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTema } from '../tema';
import { CampoDataHora } from './CampoDataHora';

const FREQS: { rotulo: string; freq: Frequencia | null }[] = [
  { rotulo: 'Não repete', freq: null },
  { rotulo: 'Diária', freq: 'DAILY' },
  { rotulo: 'Semanal', freq: 'WEEKLY' },
  { rotulo: 'Mensal', freq: 'MONTHLY' },
  { rotulo: 'Anual', freq: 'YEARLY' },
];
const LETRAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const UNIDADE: Record<Frequencia, [string, string]> = {
  DAILY: ['dia', 'dias'],
  WEEKLY: ['semana', 'semanas'],
  MONTHLY: ['mês', 'meses'],
  YEARLY: ['ano', 'anos'],
};

/**
 * Editor da regra de recorrência (issue #43). Só gera regras do subconjunto aceito (monta com
 * `montarRRule` do core). Uma regra existente que não cabe no editor simples (ex.: importada do
 * ICS) é mostrada descrita e só pode ser substituída.
 */
export function EditorRecorrencia({
  rrule,
  inicio,
  aoMudar,
}: {
  rrule: string | null;
  inicio: Date;
  aoMudar: (rrule: string | null) => void;
}) {
  const tema = useTema();
  const [personalizada, setPersonalizada] = useState(
    () => rrule !== null && lerOpcoes(rrule, inicio) === null,
  );
  const opcoes: OpcoesRecorrencia | null =
    rrule && !personalizada ? lerOpcoes(rrule, inicio) : null;

  const aplicar = (o: OpcoesRecorrencia | null) => aoMudar(o ? montarRRule(o, inicio) : null);
  const mudar = (parcial: Partial<OpcoesRecorrencia>) =>
    opcoes && aplicar({ ...opcoes, ...parcial });

  if (personalizada && rrule) {
    return (
      <View style={estilos.bloco}>
        <Text style={{ color: tema.texto }}>{descreverRegra(rrule, inicio)}</Text>
        <Pressable
          onPress={() => {
            setPersonalizada(false);
            aplicar(null);
          }}
        >
          <Text style={{ color: tema.destaque }}>Substituir por uma regra simples</Text>
        </Pressable>
      </View>
    );
  }

  const dia = diaDe(inicio);
  const ord = ordinalNoMes(dia);
  return (
    <View style={estilos.bloco}>
      <View style={estilos.chips}>
        {FREQS.map((f) => (
          <Chip
            key={f.rotulo}
            rotulo={f.rotulo}
            ativo={(opcoes?.freq ?? null) === f.freq}
            aoTocar={() =>
              aplicar(
                f.freq
                  ? {
                      freq: f.freq,
                      intervalo: 1,
                      diasDaSemana: f.freq === 'WEEKLY' ? [diaDaSemana(dia)] : [],
                      mensal: 'dia',
                      fim: opcoes?.fim ?? { tipo: 'nunca' },
                    }
                  : null,
              )
            }
          />
        ))}
      </View>

      {opcoes ? (
        <>
          <View style={estilos.linha}>
            <Text style={{ color: tema.sutil }}>A cada</Text>
            <Passo valor={opcoes.intervalo} min={1} aoMudar={(n) => mudar({ intervalo: n })} />
            <Text style={{ color: tema.texto }}>
              {UNIDADE[opcoes.freq][opcoes.intervalo === 1 ? 0 : 1]}
            </Text>
          </View>

          {opcoes.freq === 'WEEKLY' ? (
            <View style={estilos.chips}>
              {LETRAS.map((l, i) => {
                const ativo = opcoes.diasDaSemana.includes(i);
                return (
                  <Chip
                    key={i}
                    rotulo={l}
                    dica={DIAS[i]}
                    ativo={ativo}
                    aoTocar={() => {
                      const dias = ativo
                        ? opcoes.diasDaSemana.filter((d) => d !== i)
                        : [...opcoes.diasDaSemana, i];
                      mudar({ diasDaSemana: dias.length ? dias : [diaDaSemana(dia)] });
                    }}
                  />
                );
              })}
            </View>
          ) : null}

          {opcoes.freq === 'MONTHLY' ? (
            <View style={estilos.chips}>
              <Chip
                rotulo={`no dia ${partesDoDia(dia).dia}`}
                ativo={opcoes.mensal === 'dia'}
                aoTocar={() => mudar({ mensal: 'dia' })}
              />
              <Chip
                rotulo={`na ${ord === -1 ? 'última' : `${ord}ª`} ${DIAS[diaDaSemana(dia)]}`}
                ativo={opcoes.mensal === 'semana'}
                aoTocar={() => mudar({ mensal: 'semana' })}
              />
            </View>
          ) : null}

          <View style={estilos.chips}>
            <Chip
              rotulo="Sem fim"
              ativo={opcoes.fim.tipo === 'nunca'}
              aoTocar={() => mudar({ fim: { tipo: 'nunca' } })}
            />
            <Chip
              rotulo="Até uma data"
              ativo={opcoes.fim.tipo === 'data'}
              aoTocar={() => mudar({ fim: { tipo: 'data', dia: somarMeses(dia, 3) } })}
            />
            <Chip
              rotulo="Após N vezes"
              ativo={opcoes.fim.tipo === 'vezes'}
              aoTocar={() => mudar({ fim: { tipo: 'vezes', n: 10 } })}
            />
          </View>
          {opcoes.fim.tipo === 'data' ? (
            <CampoDataHora
              rotulo="Até"
              somenteData
              valor={inicioDoDia(opcoes.fim.dia)}
              aoMudar={(v) => mudar({ fim: { tipo: 'data', dia: diaDe(v) } })}
            />
          ) : null}
          {opcoes.fim.tipo === 'vezes' ? (
            <View style={estilos.linha}>
              <Passo
                valor={opcoes.fim.n}
                min={1}
                aoMudar={(n) => mudar({ fim: { tipo: 'vezes', n } })}
              />
              <Text style={{ color: tema.texto }}>vezes</Text>
            </View>
          ) : null}
          {rrule ? (
            <Text style={{ color: tema.sutil }}>{descreverRegra(rrule, inicio)}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function Chip(p: { rotulo: string; ativo: boolean; aoTocar: () => void; dica?: string }) {
  const tema = useTema();
  return (
    <Pressable
      onPress={p.aoTocar}
      accessibilityLabel={p.dica ?? p.rotulo}
      accessibilityState={{ selected: p.ativo }}
      style={[
        estilos.chip,
        { borderColor: tema.borda },
        p.ativo && { backgroundColor: tema.destaque, borderColor: tema.destaque },
      ]}
    >
      <Text style={{ color: p.ativo ? tema.superficie : tema.texto }}>{p.rotulo}</Text>
    </Pressable>
  );
}

function Passo(p: { valor: number; min: number; aoMudar: (n: number) => void }) {
  const tema = useTema();
  return (
    <View style={estilos.linha}>
      <Pressable onPress={() => p.aoMudar(Math.max(p.min, p.valor - 1))} style={estilos.passo}>
        <Text style={{ color: tema.destaque, fontSize: 18 }}>−</Text>
      </Pressable>
      <Text style={{ color: tema.texto, minWidth: 24, textAlign: 'center' }}>{p.valor}</Text>
      <Pressable onPress={() => p.aoMudar(p.valor + 1)} style={estilos.passo}>
        <Text style={{ color: tema.destaque, fontSize: 18 }}>+</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passo: { paddingHorizontal: 10, paddingVertical: 2 },
});
