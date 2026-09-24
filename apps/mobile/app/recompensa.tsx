import { diaDe, formatarDiaCurto, proximaSegunda } from '@compasso/core';
import { ErroDeValidacao } from '@compasso/core/local';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { repositorio } from '../src/sync';
import { useTema } from '../src/tema';
import { CabecalhoModal, Folha } from '../src/ui/Cabecalho';
import { Botao, Campo, Rotulo } from '../src/ui/Campos';
import { Moeda } from '../src/ui/Icones';
import { Entrada, Texto } from '../src/ui/Texto';

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
  const salvar = () =>
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
    });
  const precoMudou = atual !== undefined && numero(preco) !== (atual.pendingPrice ?? atual.price);

  return (
    <Folha>
      <ScrollView contentContainerStyle={estilos.corpo} keyboardShouldPersistTaps="handled">
        <CabecalhoModal
          emFolha
          titulo={atual ? 'Recompensa' : 'Nova recompensa'}
          rotuloSalvar={atual ? 'Salvar' : 'Criar'}
          aoSalvar={salvar}
        />
        <Campo
          rotulo="Nome"
          value={nome}
          onChangeText={setNome}
          placeholder="Pizza no sábado"
          style={{ fontSize: 15 }}
        />
        <View style={estilos.dupla}>
          <View style={estilos.metade}>
            <Rotulo>Preço</Rotulo>
            <View
              style={[
                estilos.preco,
                {
                  backgroundColor: tema.campo,
                  borderColor: precoMudou ? tema.ouro : tema.bordaCampo,
                  borderWidth: precoMudou ? 1.5 : 1,
                },
              ]}
            >
              <Moeda tamanho={14} />
              <Entrada
                cinzel
                value={preco}
                onChangeText={setPreco}
                keyboardType="number-pad"
                accessibilityLabel="Preço em moedas"
                style={{ flex: 1, fontSize: 16, paddingVertical: 10 }}
              />
            </View>
          </View>
          <View style={estilos.metade}>
            <Rotulo>Cooldown</Rotulo>
            <View
              style={[estilos.preco, { backgroundColor: tema.campo, borderColor: tema.bordaCampo }]}
            >
              <Entrada
                value={cooldown}
                onChangeText={setCooldown}
                keyboardType="number-pad"
                accessibilityLabel="Cooldown em dias entre resgates"
                style={{ flex: 1, fontSize: 15, paddingVertical: 10 }}
              />
              <Texto style={{ fontSize: 15, color: tema.sutil }}>dias</Texto>
            </View>
          </View>
        </View>
        <Texto
          style={[estilos.regra, { backgroundColor: tema.painel, borderLeftColor: tema.hoje }]}
        >
          {atual
            ? `Um preço novo — para mais ou para menos — só vale a partir de segunda, ${segunda}. Até lá, continua custando ${atual.price}.`
            : `Uma recompensa nova só pode ser resgatada a partir de segunda, ${segunda}.`}
        </Texto>
        {erro ? <Texto style={{ color: tema.perigo, fontSize: 12.5 }}>{erro}</Texto> : null}
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
    </Folha>
  );
}

const estilos = StyleSheet.create({
  corpo: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 30, gap: 16 },
  dupla: { flexDirection: 'row', gap: 10 },
  metade: { flex: 1, gap: 6 },
  preco: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 8,
    borderWidth: 1,
  },
  regra: {
    fontSize: 12.5,
    lineHeight: 19,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderLeftWidth: 2,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
});
