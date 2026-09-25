import { diaDe, formatarDiaCurto, inicioDoDia, partesDoDia, type Dia } from '@compasso/core';
import { ErroDeValidacao } from '@compasso/core/local';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useGrade, useHoje } from '../src/hooks';
import { repositorio } from '../src/sync';
import { useTema } from '../src/tema';
import { CabecalhoInterno } from '../src/ui/Cabecalho';
import { CampoDataHora } from '../src/ui/CampoDataHora';
import { Botao, Campo, Secao } from '../src/ui/Campos';
import { useAlerta } from '../src/ui/Dialogo';
import { useAlturaTeclado } from '../src/ui/teclado';
import { Texto } from '../src/ui/Texto';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * Tela Semestre (especificação §7, issue #59): disciplinas do semestre ativo com horários e
 * salas, criar semestre novo, consultar os arquivados. Funciona offline (grava no SQLite).
 */
export default function Semestre() {
  const tema = useTema();
  const teclado = useAlturaTeclado();
  const router = useRouter();
  const alerta = useAlerta();
  const hoje = useHoje();
  const grade = useGrade();
  const ativo = grade.semestres.find((s) => s.active) ?? null;
  const arquivados = grade.semestres.filter((s) => !s.active);
  const disciplinas = useMemo(
    () =>
      grade.disciplinas
        .filter((c) => c.semesterId === ativo?.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [grade, ativo],
  );
  // null = o usuário ainda não escolheu; segue a grade, que chega depois do primeiro render.
  const [escolha, setCriando] = useState<boolean | null>(null);
  const criando = escolha ?? grade.semestres.length === 0;

  const fmt = (d: string) => formatarDiaCurto(d, 0);
  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <CabecalhoInterno
        voltar="Calendário"
        titulo={ativo ? `Semestre ${ativo.label}` : 'Semestre'}
        subtitulo={
          ativo
            ? `${fmt(ativo.startDate)} a ${fmt(ativo.endDate)}${
                hoje < ativo.startDate
                  ? ' · ainda não começou'
                  : hoje > ativo.endDate
                    ? ' · encerrado (férias)'
                    : ''
              }`
            : 'Nenhum semestre ativo: a aba Hoje não mostra aulas.'
        }
      />
      <ScrollView
        style={{ marginBottom: teclado }}
        contentContainerStyle={estilos.tela}
        keyboardShouldPersistTaps="handled"
      >
        {ativo
          ? disciplinas.map((c) => {
              const horarios = grade.horarios
                .filter((h) => h.courseId === c.id)
                .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
              return (
                <Pressable
                  key={c.id}
                  onPress={() => router.push({ pathname: '/disciplina', params: { id: c.id } })}
                  accessibilityRole="button"
                  style={[
                    estilos.cartao,
                    {
                      backgroundColor: tema.cartao,
                      borderColor: tema.bordaCampo,
                      borderLeftColor: c.color,
                    },
                  ]}
                >
                  <View style={estilos.linha}>
                    <Texto style={{ fontSize: 15, fontWeight: '600', flexShrink: 1 }}>
                      {c.name}
                    </Texto>
                    {c.code ? (
                      <Texto cinzel style={{ fontSize: 11, letterSpacing: 1.1, color: c.color }}>
                        {c.code}
                      </Texto>
                    ) : null}
                  </View>
                  {horarios.map((h) => (
                    <Texto key={h.id} style={{ fontSize: 12, color: tema.texto3 }}>
                      {DIAS[h.weekday]} {h.startTime}–{h.endTime} · sala{' '}
                      {h.room ?? c.defaultRoom ?? '—'}
                    </Texto>
                  ))}
                  {horarios.length === 0 ? (
                    <Texto style={{ fontSize: 12, color: tema.apagado, fontStyle: 'italic' }}>
                      sem horários
                    </Texto>
                  ) : null}
                </Pressable>
              );
            })
          : null}
        {ativo ? (
          <Pressable
            onPress={() => router.push({ pathname: '/disciplina', params: { semestre: ativo.id } })}
            accessibilityRole="button"
            style={[estilos.nova, { borderColor: tema.ouroClaro }]}
          >
            <Texto cinzel style={{ fontSize: 12, letterSpacing: 1.7, color: tema.ouroEscuro }}>
              + DISCIPLINA
            </Texto>
          </Pressable>
        ) : null}

        {arquivados.length ? (
          <View style={{ marginTop: 10 }}>
            <Secao titulo="Arquivados" />
            {arquivados.map((s) => (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                onPress={() =>
                  alerta(`Semestre ${s.label}`, 'Tornar este o semestre corrente?', [
                    { text: 'Tornar corrente', onPress: () => repositorio.ativarSemestre(s.id) },
                    { text: 'Cancelar', style: 'cancel' },
                  ])
                }
                style={[estilos.arquivado, { borderBottomColor: tema.divisoria }]}
              >
                <Texto style={{ fontSize: 13.5, color: tema.texto2 }}>Semestre {s.label}</Texto>
                <Texto style={{ fontSize: 11.5, color: tema.apagado }}>
                  {fmt(s.startDate)} a {fmt(s.endDate)}
                </Texto>
              </Pressable>
            ))}
          </View>
        ) : null}

        {criando ? (
          <NovoSemestre aoCriar={() => setCriando(false)} />
        ) : (
          <Botao
            variante="neutro"
            rotulo="Criar semestre novo"
            style={{ marginTop: 4 }}
            aoTocar={() => setCriando(true)}
          />
        )}
      </ScrollView>
    </View>
  );
}

function NovoSemestre({ aoCriar }: { aoCriar: () => void }) {
  const tema = useTema();
  const hoje = diaDe(new Date());
  const { ano, mes } = partesDoDia(hoje);
  const [label, setLabel] = useState(`${ano}.${mes <= 6 ? 1 : 2}`);
  const [inicio, setInicio] = useState<Dia>(hoje);
  const [fim, setFim] = useState<Dia>(`${ano}-${mes <= 6 ? '07-15' : '12-20'}`);
  const [erro, setErro] = useState('');
  return (
    <View style={[estilos.painel, { backgroundColor: tema.painel, borderColor: tema.linha }]}>
      <Secao titulo="Novo semestre" />
      <Texto style={{ fontSize: 12, color: tema.rotulo }}>
        O novo vira o corrente; o atual fica arquivado, intacto.
      </Texto>
      <Campo rotulo="Nome" value={label} onChangeText={setLabel} />
      <CampoDataHora
        rotulo="Início"
        somenteData
        valor={inicioDoDia(inicio)}
        aoMudar={(v) => setInicio(diaDe(v))}
      />
      <CampoDataHora
        rotulo="Fim"
        somenteData
        valor={inicioDoDia(fim)}
        aoMudar={(v) => setFim(diaDe(v))}
      />
      {erro ? <Texto style={{ color: tema.perigo, fontSize: 12.5 }}>{erro}</Texto> : null}
      <Botao
        variante="primario"
        rotulo="Criar semestre"
        aoTocar={() => {
          try {
            repositorio.criarSemestre({ label: label.trim(), startDate: inicio, endDate: fim });
            aoCriar();
          } catch (e) {
            setErro(e instanceof ErroDeValidacao ? e.motivos.join('; ') : (e as Error).message);
          }
        }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: 16, paddingBottom: 40, gap: 10 },
  cartao: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 7,
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  nova: {
    padding: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 8,
    alignItems: 'center',
  },
  arquivado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  painel: { gap: 10, padding: 14, borderWidth: 1, borderRadius: 9, marginTop: 4 },
});
