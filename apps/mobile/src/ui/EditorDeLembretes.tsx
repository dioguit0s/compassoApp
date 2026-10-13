import {
  MAX_LEMBRETES,
  MAX_MINUTOS_DE_LEMBRETE,
  normalizarLembretes,
  rotuloDoLembrete,
} from '@compasso/core';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTema } from '../tema';
import { Botao, Campo, Chip, Rotulo, Segmentado } from './Campos';
import { Relogio } from './Icones';
import { Texto } from './Texto';

const ATALHOS: { rotulo: string; minutos: number }[] = [
  { rotulo: '10 min', minutos: 10 },
  { rotulo: '30 min', minutos: 30 },
  { rotulo: '1 h', minutos: 60 },
  { rotulo: '1 dia', minutos: 1440 },
];

type Unidade = 'min' | 'h' | 'dias';
const MINUTOS_POR: Record<Unidade, number> = { min: 1, h: 60, dias: 1440 };

/**
 * Lembretes do item (ADR-0018): a lista, com remover, e os atalhos para adicionar — até 5, sem
 * repetição. `aoAdicionar` avisa quem chama que a pessoa acabou de pedir um lembrete: é o momento
 * com contexto para pedir a permissão de notificação.
 */
export function EditorDeLembretes({
  valor,
  aoMudar,
  aoAdicionar,
}: {
  valor: number[];
  aoMudar: (lembretes: number[]) => void;
  aoAdicionar?: () => void;
}) {
  const tema = useTema();
  const [personalizando, setPersonalizando] = useState(false);
  const [quantidade, setQuantidade] = useState('');
  const [unidade, setUnidade] = useState<Unidade>('h');
  const cheio = valor.length >= MAX_LEMBRETES;

  const adicionar = (minutos: number) => {
    aoMudar(normalizarLembretes([...valor, minutos]));
    aoAdicionar?.();
  };
  const n = Number(quantidade);
  const personalizado =
    quantidade.trim() !== '' && Number.isInteger(n) ? n * MINUTOS_POR[unidade] : -1;
  const erro =
    quantidade.trim() === ''
      ? null
      : personalizado < 0
        ? 'Só números inteiros.'
        : personalizado > MAX_MINUTOS_DE_LEMBRETE
          ? 'No máximo um ano antes.'
          : valor.includes(personalizado)
            ? 'Esse lembrete já está na lista.'
            : null;

  return (
    <View style={{ gap: 8 }}>
      <Rotulo>Lembretes</Rotulo>
      {valor.length ? (
        <View>
          {valor.map((minutos) => (
            <View key={minutos} style={[estilos.linha, { borderBottomColor: tema.divisoria }]}>
              <Relogio cor={tema.rotulo} />
              <Texto style={{ fontSize: 13.5, flex: 1 }}>{rotuloDoLembrete(minutos)}</Texto>
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Remover lembrete: ${rotuloDoLembrete(minutos)}`}
                onPress={() => aoMudar(valor.filter((m) => m !== minutos))}
              >
                <Texto style={{ fontSize: 12, color: tema.ouroEscuro }}>remover</Texto>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Texto style={{ fontSize: 12.5, color: tema.rotulo }}>Sem lembrete.</Texto>
      )}
      {cheio ? (
        <Texto style={{ fontSize: 11.5, color: tema.rotulo }}>
          Até {MAX_LEMBRETES} lembretes por item.
        </Texto>
      ) : (
        <View style={estilos.chips}>
          {ATALHOS.filter((a) => !valor.includes(a.minutos)).map((a) => (
            <Chip
              key={a.minutos}
              rotulo={`+ ${a.rotulo}`}
              dica={`Adicionar lembrete: ${rotuloDoLembrete(a.minutos)}`}
              aoTocar={() => adicionar(a.minutos)}
            />
          ))}
          <Chip
            rotulo="Personalizado"
            dica="Adicionar lembrete personalizado"
            ativo={personalizando}
            aoTocar={() => setPersonalizando((v) => !v)}
          />
        </View>
      )}
      {personalizando && !cheio ? (
        <View style={{ gap: 6 }}>
          <View style={estilos.personalizado}>
            <View style={{ width: 72 }}>
              <Campo
                value={quantidade}
                onChangeText={setQuantidade}
                keyboardType="number-pad"
                placeholder="2"
                maxLength={6}
                accessibilityLabel="Quanto tempo antes"
              />
            </View>
            <Segmentado
              style={{ flex: 1 }}
              valor={unidade}
              aoMudar={setUnidade}
              opcoes={[
                { valor: 'min', rotulo: 'min' },
                { valor: 'h', rotulo: 'horas' },
                { valor: 'dias', rotulo: 'dias' },
              ]}
            />
            <Botao
              compacto
              rotulo="Adicionar"
              style={{ paddingVertical: 11 }}
              desativado={personalizado < 0 || erro !== null}
              aoTocar={() => {
                adicionar(personalizado);
                setQuantidade('');
                setPersonalizando(false);
              }}
            />
          </View>
          {erro ? <Texto style={{ fontSize: 11, color: tema.perigo }}>{erro}</Texto> : null}
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  personalizado: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
