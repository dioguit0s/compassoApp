import {
  estadoDaRecompensa,
  FUSO_PADRAO,
  formatarDiaCurto,
  novoId,
  proximaSegunda,
  diaDe,
  type EstadoDaRecompensa,
} from '@compasso/core';
import type { RecompensaLocal } from '@compasso/core/local';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useProgresso } from '../../src/hooks';
import { chamarApi, ErroHttp, lerConexao } from '../../src/servidor';
import { repositorio, sincronizarAgora } from '../../src/sync';
import { useTema } from '../../src/tema';
import { Botao } from '../../src/ui/Campos';
import { moedas } from '../../src/texto';

const fmt = (d: string) => formatarDiaCurto(d, 0);

function explicar(e: EstadoDaRecompensa): string {
  switch (e.tipo) {
    case 'disponivel':
      return 'disponível';
    case 'carencia':
      return `em carência: vale a partir de ${fmt(e.disponivelEm)} (segunda)`;
    case 'cooldown':
      return `resgatada há pouco: de novo em ${fmt(e.disponivelEm)}`;
    case 'sem-saldo':
      return `faltam ${moedas(e.faltam)}`;
    case 'arquivada':
      return 'arquivada';
  }
}

/**
 * Aba Recompensas (especificação §7, issue #80): saldo no topo, lista com preço vigente, preço
 * pendente, cooldown e o motivo quando o resgate não está disponível. O resgate exige rede: quem
 * julga carência, saldo e cooldown é o servidor, pelo relógio dele (ADR-0007).
 */
