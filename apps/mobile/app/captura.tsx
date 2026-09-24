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
import { StyleSheet, View } from 'react-native';
import { tituloDoDia } from '../src/datasUi';
import { novoCompromisso } from '../src/novoItem';
import { perfilLocal } from '../src/perfil';
import { repositorio } from '../src/sync';
import { useTema } from '../src/tema';
import { Folha } from '../src/ui/Cabecalho';
import { Botao, Chip, Segmentado } from '../src/ui/Campos';
import { Relogio } from '../src/ui/Icones';
import { SeletorEsforco, type Pontuacao } from '../src/ui/SeletorEsforco';
import { Entrada, Texto } from '../src/ui/Texto';

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
  // Esforço é opcional aqui: sem ele, compromisso (§4.8). Com ele, pode virar tarefa (prazo).
  const [pontuacao, setPontuacao] = useState<Pontuacao>({
    effort: null,
    primaryAttribute: null,
    secondaryAttribute: null,
  });
  const [tarefa, setTarefa] = useState(false);

  const salvar = () => {
    const t = titulo.trim();
    if (!t) return;
    // Lembrete padrão das configurações (issue #85).
    const lembrete = { reminderMinutesBefore: perfilLocal()?.defaultReminderMinutes ?? null };
    try {
      if (tarefa && pontuacao.effort !== null) {
        // Tarefa: prazo em vez de bloco de tempo; exige esforço (§4.8).
        repositorio.criar({
          ...novoCompromisso(t, inicio, null),
          ...pontuacao,
          ...lembrete,
          kind: 'task',
          startAt: null,
          dueAt: inicio,
        });
      } else if (diaInteiro) {
        const dia: Dia = diaDe(inicio);
        const { startAt, endAt } = limitesDiaInteiro(dia, dia);
        repositorio.criar({
          ...novoCompromisso(t, startAt, endAt),
          ...pontuacao,
          ...lembrete,
          allDay: true,
        });
      } else {
        repositorio.criar({
          ...novoCompromisso(t, inicio, new Date(inicio.getTime() + HORA_MS)),
          ...pontuacao,
          ...lembrete,
        });
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
  const ehTarefa = tarefa && pontuacao.effort !== null;
  const quando = `${dia === hoje ? 'hoje' : dia === somarDias(hoje, 1) ? 'amanhã' : tituloDoDia(dia)}${
    diaInteiro && !ehTarefa ? ', dia inteiro' : `, ${ehTarefa ? 'até ' : ''}${horaDe(inicio)}`
  }`;
  return (
    <Folha>
      <View style={estilos.corpo}>
        <View style={[estilos.titulo, { borderBottomColor: tema.ouro }]}>
          <Entrada
            autoFocus
            cinzel
            style={{ fontSize: 20, paddingVertical: 4 }}
            placeholder="O que vai acontecer?"
            value={titulo}
            onChangeText={setTitulo}
            returnKeyType="done"
            onSubmitEditing={salvar}
            submitBehavior="submit"
          />
        </View>
        <View style={estilos.quando}>
          <Relogio cor={tema.rotulo} />
          <Texto style={{ fontSize: 13, color: tema.texto2 }}>{quando}</Texto>
        </View>
        <View style={estilos.chips}>
          <Chip rotulo="Hoje" ativo={dia === hoje} aoTocar={() => paraDia(0)} />
          <Chip rotulo="Amanhã" ativo={dia === somarDias(hoje, 1)} aoTocar={() => paraDia(1)} />
          <Chip rotulo="−1h" aoTocar={() => mover(-HORA_MS)} desativado={diaInteiro} />
          <Chip rotulo="+1h" aoTocar={() => mover(HORA_MS)} desativado={diaInteiro} />
          <Chip rotulo="Dia inteiro" ativo={diaInteiro} aoTocar={() => setDiaInteiro((v) => !v)} />
        </View>
        <SeletorEsforco valor={pontuacao} aoMudar={setPontuacao} compacto />
        {erro ? <Texto style={{ color: tema.perigo, fontSize: 12.5 }}>{erro}</Texto> : null}
        <View style={estilos.rodape}>
          {pontuacao.effort !== null ? (
            <Segmentado
              style={{ flex: 1 }}
              valor={tarefa ? 'tarefa' : 'evento'}
              aoMudar={(v) => setTarefa(v === 'tarefa')}
              opcoes={[
                { valor: 'evento', rotulo: 'Evento (horário)' },
                { valor: 'tarefa', rotulo: 'Tarefa (prazo)' },
              ]}
            />
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Botao
            variante="primario"
            compacto
            rotulo="Salvar"
            desativado={!titulo.trim()}
            aoTocar={salvar}
            style={{ paddingHorizontal: 18 }}
          />
        </View>
      </View>
    </Folha>
  );
}

const estilos = StyleSheet.create({
  corpo: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, gap: 14 },
  titulo: { borderBottomWidth: 1.5, paddingBottom: 6 },
  quando: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rodape: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
