import { items, metadados } from '@compasso/core/local';
import { asc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import {
  Button,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { db } from './db';
import { repositorio, sincronizarAgora } from './sync';

/**
 * Tela PROVISÓRIA da F1 (issue #19): deliberadamente crua, existe só para exercitar o roteiro do
 * critério de saída no aparelho. Sai quando a F2 trouxer as telas reais.
 */
export function ListaProvisoria() {
  const { data: lista } = useLiveQuery(
    db.select().from(items).where(isNull(items.deletedAt)).orderBy(asc(items.createdAt)),
  );
  const { data: meta } = useLiveQuery(
    db.select().from(metadados).where(eq(metadados.chave, 'ultimaSync')),
  );
  const [titulo, setTitulo] = useState('');
  const [editando, setEditando] = useState<{ id: string; titulo: string } | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [aviso, setAviso] = useState('');

  const ultimaSync = meta[0] ? new Date(Number(meta[0].valor)).toLocaleString('pt-BR') : 'nunca';

  function tentar(fn: () => void) {
    try {
      fn();
      setAviso('');
    } catch (erro) {
      setAviso((erro as Error).message);
    }
  }

  async function sincronizar() {
    setAtualizando(true);
    const r = await sincronizarAgora();
    setAtualizando(false);
    setAviso(
      r.tipo === 'ok'
        ? `enviados ${r.resultado.enviados}, recebidos ${r.resultado.recebidos}`
        : r.tipo === 'sem-conexao'
          ? 'configure o servidor na aba Perfil'
          : `sem sincronizar: ${r.mensagem}`,
    );
  }

  return (
    <View style={estilos.tela}>
      <Text style={estilos.meta}>última sincronização: {ultimaSync}</Text>
      <View style={estilos.linhaCriar}>
        <TextInput
          style={estilos.campo}
          placeholder="título do novo item"
          value={titulo}
          onChangeText={setTitulo}
        />
        <Button
          title="Criar"
          disabled={!titulo.trim()}
          onPress={() =>
            tentar(() => {
              repositorio.criar({
                title: titulo.trim(),
                notes: null,
                kind: 'event',
                effort: null,
                effortLockedAt: null,
                primaryAttribute: null,
                secondaryAttribute: null,
                dueAt: null,
                startAt: new Date(),
                endAt: null,
                allDay: false,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                rrule: null,
                recurrenceEndsAt: null,
                completedAt: null,
                reminderMinutesBefore: null,
              });
              setTitulo('');
            })
          }
        />
      </View>
      {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : null}
      <FlatList
        data={lista}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={sincronizar} />}
        ListEmptyComponent={<Text style={estilos.meta}>nenhum item — puxe para sincronizar</Text>}
        renderItem={({ item }) =>
          editando?.id === item.id ? (
            <View style={estilos.linha}>
              <TextInput
                style={estilos.campo}
                value={editando.titulo}
                autoFocus
                onChangeText={(t) => setEditando({ id: item.id, titulo: t })}
              />
              <Button
                title="OK"
                onPress={() =>
                  tentar(() => {
                    repositorio.editar(item.id, { title: editando.titulo });
                    setEditando(null);
                  })
                }
              />
            </View>
          ) : (
            <View style={estilos.linha}>
              <Pressable
                style={{ flex: 1 }}
                onPress={() => setEditando({ id: item.id, titulo: item.title })}
              >
                <Text style={estilos.titulo}>
                  {item.dirty ? '● ' : ''}
                  {item.title}
                </Text>
                <Text style={estilos.meta}>{item.startAt?.toLocaleString('pt-BR')}</Text>
              </Pressable>
              <Button
                title="Excluir"
                color="#8C2F4A"
                onPress={() => tentar(() => repositorio.excluir(item.id))}
              />
            </View>
          )
        }
      />
      <Text style={estilos.meta}>● = alterado aqui, ainda não confirmado pelo servidor</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, padding: 16, gap: 8 },
  linhaCriar: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  linha: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },
  campo: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8 },
  titulo: { fontSize: 16 },
  meta: { color: '#666', fontSize: 12 },
  aviso: { color: '#8C2F4A' },
});
