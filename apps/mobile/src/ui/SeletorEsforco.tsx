import {
  ATRIBUTOS,
  ESFORCOS,
  NOMES_ATRIBUTOS,
  REGUA_DE_ESFORCO,
  type Atributo,
  type Esforco,
} from '@compasso/core';
import { StyleSheet, Text, View } from 'react-native';
import { useTema } from '../tema';
import { Chip } from './Campos';

export interface Pontuacao {
  effort: Esforco | null;
  primaryAttribute: Atributo | null;
  secondaryAttribute: Atributo | null;
}

/**
 * Esforço (1, 2, 3, 5, 8) e atributos (issue #68). A régua de referência aparece no momento da
 * estimativa (§4.1). "—" é compromisso puro: sem esforço, não pontua (§4.8). O secundário nunca
 * é igual ao principal. Congelado: mostra o valor e explica, sem oferecer edição (§4.1, §11).
 */
export function SeletorEsforco({
  valor,
  aoMudar,
  congelado = false,
  compacto = false,
}: {
  valor: Pontuacao;
  aoMudar: (v: Pontuacao) => void;
  congelado?: boolean;
  compacto?: boolean;
}) {
  const tema = useTema();
  if (congelado) {
    return (
      <View style={estilos.bloco}>
        <Text style={{ color: tema.texto }}>
          Esforço {valor.effort} ·{' '}
          {valor.primaryAttribute ? NOMES_ATRIBUTOS[valor.primaryAttribute] : ''}
          {valor.secondaryAttribute ? ` + ${NOMES_ATRIBUTOS[valor.secondaryAttribute]}` : ''}
        </Text>
        <Text style={{ color: tema.sutil, fontSize: 12 }}>
          Congelado: o item já entrou no dia, e a estimativa não muda depois de começar.
        </Text>
      </View>
    );
  }
  const regua = valor.effort ? REGUA_DE_ESFORCO[valor.effort] : null;
  return (
    <View style={estilos.bloco}>
      <View style={estilos.chips}>
        <Chip
          rotulo="—"
          dica="compromisso, sem esforço"
          ativo={valor.effort === null}
          aoTocar={() =>
            aoMudar({ effort: null, primaryAttribute: null, secondaryAttribute: null })
          }
        />
        {ESFORCOS.map((e) => (
          <Chip
            key={e}
            rotulo={String(e)}
            dica={`esforço ${e}: ${REGUA_DE_ESFORCO[e].resumo}`}
            ativo={valor.effort === e}
            aoTocar={() =>
              aoMudar({ ...valor, effort: e, primaryAttribute: valor.primaryAttribute ?? 'mente' })
            }
          />
        ))}
      </View>
      {regua ? (
        <Text style={{ color: tema.sutil, fontSize: 12 }}>
          {valor.effort} = {regua.resumo}
          {compacto ? '' : ` — ex.: ${regua.exemplos.join('; ')}`}
        </Text>
      ) : (
        <Text style={{ color: tema.sutil, fontSize: 12 }}>
          Compromisso: aparece no calendário, não pontua.
        </Text>
      )}
      {valor.effort ? (
        <>
          <View style={estilos.chips}>
            {ATRIBUTOS.map((a) => (
              <Chip
                key={a}
                rotulo={NOMES_ATRIBUTOS[a]}
                ativo={valor.primaryAttribute === a}
                aoTocar={() =>
                  aoMudar({
                    ...valor,
                    primaryAttribute: a,
                    secondaryAttribute:
                      valor.secondaryAttribute === a ? null : valor.secondaryAttribute,
                  })
                }
              />
            ))}
          </View>
          {compacto ? null : (
            <>
              <Text style={{ color: tema.sutil, fontSize: 12 }}>
                Secundário (opcional — divide 70/30, não soma)
              </Text>
              <View style={estilos.chips}>
                <Chip
                  rotulo="nenhum"
                  ativo={valor.secondaryAttribute === null}
                  aoTocar={() => aoMudar({ ...valor, secondaryAttribute: null })}
                />
                {ATRIBUTOS.filter((a) => a !== valor.primaryAttribute).map((a) => (
                  <Chip
                    key={a}
                    rotulo={NOMES_ATRIBUTOS[a]}
                    ativo={valor.secondaryAttribute === a}
                    aoTocar={() => aoMudar({ ...valor, secondaryAttribute: a })}
                  />
                ))}
              </View>
            </>
          )}
        </>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
