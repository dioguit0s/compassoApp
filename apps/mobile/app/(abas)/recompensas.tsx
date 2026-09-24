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
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProgresso } from '../../src/hooks';
import { chamarApi, ErroHttp, lerConexao } from '../../src/servidor';
import { repositorio, sincronizarAgora } from '../../src/sync';
import { FOLGA_DO_FAB, useTema } from '../../src/tema';
import { Botao, Secao } from '../../src/ui/Campos';
import { useAlerta } from '../../src/ui/Dialogo';
import { Moeda } from '../../src/ui/Icones';
import { Texto } from '../../src/ui/Texto';
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
  const alerta = useAlerta();
  const { top } = useSafeAreaInsets();
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
      alerta('Sem servidor', 'Configure o servidor na aba Perfil.');
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
      alerta('Resgatado', `${r.name} por ${moedas(preco)}. Aproveite.`);
    } catch (e) {
      alerta(
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
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <View
        style={[
          estilos.topo,
          { paddingTop: top + 16, backgroundColor: tema.cabecalho, borderBottomColor: tema.borda },
        ]}
      >
        <View style={estilos.linha}>
          <Texto cinzel style={{ fontSize: 20, fontWeight: '700' }}>
            Recompensas
          </Texto>
          <Pressable
            onPress={() => router.push('/recompensa')}
            accessibilityRole="button"
            accessibilityLabel="Nova recompensa"
            style={[estilos.nova, { borderColor: tema.ouroClaro }]}
          >
            <Texto cinzel style={{ fontSize: 11, letterSpacing: 1.3, color: tema.ouroEscuro }}>
              + NOVA
            </Texto>
          </Pressable>
        </View>
        {saldo < 0 ? (
          <View
            style={[estilos.saldo, { backgroundColor: tema.perigoFundo, borderColor: tema.perigo }]}
          >
            <View style={[estilos.linhaBase]}>
              <Texto cinzel style={[estilos.valor, { color: tema.perigo }]}>
                −{Math.abs(saldo)}
              </Texto>
              <Texto style={[estilos.moedas, { color: tema.perigo }]}>MOEDAS</Texto>
            </View>
            <Texto style={{ fontSize: 12, lineHeight: 17, color: '#5A2A2A' }}>
              Saldo negativo por uma conclusão desfeita: nenhum resgate até voltar a zero.
            </Texto>
          </View>
        ) : (
          <View
            style={[
              estilos.saldo,
              estilos.saldoPositivo,
              { backgroundColor: tema.folha, borderColor: tema.ouroClaro },
            ]}
            accessibilityLabel={`Saldo: ${moedas(saldo)}`}
          >
            <Moeda tamanho={34} anel />
            <View>
              <Texto cinzel style={[estilos.valor, { color: tema.moedaTexto }]}>
                {saldo}
              </Texto>
              <Texto style={[estilos.moedas, { color: tema.rotulo }]}>MOEDAS</Texto>
            </View>
          </View>
        )}
      </View>
      <FlatList
        contentContainerStyle={estilos.lista}
        data={[...ativas, ...arquivadas]}
        keyExtractor={(r) => r.id}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            colors={[tema.ouro]}
            tintColor={tema.ouro}
            progressBackgroundColor={tema.folha}
            onRefresh={async () => {
              setAtualizando(true);
              await sincronizarAgora();
              setAtualizando(false);
            }}
          />
        }
        ListEmptyComponent={
          <Texto style={{ color: tema.sutil, textAlign: 'center', padding: 24, lineHeight: 20 }}>
            Cadastre recompensas reais — algo que você quer e vai comprar com o esforço feito.
          </Texto>
        }
        renderItem={({ item: r }) => {
          const abrir = () => router.push({ pathname: '/recompensa', params: { id: r.id } });
          if (!r.active) {
            return (
              <Pressable onPress={abrir} style={[estilos.arquivada, { borderColor: tema.linha }]}>
                <Texto style={{ fontSize: 14, color: tema.texto2 }}>{r.name}</Texto>
                <Texto style={{ fontSize: 11, color: tema.rotulo }}>arquivada</Texto>
              </Pressable>
            );
          }
          const estado = estadoDaRecompensa(r, saldo, repositorio.ultimoResgate(r.id), agora);
          const preco = 'preco' in estado ? estado.preco : r.price;
          const hoje = diaDe(agora);
          const pendente =
            r.pendingPrice !== null && r.pendingFrom !== null && r.pendingFrom > hoje;
          // Carência: o cartão fica aceso (vale logo); cooldown e falta de saldo, esmaecidos.
          const apagado = estado.tipo === 'cooldown' || estado.tipo === 'sem-saldo';
          return (
            <Pressable
              onPress={abrir}
              style={[
                estilos.cartao,
                apagado
                  ? { backgroundColor: tema.cartaoApagado, borderColor: tema.linha }
                  : { backgroundColor: tema.cartao, borderColor: tema.bordaCampo },
              ]}
            >
              <View style={[estilos.linha, { alignItems: 'flex-start' }]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Texto
                    style={{
                      fontSize: 15,
                      fontWeight: '600',
                      color: apagado ? tema.texto2 : tema.texto,
                    }}
                  >
                    {r.name}
                  </Texto>
                  <Texto style={{ fontSize: 11, color: tema.rotulo }}>
                    {r.cooldownDays > 0 && estado.tipo === 'disponivel'
                      ? `cooldown de ${r.cooldownDays} dias · `
                      : ''}
                    {explicar(estado)}
                  </Texto>
                </View>
                <View style={estilos.preco}>
                  <Moeda tamanho={14} apagada={apagado} />
                  <Texto
                    cinzel
                    style={{
                      fontSize: 17,
                      fontWeight: '600',
                      color: apagado ? tema.apagado : tema.moedaTexto,
                    }}
                  >
                    {preco}
                  </Texto>
                </View>
              </View>
              {pendente ? (
                <Texto style={[estilos.pendente, { color: tema.hoje, borderLeftColor: tema.hoje }]}>
                  passa a custar {r.pendingPrice} em {fmt(r.pendingFrom!)}
                </Texto>
              ) : null}
              {estado.tipo === 'sem-saldo' ? (
                <View style={[estilos.trilha, { backgroundColor: tema.divisoria }]}>
                  <View
                    style={{
                      width: `${Math.max(0, Math.min(100, (100 * saldo) / Math.max(1, preco)))}%`,
                      height: '100%',
                      backgroundColor: tema.ouroClaro,
                    }}
                  />
                </View>
              ) : (
                <Botao
                  variante="primario"
                  compacto
                  rotulo={resgatando === r.id ? 'Resgatando…' : 'Resgatar'}
                  desativado={estado.tipo !== 'disponivel' || resgatando !== null}
                  aoTocar={() =>
                    estado.tipo === 'disponivel' &&
                    alerta(`Resgatar ${r.name}?`, `${moedas(estado.preco)}.`, [
                      { text: 'Resgatar', onPress: () => void resgatar(r, estado.preco) },
                      { text: 'Cancelar', style: 'cancel' },
                    ])
                  }
                />
              )}
            </Pressable>
          );
        }}
        ListFooterComponent={
          <View style={estilos.historico}>
            <Secao titulo="Resgates" />
            {resgates.length === 0 ? (
              <Texto style={{ color: tema.sutil, fontSize: 12.5 }}>Nenhum resgate ainda.</Texto>
            ) : (
              resgates.map((h) => {
                const nome =
                  recompensas.find((r) => r.id === h.rewardId)?.name ?? 'recompensa removida';
                return (
                  <View key={h.id} style={estilos.linha}>
                    <Texto style={{ fontSize: 12.5, color: tema.texto2, flexShrink: 1 }}>
                      {h.redeemedAt.toLocaleDateString('pt-BR', {
                        timeZone: FUSO_PADRAO,
                        day: '2-digit',
                        month: '2-digit',
                      })}{' '}
                      · {nome}
                    </Texto>
                    <Texto cinzel style={{ fontSize: 12.5, color: tema.texto2 }}>
                      {h.pricePaid}
                    </Texto>
                  </View>
                );
              })
            )}
            <Texto style={{ color: tema.rotulo, fontSize: 11, lineHeight: 16 }}>
              Preço pago na época. Preços novos e recompensas novas valem a partir da segunda-feira
              seguinte ({fmt(proximaSegunda(diaDe(agora)))}).
            </Texto>
          </View>
        }
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  topo: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, gap: 14 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  linhaBase: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  nova: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
  saldo: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  saldoPositivo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  valor: { fontSize: 28, fontWeight: '700', lineHeight: 32 },
  moedas: { fontSize: 11, letterSpacing: 1.3 },
  lista: { padding: 16, paddingBottom: FOLGA_DO_FAB, gap: 10 },
  cartao: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, gap: 10 },
  preco: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pendente: { fontSize: 11, lineHeight: 15, paddingLeft: 9, borderLeftWidth: 2 },
  trilha: { height: 5, borderRadius: 3, overflow: 'hidden' },
  arquivada: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    opacity: 0.5,
  },
  historico: { gap: 8, marginTop: 6 },
});
