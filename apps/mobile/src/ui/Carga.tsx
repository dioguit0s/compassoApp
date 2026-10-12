import {
  diaPesado,
  fracaoDaCarga,
  rotuloDaCarga,
  type Carga,
  type Dia,
  type LimiarDeCarga,
} from '@compasso/core';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { avisoDeDiaCheio, useLimiarDeCarga } from '../carga';
import { useTema } from '../tema';
import { Ponto } from './Icones';
import { Texto } from './Texto';

/** "esforço 9 · 5 h ocupadas" — a linha do topo da aba Hoje. Dia vazio não mostra nada. */
export function LinhaDeCarga({ carga, limiar }: { carga: Carga; limiar: LimiarDeCarga }) {
  const tema = useTema();
  const texto = rotuloDaCarga(carga);
  if (!texto) return null;
  const pesado = diaPesado(carga, limiar);
  return (
    <View
      style={estilos.linha}
      accessibilityLabel={`Carga de hoje: ${texto}${pesado ? ', dia cheio' : ''}`}
    >
      {pesado ? <Ponto cor={tema.ouroEscuro} tamanho={5} /> : null}
      <Texto style={{ fontSize: 11.5, color: pesado ? tema.ouroEscuro : tema.rotulo }}>
        {texto}
      </Texto>
    </View>
  );
}

/** Barra discreta do cabeçalho da semana: quanto do limiar o dia já usou; cheia no dia pesado. */
export function BarraDeCarga({ carga, limiar }: { carga: Carga; limiar: LimiarDeCarga }) {
  const tema = useTema();
  const pesado = diaPesado(carga, limiar);
  const fracao = fracaoDaCarga(carga, limiar);
  return (
    <View style={[estilos.trilha, { backgroundColor: fracao > 0 ? tema.grade : 'transparent' }]}>
      <View
        style={{
          width: `${Math.round(fracao * 100)}%`,
          height: '100%',
          backgroundColor: pesado ? tema.ouroEscuro : tema.inativo,
        }}
      />
    </View>
  );
}

/**
 * Aviso ao criar ou editar algo num dia que já está cheio (captura e detalhe). Só informa, sem
 * impedir. `exceto` tira da conta o item que está na tela.
 */
export function AvisoDeDiaCheio({ dia, exceto }: { dia: Dia; exceto?: string }) {
  const tema = useTema();
  const limiar = useLimiarDeCarga();
  const texto = useMemo(() => avisoDeDiaCheio(dia, exceto, limiar), [dia, exceto, limiar]);
  if (!texto) return null;
  return (
    <View style={estilos.linha}>
      <Ponto cor={tema.ouroEscuro} tamanho={5} />
      <Texto style={{ fontSize: 11.5, color: tema.ouroEscuro, flexShrink: 1 }}>
        {texto.charAt(0).toLocaleUpperCase('pt-BR')}
        {texto.slice(1)}
      </Texto>
    </View>
  );
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trilha: { width: '62%', height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 2 },
});