export default function Recompensas() {
  const tema = useTema();
  const router = useRouter();
  const { saldo } = useProgresso();
  const q = repositorio.consultasDaEconomia();
  const { data: recompensas } = useLiveQuery(q.recompensas);
  const { data: resgates } = useLiveQuery(q.resgates);
  const [atualizando, setAtualizando] = useState(false);
  const [resgatando, setResgatando] = useState<string | null>(null);
  const agora = new Date();

  async function resgatar(r: RecompensaLocal, preco: number) {
    const conexao = await lerConexao();
    if (!conexao) {
      Alert.alert('Sem servidor', 'Configure o servidor na aba Perfil.');
      return;
    }
    setResgatando(r.id);
    try {
      await sincronizarAgora(); // o servidor precisa da versão atual da recompensa e das conclusões
      await chamarApi(conexao, `/rewards/${r.id}/redeem`, {
        method: 'POST',
        headers: { 'idempotency-key': novoId() },
      });
      await sincronizarAgora();
      Alert.alert('Resgatado', `${r.name} por ${moedas(preco)}. Aproveite.`);
    } catch (e) {
      Alert.alert(
        'Não foi possível resgatar',
        e instanceof ErroHttp && e.status === 409
          ? 'O servidor recusou (carência, cooldown ou saldo). Puxe para atualizar e veja o motivo.'
          : 'Resgatar precisa de rede. Tente de novo quando estiver online.',
      );
    } finally {
      setResgatando(null);
    }
  }

  const ativas = recompensas.filter((r) => r.active);
  const arquivadas = recompensas.filter((r) => !r.active);
  return (
    <FlatList
      style={{ backgroundColor: tema.fundo }}
      contentContainerStyle={estilos.tela}
      data={[...ativas, ...arquivadas]}
      keyExtractor={(r) => r.id}
      refreshControl={
        <RefreshControl
          refreshing={atualizando}
          onRefresh={async () => {
            setAtualizando(true);
            await sincronizarAgora();
            setAtualizando(false);
          }}
        />
      }
      ListHeaderComponent={
        <View style={estilos.bloco}>
          <Text style={[estilos.saldo, { color: saldo < 0 ? tema.perigo : tema.texto }]}>
            {moedas(saldo)}
          </Text>
          {saldo < 0 ? (
            <Text style={{ color: tema.sutil }}>
              Saldo negativo por uma conclusão desfeita: nenhum resgate até voltar a zero.
            </Text>
          ) : null}
          <Botao rotulo="+ Nova recompensa" aoTocar={() => router.push('/recompensa')} />
        </View>
      }
      ListEmptyComponent={
        <Text style={{ color: tema.sutil, textAlign: 'center', padding: 24 }}>
          Cadastre recompensas reais — algo que você quer e vai comprar com o esforço feito.
        </Text>
      }
      renderItem={({ item: r }) => {
        const estado = estadoDaRecompensa(r, saldo, repositorio.ultimoResgate(r.id), agora);
        const preco = 'preco' in estado ? estado.preco : r.price;
        const hoje = diaDe(agora);
        const pendente = r.pendingPrice !== null && r.pendingFrom !== null && r.pendingFrom > hoje;
        return (
          <Pressable
            onPress={() => router.push({ pathname: '/recompensa', params: { id: r.id } })}
            style={[
              estilos.cartao,
              { backgroundColor: tema.superficie, opacity: r.active ? 1 : 0.5 },
            ]}
          >
            <View style={estilos.linha}>
              <Text style={[estilos.nome, { color: tema.texto }]}>{r.name}</Text>
              <Text style={[estilos.preco, { color: tema.texto }]}>{preco}</Text>
            </View>
            {pendente ? (
              <Text style={{ color: tema.hoje }}>
                passa a custar {r.pendingPrice} em {fmt(r.pendingFrom!)}
              </Text>
            ) : null}
            <Text style={{ color: tema.sutil }}>
              {r.cooldownDays > 0 ? `cooldown de ${r.cooldownDays} dias · ` : ''}
              {explicar(estado)}
            </Text>
            {r.active ? (
              <Botao
                rotulo={resgatando === r.id ? 'Resgatando…' : 'Resgatar'}
                desativado={estado.tipo !== 'disponivel' || resgatando !== null}
                aoTocar={() =>
                  estado.tipo === 'disponivel' &&
                  Alert.alert(`Resgatar ${r.name}?`, `${moedas(estado.preco)}.`, [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Resgatar', onPress: () => void resgatar(r, estado.preco) },
                  ])
                }
              />
            ) : null}
          </Pressable>
        );
      }}
      ListFooterComponent={
        <View style={estilos.bloco}>
          <Text style={[estilos.subtitulo, { color: tema.texto }]}>Histórico de resgates</Text>
          {resgates.length === 0 ? (
            <Text style={{ color: tema.sutil }}>Nenhum resgate ainda.</Text>
          ) : (
            resgates.map((h) => {
              const nome =
                recompensas.find((r) => r.id === h.rewardId)?.name ?? 'recompensa removida';
              return (
                <Text key={h.id} style={{ color: tema.texto }}>
                  {h.redeemedAt.toLocaleDateString('pt-BR', { timeZone: FUSO_PADRAO })} · {nome} ·{' '}
                  {moedas(h.pricePaid)}
                </Text>
              );
            })
          )}
          <Text style={{ color: tema.sutil, fontSize: 12 }}>
            Preço pago na época. Preços novos e recompensas novas valem a partir da segunda-feira
            seguinte ({fmt(proximaSegunda(diaDe(agora)))}).
          </Text>
        </View>
      }
    />
  );
}

const estilos = StyleSheet.create({
  tela: { padding: 16, gap: 10 },
  bloco: { gap: 8, marginBottom: 8 },
  saldo: { fontSize: 28, fontWeight: '700' },
  subtitulo: { fontSize: 16, fontWeight: '600', marginTop: 12 },
  cartao: { padding: 12, borderRadius: 10, gap: 6 },
  linha: { flexDirection: 'row', justifyContent: 'space-between' },
  nome: { fontSize: 16, fontWeight: '600' },
  preco: { fontSize: 16, fontWeight: '700' },
});
