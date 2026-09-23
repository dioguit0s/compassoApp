import {
  diaDe,
  diferencaEmDias,
  horaDe,
  limitesDiaInteiro,
  proximaHoraCheia,
  somarDias,
  type Dia,
} from '@compasso/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { tituloDoDia } from '../src/datasUi';
import { novoCompromisso } from '../src/novoItem';
import { repositorio } from '../src/sync';
import { useTema } from '../src/tema';

const HORA_MS = 3_600_000;

/**
 * Captura rápida (especificação §7): meta de menos de 3 s do toque ao item salvo. Um campo só
 * obrigatório — o título, já com foco e teclado aberto. A hora vem com default (próxima hora
 * cheia de hoje) e ajustes de um toque; o resto vai para o detalhe do item.
 */
export default function Captura() {
  const tema = useTema();
  const router = useRouter();
  const [titulo, setTitulo] = useState('');
  const [inicio, setInicio] = useState(() => proximaHoraCheia(new Date()));
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [erro, setErro] = useState('');

  const salvar = () => {
    const t = titulo.trim();
    if (!t) return;
    try {
      if (diaInteiro) {
        const dia: Dia = diaDe(inicio);
        const { startAt, endAt } = limitesDiaInteiro(dia, dia);
        repositorio.criar({ ...novoCompromisso(t, startAt, endAt), allDay: true });
      } else {
        repositorio.criar(novoCompromisso(t, inicio, new Date(inicio.getTime() + HORA_MS)));
      }
      router.back();
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const mover = (ms: number) => setInicio((i) => new Date(i.getTime() + ms));
  const paraDia = (deslocamento: number) => {
    const hoje = diaDe(new Date());
    const alvo = somarDias(hoje, deslocamento);
    mover(diferencaEmDias(diaDe(inicio), alvo) * 24 * HORA_MS);
  };

  const dia = diaDe(inicio);
  const hoje = diaDe(new Date());
  return (
    <View style={[estilos.tela, { backgroundColor: tema.superficie }]}>
      <TextInput
        autoFocus
        style={[estilos.titulo, { color: tema.texto, borderColor: tema.borda }]}
        placeholder="O que vai acontecer?"
        placeholderTextColor={tema.sutil}
        value={titulo}
        onChangeText={setTitulo}
        returnKeyType="done"
        onSubmitEditing={salvar}
        submitBehavior="submit"
      />
      <Text style={[estilos.quando, { color: tema.texto }]}>
        {dia === hoje ? 'hoje' : dia === somarDias(hoje, 1) ? 'amanhã' : tituloDoDia(dia)}
        {diaInteiro ? ', dia inteiro' : `, ${horaDe(inicio)}`}
      </Text>
      <View style={estilos.chips}>
        <Chip rotulo="Hoje" ativo={dia === hoje} aoTocar={() => paraDia(0)} />
        <Chip rotulo="Amanhã" ativo={dia === somarDias(hoje, 1)} aoTocar={() => paraDia(1)} />
        <Chip rotulo="−1h" aoTocar={() => mover(-HORA_MS)} desativado={diaInteiro} />
        <Chip rotulo="+1h" aoTocar={() => mover(HORA_MS)} desativado={diaInteiro} />
        <Chip rotulo="Dia inteiro" ativo={diaInteiro} aoTocar={() => setDiaInteiro((v) => !v)} />
      </View>
      {erro ? <Text style={{ color: tema.perigo }}>{erro}</Text> : null}
      <Pressable
        onPress={salvar}
        disabled={!titulo.trim()}
        style={[
          estilos.salvar,
          { backgroundColor: tema.destaque, opacity: titulo.trim() ? 1 : 0.4 },
        ]}
      >
        <Text style={{ color: tema.superficie, fontWeight: '600' }}>Salvar</Text>
      </Pressable>
    </View>
  );
}

function Chip(props: {
  rotulo: string;
  aoTocar: () => void;
  ativo?: boolean;
  desativado?: boolean;
}) {
  const tema = useTema();
  return (
    <Pressable
      onPress={props.aoTocar}
      disabled={props.desativado}
      style={[
        estilos.chip,
        { borderColor: tema.borda, opacity: props.desativado ? 0.4 : 1 },
        props.ativo && { backgroundColor: tema.destaque, borderColor: tema.destaque },
      ]}
    >
      <Text style={{ color: props.ativo ? tema.superficie : tema.texto }}>{props.rotulo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, padding: 16, gap: 12 },
  titulo: { fontSize: 20, borderBottomWidth: 1, paddingVertical: 8 },
  quando: { fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  salvar: { alignItems: 'center', padding: 14, borderRadius: 10, marginTop: 8 },
});
