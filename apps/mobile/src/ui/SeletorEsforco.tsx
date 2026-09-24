import {
  ATRIBUTOS,
  ESFORCOS,
  NOMES_ATRIBUTOS,
  REGUA_DE_ESFORCO,
  type Atributo,
  type Esforco,
} from '@compasso/core';
import { Pressable, StyleSheet, View } from 'react-native';
import { COR_DO_ATRIBUTO, useTema } from '../tema';
import { Rotulo } from './Campos';
import { Escudo } from './Icones';
import { Texto } from './Texto';

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
        {compacto ? null : <Rotulo>Esforço</Rotulo>}
        <View style={estilos.congelado}>
          <Texto cinzel style={{ fontSize: 26, fontWeight: '700', color: tema.ouro }}>
            {valor.effort}
          </Texto>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={estilos.atributosCongelados}>
              {[valor.primaryAttribute, valor.secondaryAttribute].map((a, i) =>
                a ? (
                  <View key={a} style={estilos.atributoCongelado}>
                    {i === 1 ? <Texto style={{ color: tema.apagado }}>+</Texto> : null}
                    <Escudo atributo={a} />
                    <Texto
                      cinzel
                      style={{ fontSize: 10, letterSpacing: 1, color: COR_DO_ATRIBUTO[a] }}
                    >
                      {NOMES_ATRIBUTOS[a].toLocaleUpperCase('pt-BR')}
                    </Texto>
                  </View>
                ) : null,
              )}
            </View>
            <Texto style={{ color: tema.rotulo, fontSize: 11.5, lineHeight: 16 }}>
              Congelado: o item já entrou no dia, e a estimativa não muda depois de começar.
            </Texto>
          </View>
        </View>
      </View>
    );
  }
  const regua = valor.effort ? REGUA_DE_ESFORCO[valor.effort] : null;
  const escolherPrincipal = (a: Atributo) =>
    aoMudar({
      ...valor,
      primaryAttribute: a,
      secondaryAttribute: valor.secondaryAttribute === a ? null : valor.secondaryAttribute,
    });

  const grade = (
    <View style={[estilos.grade, compacto && { flex: 1, gap: 5 }]}>
      {([null, ...ESFORCOS] as const).map((e) => {
        const ativo = valor.effort === e;
        return (
          <Pressable
            key={String(e)}
            onPress={() =>
              e === null
                ? aoMudar({ effort: null, primaryAttribute: null, secondaryAttribute: null })
                : aoMudar({
                    ...valor,
                    effort: e,
                    primaryAttribute: valor.primaryAttribute ?? 'mente',
                  })
            }
            accessibilityRole="button"
            accessibilityLabel={
              e === null
                ? 'compromisso, sem esforço'
                : `esforço ${e}: ${REGUA_DE_ESFORCO[e].resumo}`
            }
            accessibilityState={{ selected: ativo }}
            style={[
              estilos.valor,
              compacto ? { paddingVertical: 7, borderRadius: 6 } : { backgroundColor: tema.campo },
              { borderColor: tema.bordaCampo },
              ativo && { backgroundColor: tema.ouro, borderColor: tema.ouroEscuro },
            ]}
          >
            <Texto
              cinzel
              style={{
                fontSize: compacto ? 12 : 13,
                color: ativo ? tema.sobreOuro : tema.sutil,
                fontWeight: ativo ? '700' : '400',
              }}
            >
              {e === null ? '—' : String(e)}
            </Texto>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={[estilos.bloco, compacto && { gap: 14 }]}>
      {compacto ? (
        <View style={estilos.linhaCompacta}>
          <View style={{ width: 58 }}>
            <Rotulo>Esforço</Rotulo>
          </View>
          {grade}
        </View>
      ) : (
        <>
          <Rotulo>Esforço</Rotulo>
          {grade}
        </>
      )}
      <Texto
        style={[
          estilos.regua,
          { color: tema.texto3, borderLeftColor: tema.ouroClaro },
          compacto && { marginTop: -6 },
        ]}
      >
        {regua
          ? `${regua.resumo}${compacto ? '' : ` — ${regua.exemplos.join(', ')}`}`
          : 'compromisso: aparece no calendário, não pontua'}
      </Texto>
      {valor.effort ? (
        <>
          {compacto ? null : <RotuloMenor>Principal</RotuloMenor>}
          <View style={estilos.atributos}>
            {ATRIBUTOS.map((a) => {
              const ativo = valor.primaryAttribute === a;
              const cor = COR_DO_ATRIBUTO[a];
              return (
                <Pressable
                  key={a}
                  onPress={() => escolherPrincipal(a)}
                  accessibilityRole="button"
                  accessibilityLabel={`atributo principal ${NOMES_ATRIBUTOS[a]}`}
                  accessibilityState={{ selected: ativo }}
                  style={[
                    estilos.atributo,
                    { borderColor: tema.bordaCampo },
                    ativo && { borderColor: cor, borderWidth: 1.6, backgroundColor: `${cor}1F` },
                  ]}
                >
                  <Escudo atributo={a} tamanho={9} />
                  <Texto
                    cinzel
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{
                      fontSize: 8.5,
                      color: ativo ? cor : tema.sutil,
                      fontWeight: ativo ? '700' : '400',
                    }}
                  >
                    {NOMES_ATRIBUTOS[a].toLocaleUpperCase('pt-BR')}
                  </Texto>
                </Pressable>
              );
            })}
          </View>
          {compacto ? null : (
            <>
              <RotuloMenor>Secundário · opcional</RotuloMenor>
              <View style={estilos.atributos}>
                {([null, ...ATRIBUTOS.filter((a) => a !== valor.primaryAttribute)] as const).map(
                  (a) => {
                    const ativo = valor.secondaryAttribute === a;
                    return (
                      <Pressable
                        key={String(a)}
                        onPress={() => aoMudar({ ...valor, secondaryAttribute: a })}
                        accessibilityRole="button"
                        accessibilityLabel={
                          a
                            ? `atributo secundário ${NOMES_ATRIBUTOS[a]} (divide 70/30, não soma)`
                            : 'sem atributo secundário'
                        }
                        accessibilityState={{ selected: ativo }}
                        style={[
                          estilos.atributo,
                          { borderColor: tema.bordaCampo },
                          ativo && {
                            borderColor: tema.sutil,
                            borderWidth: 1.6,
                            backgroundColor: tema.painel,
                          },
                        ]}
                      >
                        {a ? (
                          <Texto
                            cinzel
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            style={{
                              fontSize: 8.5,
                              color: ativo ? tema.texto : tema.sutil,
                              fontWeight: ativo ? '700' : '400',
                            }}
                          >
                            {NOMES_ATRIBUTOS[a].toLocaleUpperCase('pt-BR')}
                          </Texto>
                        ) : (
                          <Texto
                            style={{
                              fontSize: 10.5,
                              color: ativo ? tema.texto : tema.sutil,
                              fontWeight: ativo ? '600' : '400',
                            }}
                          >
                            Nenhum
                          </Texto>
                        )}
                      </Pressable>
                    );
                  },
                )}
              </View>
            </>
          )}
        </>
      ) : null}
    </View>
  );
}

function RotuloMenor({ children }: { children: string }) {
  const tema = useTema();
  return (
    <Texto cinzel style={{ fontSize: 9, letterSpacing: 1.8, color: tema.apagado, marginTop: 4 }}>
      {children.toLocaleUpperCase('pt-BR')}
    </Texto>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 9 },
  linhaCompacta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grade: { flexDirection: 'row', gap: 6 },
  valor: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 7,
  },
  regua: {
    fontSize: 11.5,
    fontStyle: 'italic',
    paddingLeft: 9,
    borderLeftWidth: 2,
  },
  atributos: { flexDirection: 'row', gap: 5 },
  atributo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderWidth: 1,
    borderRadius: 6,
  },
  congelado: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  atributosCongelados: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  atributoCongelado: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
