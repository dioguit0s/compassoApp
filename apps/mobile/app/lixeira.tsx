import { items } from '@compasso/core/local';
import { desc, isNotNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { dataHoraCurta } from '../src/datasUi';
import { db } from '../src/db';
import { repositorio } from '../src/sync';
import { useTema } from '../src/tema';

const RETENCAO_DIAS = 30;

/** Lixeira (issue #86): os excluídos dos últimos 30 dias. Restaurar funciona offline. */
export default function Lixeira() {
  const tema = useTema();
  const { data } = useLiveQuery(
    db.select().from(items).where(isNotNull(items.deletedAt)).orderBy(desc(items.deletedAt)),
  );
  const agora = Date.now();
  return (
    <FlatList
      style={{ backgroundColor: tema.fundo }}
      contentContainerStyle={estilos.tela}
      data={data}
      keyExtractor={(i) => i.id}
      ListEmptyComponent={
        <Text style={{ color: tema.sutil, textAlign: 'center', padding: 24 }}>Lixeira vazia.</Text>
      }
      renderItem={({ item }) => {
        const restam = Math.max(
          0,
          RETENCAO_DIAS - Math.floor((agora - item.deletedAt!.getTime()) / 86_400_000),
        );
        return (
          <View style={[estilos.linha, { backgroundColor: tema.superficie }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: tema.texto, fontWeight: '500' }}>{item.title}</Text>
              <Text style={{ color: tema.sutil, fontSize: 12 }}>
                excluído {dataHoraCurta(item.deletedAt!)} · some em {restam}{' '}
                {restam === 1 ? 'dia' : 'dias'}
                {item.rrule ? ' · série' : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                try {
                  repositorio.restaurar(item.id);
                } catch (e) {
                  Alert.alert('Não foi possível', (e as Error).message);
                }
              }}
            >
              <Text style={{ color: tema.destaque, fontWeight: '600' }}>Restaurar</Text>
            </Pressable>
          </View>
        );
      }}
    />
  );
}

const estilos = StyleSheet.create({
  tela: { padding: 16, gap: 8 },
  linha: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, gap: 12 },
});
