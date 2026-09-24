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
import { Pressable, StyleSheet, View } from 'react-native';
import { useTema } from '../tema';
import { CampoDataHora } from './CampoDataHora';
import { Chip, Rotulo } from './Campos';
import { Texto } from './Texto';

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
 * Editor da regra de recorrência (issue #43), num painel de pergaminho. Só gera regras do
 * subconjunto aceito (monta com `montarRRule` do core). Uma regra existente que não cabe no
 * editor simples (ex.: importada do ICS) é mostrada descrita e só pode ser substituída.
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

  const painel = [estilos.painel, { backgroundColor: tema.painel, borderColor: tema.linha }];

  if (personalizada && rrule) {
    return (
      <View style={painel}>
        <Rotulo>Repetição</Rotulo>
        <Texto style={{ fontSize: 13, fontStyle: 'italic' }}>{descreverRegra(rrule, inicio)}</Texto>
        <Pressable
          onPress={() => {
            setPersonalizada(false);
            aplicar(null);
          }}
          accessibilityRole="button"
        >
          <Texto
            style={{ fontSize: 12.5, color: tema.ouroEscuro, textDecorationLine: 'underline' }}
          >
            Substituir por uma regra simples
          </Texto>
        </Pressable>
      </View>
    );
  }

  const dia = diaDe(inicio);
  const ord = ordinalNoMes(dia);
  return (
    <View style={painel}>
      <Rotulo>Repetição</Rotulo>
      <View style={estilos.chips}>
        {FREQS.map((f) => (
          <Chip
            key={f.rotulo}
            pequeno
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
            <Texto style={{ fontSize: 12, color: tema.texto3 }}>a cada</Texto>
            <Passo valor={opcoes.intervalo} min={1} aoMudar={(n) => mudar({ intervalo: n })} />
            <Texto style={{ fontSize: 12, color: tema.texto3 }}>
              {UNIDADE[opcoes.freq][opcoes.intervalo === 1 ? 0 : 1]}
            </Texto>
          </View>

          {opcoes.freq === 'WEEKLY' ? (
            <View style={estilos.dias}>
              {LETRAS.map((l, i) => {
                const ativo = opcoes.diasDaSemana.includes(i);
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel={DIAS[i]}
                    accessibilityState={{ selected: ativo }}
                    onPress={() => {
                      const dias = ativo
                        ? opcoes.diasDaSemana.filter((d) => d !== i)
                        : [...opcoes.diasDaSemana, i];
                      mudar({ diasDaSemana: dias.length ? dias : [diaDaSemana(dia)] });
                    }}
                    style={[
                      estilos.dia,
                      ativo
                        ? { backgroundColor: tema.ouro, borderColor: tema.ouroEscuro }
                        : { backgroundColor: tema.campo, borderColor: tema.bordaCampo },
                    ]}
                  >
                    <Texto
                      cinzel
                      style={{ fontSize: 11, color: ativo ? tema.sobreOuro : tema.sutil }}
                    >
                      {l}
                    </Texto>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {opcoes.freq === 'MONTHLY' ? (
            <View style={estilos.chips}>
              <Chip
                pequeno
                rotulo={`no dia ${partesDoDia(dia).dia}`}
                ativo={opcoes.mensal === 'dia'}
                aoTocar={() => mudar({ mensal: 'dia' })}
              />
              <Chip
                pequeno
                rotulo={`na ${ord === -1 ? 'última' : `${ord}ª`} ${DIAS[diaDaSemana(dia)]}`}
                ativo={opcoes.mensal === 'semana'}
                aoTocar={() => mudar({ mensal: 'semana' })}
              />
            </View>
          ) : null}

          <View style={estilos.chips}>
            <Chip
              pequeno
              rotulo="Sem fim"
              ativo={opcoes.fim.tipo === 'nunca'}
              aoTocar={() => mudar({ fim: { tipo: 'nunca' } })}
            />
            <Chip
              pequeno
              rotulo="Até data"
              ativo={opcoes.fim.tipo === 'data'}
              aoTocar={() => mudar({ fim: { tipo: 'data', dia: somarMeses(dia, 3) } })}
            />
            <Chip
              pequeno
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
              <Texto style={{ fontSize: 12, color: tema.texto3 }}>vezes</Texto>
            </View>
          ) : null}
          {rrule ? (
            <Texto style={{ fontSize: 12, fontStyle: 'italic' }}>
              {descreverRegra(rrule, inicio)}
            </Texto>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function Passo(p: { valor: number; min: number; aoMudar: (n: number) => void }) {
  const tema = useTema();
  const botao = [estilos.passo, { borderColor: tema.bordaCampo }];
  return (
    <View style={estilos.linha}>
      <Pressable
        onPress={() => p.aoMudar(Math.max(p.min, p.valor - 1))}
        accessibilityLabel="menos"
        style={botao}
      >
        <Texto style={{ color: tema.moedaTexto, fontSize: 15 }}>−</Texto>
      </Pressable>
      <Texto cinzel style={{ fontSize: 14, minWidth: 18, textAlign: 'center' }}>
        {p.valor}
      </Texto>
      <Pressable onPress={() => p.aoMudar(p.valor + 1)} accessibilityLabel="mais" style={botao}>
        <Texto style={{ color: tema.moedaTexto, fontSize: 15 }}>+</Texto>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  painel: { gap: 9, padding: 14, borderWidth: 1, borderRadius: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dias: { flexDirection: 'row', gap: 4 },
  dia: {
    flex: 1,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passo: {
    width: 26,
    height: 26,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
