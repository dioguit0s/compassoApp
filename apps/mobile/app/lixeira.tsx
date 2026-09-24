import { items } from '@compasso/core/local';
import { desc, isNotNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { FlatList, StyleSheet, View } from 'react-native';
import { dataHoraCurta } from '../src/datasUi';
import { db } from '../src/db';
import { repositorio } from '../src/sync';
import { useTema } from '../src/tema';
import { CabecalhoInterno } from '../src/ui/Cabecalho';
import { Botao } from '../src/ui/Campos';
import { useAlerta } from '../src/ui/Dialogo';
import { Texto } from '../src/ui/Texto';

const RETENCAO_DIAS = 30;

/** Lixeira (issue #86): os excluídos dos últimos 30 dias. Restaurar funciona offline. */
export default function Lixeira() {
  const tema = useTema();
  const alerta = useAlerta();
  const { data } = useLiveQuery(
    db.select().from(items).where(isNotNull(items.deletedAt)).orderBy(desc(items.deletedAt)),
  );
  const agora = Date.now();
  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <CabecalhoInterno voltar="Configurações" titulo="Lixeira" />
      <FlatList
        contentContainerStyle={estilos.tela}
        data={data}
        keyExtractor={(i) => i.id}
        ListEmptyComponent={
          <Texto style={{ color: tema.sutil, textAlign: 'center', padding: 24 }}>
            Lixeira vazia.
          </Texto>
        }
        renderItem={({ item }) => {
          const restam = Math.max(
            0,
            RETENCAO_DIAS - Math.floor((agora - item.deletedAt!.getTime()) / 86_400_000),
          );
          return (
            <View style={[estilos.linha, { borderBottomColor: tema.divisoria }]}>
              <View style={{ flex: 1, gap: 3 }}>
                <Texto style={{ fontSize: 14, fontWeight: '600' }}>{item.title}</Texto>
                <Texto style={{ color: tema.rotulo, fontSize: 11.5 }}>
                  excluído {dataHoraCurta(item.deletedAt!)} · some em {restam}{' '}
                  {restam === 1 ? 'dia' : 'dias'}
                  {item.rrule ? ' · série' : ''}
                </Texto>
              </View>
              <Botao
                compacto
                rotulo="Restaurar"
                style={{ paddingVertical: 7 }}
                aoTocar={() => {
                  try {
                    repositorio.restaurar(item.id);
                  } catch (e) {
                    alerta('Não foi possível', (e as Error).message);
                  }
                }}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { paddingHorizontal: 20, paddingVertical: 8 },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
});
