import { diaDe, formatarDiaCurto, partesDoDia } from '@compasso/core';
import { ErroDeValidacao } from '@compasso/core/local';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGrade, useHoje } from '../src/hooks';
import { repositorio } from '../src/sync';
import { useTema } from '../src/tema';
import { Botao, Campo } from '../src/ui/Campos';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * Tela Semestre (especificação §7, issue #59): disciplinas do semestre ativo com horários e
 * salas, criar semestre novo, consultar os arquivados. Funciona offline (grava no SQLite).
 */
export default function Semestre() {
  const tema = useTema();
  const router = useRouter();
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
    <ScrollView style={{ backgroundColor: tema.fundo }} contentContainerStyle={estilos.tela}>
      {ativo ? (
        <View style={estilos.bloco}>
          <Text style={[estilos.titulo, { color: tema.texto }]}>Semestre {ativo.label}</Text>
          <Text style={{ color: tema.sutil }}>
            {fmt(ativo.startDate)} a {fmt(ativo.endDate)}
            {hoje < ativo.startDate
              ? ' · ainda não começou'
              : hoje > ativo.endDate
                ? ' · encerrado (férias)'
                : ''}
          </Text>
        </View>
      ) : (
        <Text style={{ color: tema.sutil }}>
          Nenhum semestre ativo: a aba Hoje não mostra aulas.
        </Text>
      )}

      {ativo
        ? disciplinas.map((c) => {
            const horarios = grade.horarios
              .filter((h) => h.courseId === c.id)
              .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
            return (
              <Pressable
                key={c.id}
                onPress={() => router.push({ pathname: '/disciplina', params: { id: c.id } })}
                style={[
                  estilos.cartao,
                  { backgroundColor: tema.superficie, borderLeftColor: c.color },
                ]}
              >
                <Text style={[estilos.nome, { color: tema.texto }]}>
                  {c.name}
                  {c.code ? ` (${c.code})` : ''}
                </Text>
                {horarios.map((h) => (
                  <Text key={h.id} style={{ color: tema.sutil }}>
                    {DIAS[h.weekday]} {h.startTime}–{h.endTime} · sala{' '}
                    {h.room ?? c.defaultRoom ?? '—'}
                  </Text>
                ))}
                {horarios.length === 0 ? (
                  <Text style={{ color: tema.sutil }}>sem horários</Text>
                ) : null}
              </Pressable>
            );
          })
        : null}
      {ativo ? (
        <Botao
          rotulo="+ Disciplina"
          aoTocar={() => router.push({ pathname: '/disciplina', params: { semestre: ativo.id } })}
        />
      ) : null}

      {criando ? (
        <NovoSemestre aoCriar={() => setCriando(false)} />
      ) : (
        <Botao rotulo="Criar semestre novo" aoTocar={() => setCriando(true)} />
      )}

      {arquivados.length ? (
        <View style={estilos.bloco}>
          <Text style={[estilos.subtitulo, { color: tema.texto }]}>Semestres arquivados</Text>
          {arquivados.map((s) => (
            <Pressable
              key={s.id}
              onPress={() =>
                Alert.alert(`Semestre ${s.label}`, 'Tornar este o semestre corrente?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Tornar corrente', onPress: () => repositorio.ativarSemestre(s.id) },
                ])
              }
            >
              <Text style={{ color: tema.sutil }}>
                {s.label} · {fmt(s.startDate)} a {fmt(s.endDate)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function NovoSemestre({ aoCriar }: { aoCriar: () => void }) {
  const tema = useTema();
  const hoje = diaDe(new Date());
  const { ano, mes } = partesDoDia(hoje);
  const [label, setLabel] = useState(`${ano}.${mes <= 6 ? 1 : 2}`);
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(`${ano}-${mes <= 6 ? '07-15' : '12-20'}`);
  const [erro, setErro] = useState('');
  return (
    <View style={[estilos.bloco, estilos.cartao, { backgroundColor: tema.superficie }]}>
      <Text style={[estilos.subtitulo, { color: tema.texto }]}>Novo semestre</Text>
      <Text style={{ color: tema.sutil }}>
        O novo vira o corrente; o atual fica arquivado, intacto.
      </Text>
      <Campo rotulo="Nome" value={label} onChangeText={setLabel} />
      <Campo
        rotulo="Início (AAAA-MM-DD)"
        value={inicio}
        onChangeText={setInicio}
        autoCapitalize="none"
      />
      <Campo rotulo="Fim (AAAA-MM-DD)" value={fim} onChangeText={setFim} autoCapitalize="none" />
      {erro ? <Text style={{ color: tema.perigo }}>{erro}</Text> : null}
      <Botao
        rotulo="Criar"
        aoTocar={() => {
          try {
            repositorio.criarSemestre({
              label: label.trim(),
              startDate: inicio.trim(),
              endDate: fim.trim(),
            });
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
  tela: { padding: 16, gap: 12 },
  bloco: { gap: 6 },
  titulo: { fontSize: 20, fontWeight: '600' },
  subtitulo: { fontSize: 16, fontWeight: '600' },
  nome: { fontSize: 16, fontWeight: '500' },
  cartao: { padding: 12, borderRadius: 10, borderLeftWidth: 5, gap: 2 },
});
