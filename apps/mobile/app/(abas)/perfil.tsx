import { FUSO_PADRAO, iniciais } from '@compasso/core';
import { metadados, perfil, redemptions, rewards } from '@compasso/core/local';
import { desc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../src/db';
import { useEstadoSync, useProgresso } from '../../src/hooks';
import {
  abrirAjusteDeAlarmeExato,
  estadoDaPermissao,
  pedirPermissao,
  type EstadoPermissao,
} from '../../src/notificacoes';
import { atualizarPerfil, enviarFoto, removerFoto } from '../../src/perfil';
import { lerConexao } from '../../src/servidor';
import { sincronizarAgora } from '../../src/sync';
import { FOLGA_DO_FAB, useTema } from '../../src/tema';
import { Botao, LinhaDeLista, Rotulo, Secao } from '../../src/ui/Campos';
import { useAlerta } from '../../src/ui/Dialogo';
import { FormularioAcesso } from '../../src/ui/FormularioAcesso';
import { HistoricoXp } from '../../src/ui/HistoricoXp';
import { Ponto, Sincronizar } from '../../src/ui/Icones';
import { FaixasDeNivel, Radar } from '../../src/ui/Radar';
import { Texto } from '../../src/ui/Texto';

const diaMes = (d: Date) =>
  d.toLocaleDateString('pt-BR', { timeZone: FUSO_PADRAO, day: '2-digit', month: '2-digit' });

/**
 * Aba Perfil (especificação §7), nesta ordem: cabeçalho (foto ou avatar, nome, desde quando),
 * radar, faixas por atributo, histórico (XP por mês e resgates), lembretes, configurações.
 */
export default function Perfil() {
  const tema = useTema();
  const router = useRouter();
  const alerta = useAlerta();
  const { top } = useSafeAreaInsets();
  // A tela lê do SQLite, nunca da resposta da API.
  const { data } = useLiveQuery(db.select().from(perfil));
  const conta = data[0];
  const { data: sync } = useLiveQuery(
    db.select().from(metadados).where(eq(metadados.chave, 'ultimaSync')),
  );
  const { data: resgates } = useLiveQuery(
    db
      .select({
        id: redemptions.id,
        redeemedAt: redemptions.redeemedAt,
        pricePaid: redemptions.pricePaid,
        nome: rewards.name,
      })
      .from(redemptions)
      .leftJoin(rewards, eq(rewards.id, redemptions.rewardId))
      .orderBy(desc(redemptions.redeemedAt))
      .limit(5),
  );
  const ultimaSync = sync[0]
    ? new Date(Number(sync[0].valor)).toLocaleString('pt-BR', {
        timeZone: FUSO_PADRAO,
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'nunca';
  const [temConexao, setTemConexao] = useState<boolean | null>(null);
  const [permissao, setPermissao] = useState<EstadoPermissao | null>(null);
  const [estado, setEstado] = useState('');
  const progresso = useProgresso();

  const estadoSync = useEstadoSync();

  useEffect(() => {
    void estadoDaPermissao().then(setPermissao);
  }, []);
  // Relê a cada sincronização: um 401 apaga o token, e o formulário de entrar precisa aparecer.
  useEffect(() => {
    void lerConexao().then((c) => setTemConexao(c !== null));
  }, [estadoSync]);

  async function atualizar() {
    setEstado('buscando…');
    const r = await atualizarPerfil();
    await sincronizarAgora();
    setEstado(
      r === 'ok' ? 'atualizado' : r === 'falhou' ? 'sem resposta do servidor' : 'sem conexão',
    );
  }

  async function trocarFoto() {
    const escolha = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (escolha.canceled || !escolha.assets[0]) return;
    const a = escolha.assets[0];
    try {
      await enviarFoto({
        uri: a.uri,
        name: a.fileName ?? 'foto.jpg',
        mimeType: a.mimeType ?? 'image/jpeg',
      });
    } catch (e) {
      alerta('Não foi possível enviar a foto', `Precisa de rede. ${(e as Error).message}`);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: tema.fundo }}
      contentContainerStyle={{ paddingBottom: FOLGA_DO_FAB }}
    >
      <View
        style={[
          estilos.cabecalho,
          { paddingTop: top + 22, backgroundColor: tema.cabecalho, borderBottomColor: tema.borda },
        ]}
      >
        {conta ? (
          <>
            <Pressable
              onPress={() =>
                alerta('Foto de perfil', undefined, [
                  { text: 'Escolher foto', onPress: () => void trocarFoto() },
                  ...(conta.avatarKind === 'uploaded'
                    ? [
                        {
                          text: 'Voltar às iniciais',
                          onPress: () => void removerFoto().catch(() => alerta('Precisa de rede')),
                        },
                      ]
                    : []),
                  { text: 'Cancelar', style: 'cancel' as const },
                ])
              }
              accessibilityLabel="Trocar foto de perfil"
              style={[estilos.anelFora, { borderColor: tema.bordaCampo }]}
            >
              <View style={[estilos.anelDentro, { borderColor: tema.cabecalho }]}>
                {conta.avatarKind === 'uploaded' && conta.avatarLocal ? (
                  <Image
                    source={{ uri: conta.avatarLocal }}
                    style={[estilos.avatar, { borderColor: tema.ouroClaro }]}
                  />
                ) : (
                  <View
                    style={[
                      estilos.avatar,
                      { backgroundColor: conta.accentColor, borderColor: tema.ouroClaro },
                    ]}
                  >
                    <Texto cinzel style={estilos.iniciais}>
                      {iniciais(conta.displayName)}
                    </Texto>
                  </View>
                )}
              </View>
            </Pressable>
            <Texto cinzel style={{ fontSize: 20, fontWeight: '600', textAlign: 'center' }}>
              {conta.displayName}
            </Texto>
            <Texto style={{ fontSize: 11.5, color: tema.rotulo }}>
              no Compasso desde{' '}
              {conta.createdAt.toLocaleDateString('pt-BR', { timeZone: FUSO_PADRAO })}
            </Texto>
          </>
        ) : (
          <>
            <View style={[estilos.semAvatar, { borderColor: '#A08A62' }]}>
              <Svg width={28} height={28} viewBox="0 0 24 24">
                <Circle cx={12} cy={8} r={3.8} fill="none" stroke="#A08A62" strokeWidth={1.4} />
                <Path
                  d="M4.5 20c0-4.2 3.4-6.6 7.5-6.6s7.5 2.4 7.5 6.6"
                  fill="none"
                  stroke="#A08A62"
                  strokeWidth={1.4}
                />
              </Svg>
            </View>
            <Texto style={{ fontSize: 12, color: tema.rotulo }}>
              Nenhum perfil gravado neste aparelho ainda.
            </Texto>
          </>
        )}
      </View>

      {temConexao === false ? (
        <Bloco>
          <FormularioAcesso
            aoEntrar={async () => {
              setTemConexao(true);
              await atualizar();
            }}
          />
        </Bloco>
      ) : null}

      {conta || progresso.temLancamentos ? (
        <>
          <View
            style={[
              estilos.progresso,
              { backgroundColor: tema.faixaClara, borderBottomColor: tema.divisoria },
            ]}
          >
            <Secao titulo="Progresso" />
            {progresso.temLancamentos ? (
              <Radar medidas={progresso.radar} />
            ) : (
              <Texto
                style={{
                  fontSize: 13,
                  lineHeight: 19,
                  color: tema.sutil,
                  textAlign: 'center',
                  paddingVertical: 12,
                }}
              >
                Nenhum ponto ainda. Dê esforço a uma tarefa e conclua — o radar começa a mostrar
                onde o seu esforço está indo.
              </Texto>
            )}
          </View>

          {progresso.temLancamentos ? (
            <Bloco>
              <Secao titulo="Nível por atributo" />
              <FaixasDeNivel medidas={progresso.radar} />
            </Bloco>
          ) : null}

          {progresso.temLancamentos || resgates.length ? (
            <Bloco>
              <Secao titulo="Pontos por mês" />
              <HistoricoXp gatilho={progresso} />
              {resgates.length ? (
                <View style={{ gap: 6, marginTop: 4 }}>
                  <Rotulo>Últimos resgates</Rotulo>
                  {resgates.map((r) => (
                    <View key={r.id} style={estilos.linha}>
                      <Texto style={{ fontSize: 12.5, color: tema.texto2, flexShrink: 1 }}>
                        {diaMes(r.redeemedAt)} · {r.nome ?? 'recompensa removida'}
                      </Texto>
                      <Texto cinzel style={{ fontSize: 12.5, color: tema.texto2 }}>
                        {r.pricePaid}
                      </Texto>
                    </View>
                  ))}
                </View>
              ) : null}
            </Bloco>
          ) : null}
        </>
      ) : null}

      <Bloco>
        <Secao titulo="Lembretes" />
        {permissao === 'concedida' ? (
          <View style={estilos.linha}>
            <View style={estilos.estado}>
              <Ponto cor={tema.ouro} tamanho={8} />
              <Texto style={{ fontSize: 13.5 }}>Lembretes ativados</Texto>
            </View>
            <Link rotulo="Ver agendados" aoTocar={() => router.push('/notificacoes')} />
          </View>
        ) : permissao === 'indisponivel' ? (
          <Texto style={{ fontSize: 12.5, lineHeight: 18, color: tema.sutil }}>
            Indisponíveis no Expo Go. Use o development build para testar lembretes.
          </Texto>
        ) : permissao === 'negada' ? (
          <View style={estilos.estado}>
            <Ponto cor={tema.perigo} tamanho={8} vazado />
            <Texto style={{ fontSize: 12.5, lineHeight: 18, color: tema.perigo, flex: 1 }}>
              Notificações bloqueadas: os lembretes NÃO vão disparar. Libere nas configurações do
              sistema.
            </Texto>
          </View>
        ) : (
          <Botao
            rotulo="Ativar lembretes"
            compacto
            aoTocar={async () => setPermissao(await pedirPermissao())}
          />
        )}
        {/* Só no Android 12 (API 31–32) o usuário pode negar o alarme exato. Do 13 em diante o
            app tem USE_EXACT_ALARM, que não se revoga: a tela abriria com a chave cinza, ligada. */}
        {Platform.OS === 'android' && (Platform.Version === 31 || Platform.Version === 32) ? (
          <>
            <Texto style={{ fontSize: 12, lineHeight: 17, color: tema.sutil }}>
              Se um lembrete chegar atrasado, confira em Configurações → Apps → Compasso → Alarmes e
              lembretes. Sem essa permissão o Android adia os disparos.
            </Texto>
            <Botao
              variante="neutro"
              compacto
              rotulo="Abrir Alarmes e lembretes"
              aoTocar={abrirAjusteDeAlarmeExato}
            />
          </>
        ) : null}
      </Bloco>

      <View style={estilos.fim}>
        <LinhaDeLista
          rotulo="Configurações"
          dica="nome · lembrete · régua · lixeira"
          seta={false}
          ultima={!temConexao}
          aoTocar={() => router.push('/configuracoes')}
        />
        {temConexao ? (
          <Pressable
            onPress={() => void atualizar()}
            accessibilityRole="button"
            accessibilityLabel="Atualizar do servidor"
            style={estilos.atualizar}
          >
            <View style={{ gap: 2, flexShrink: 1 }}>
              <Texto style={{ fontSize: 14 }}>Atualizar do servidor</Texto>
              <Texto style={{ fontSize: 10.5, color: tema.apagado }}>
                {estado ? `${estado} · ` : ''}última sincronização: {ultimaSync}
              </Texto>
            </View>
            <Sincronizar cor={tema.ouro} />
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Bloco({ children }: { children: ReactNode }) {
  const tema = useTema();
  return <View style={[estilos.bloco, { borderBottomColor: tema.divisoria }]}>{children}</View>;
}

function Link({ rotulo, aoTocar }: { rotulo: string; aoTocar: () => void }) {
  const tema = useTema();
  return (
    <Pressable onPress={aoTocar} hitSlop={8} accessibilityRole="link">
      <Texto
        style={{
          fontSize: 12,
          color: tema.ouroEscuro,
          borderBottomWidth: 1,
          borderBottomColor: tema.ouroClaro,
        }}
      >
        {rotulo}
      </Texto>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  cabecalho: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  anelFora: { borderWidth: 1, borderRadius: 60, padding: 0 },
  anelDentro: { borderWidth: 4, borderRadius: 60 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iniciais: { color: '#F0E6D2', fontSize: 30, fontWeight: '600' },
  semAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progresso: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    gap: 6,
    borderBottomWidth: 1,
  },
  bloco: { paddingHorizontal: 20, paddingVertical: 16, gap: 12, borderBottomWidth: 1 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fim: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 24 },
  atualizar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 12,
  },
});
