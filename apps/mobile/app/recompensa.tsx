import { diaDe, formatarDiaCurto, proximaSegunda } from '@compasso/core';
import { ErroDeValidacao } from '@compasso/core/local';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { repositorio } from '../src/sync';
import { useTema } from '../src/tema';
import { Botao, Campo } from '../src/ui/Campos';

/** Criar/editar recompensa (issue #80), avisando da carência de preço até a segunda (§4.6). */
export default function Recompensa() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tema = useTema();
  const router = useRouter();
  const atual = id
    ? repositorio
        .consultasDaEconomia()
        .recompensas.all()
        .find((r) => r.id === id)
    : undefined;
  const [nome, setNome] = useState(atual?.name ?? '');
  const [preco, setPreco] = useState(String(atual?.pendingPrice ?? atual?.price ?? ''));
  const [cooldown, setCooldown] = useState(String(atual?.cooldownDays ?? 0));
  const [erro, setErro] = useState('');
  const segunda = formatarDiaCurto(proximaSegunda(diaDe(new Date())), 0);

  const tentar = (fn: () => void) => {
    try {
      fn();
      router.back();
    } catch (e) {
      setErro(e instanceof ErroDeValidacao ? e.motivos.join('; ') : (e as Error).message);
    }
  };
  const numero = (t: string) => Number.parseInt(t, 10);

  return (
    <ScrollView style={{ backgroundColor: tema.fundo }} contentContainerStyle={estilos.tela}>
      <Stack.Screen options={{ title: atual ? atual.name : 'Nova recompensa' }} />
      <Campo rotulo="Nome" value={nome} onChangeText={setNome} placeholder="Pizza no sábado" />
      <Campo
        rotulo="Preço (moedas)"
        value={preco}
        onChangeText={setPreco}
        keyboardType="number-pad"
      />
      <Campo
        rotulo="Cooldown (dias entre resgates)"
        value={cooldown}
        onChangeText={setCooldown}
        keyboardType="number-pad"
      />
      <Text style={{ color: tema.sutil }}>
        {atual
          ? `Um preço novo — para mais ou para menos — só vale a partir de segunda, ${segunda}. Até lá, vale o atual.`
          : `Uma recompensa nova só pode ser resgatada a partir de segunda, ${segunda}.`}
      </Text>
      {erro ? <Text style={{ color: tema.perigo }}>{erro}</Text> : null}
      <Botao
        rotulo={atual ? 'Salvar' : 'Criar'}
        aoTocar={() =>
          tentar(() => {
            const dados = { name: nome, price: numero(preco), cooldownDays: numero(cooldown) };
            if (Number.isNaN(dados.price) || Number.isNaN(dados.cooldownDays)) {
              throw new ErroDeValidacao(['preço e cooldown são números inteiros']);
            }
            if (atual) {
              const precoMudou = dados.price !== (atual.pendingPrice ?? atual.price);
              repositorio.editarRecompensa(atual.id, {
                name: dados.name,
                cooldownDays: dados.cooldownDays,
                ...(precoMudou ? { price: dados.price } : {}),
              });
            } else repositorio.criarRecompensa(dados);
          })
        }
      />
      {atual ? (
        <Botao
          rotulo={atual.active ? 'Arquivar' : 'Reativar'}
          perigo={atual.active}
          aoTocar={() =>
            tentar(() => repositorio.editarRecompensa(atual.id, { active: !atual.active }))
          }
        />
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({ tela: { padding: 16, gap: 12 } });
