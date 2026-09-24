import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTema } from '../../src/tema';
import { Mais } from '../../src/ui/Icones';
import { IconeCalendario, IconeHoje, IconePerfil, IconeRecompensas } from '../../src/ui/IconesAbas';
import { Texto } from '../../src/ui/Texto';

const ALTURA_DA_BARRA = 64;

export default function Abas() {
  const tema = useTema();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const rotulo = (texto: string) =>
    function Rotulo({ focused }: { focused: boolean }) {
      return (
        <Texto
          cinzel
          numberOfLines={1}
          style={{
            fontSize: 9,
            letterSpacing: texto.length > 10 ? 0.5 : 0.9,
            color: focused ? tema.ouroEscuro : tema.inativo,
            fontWeight: focused ? '700' : '400',
          }}
        >
          {texto.toLocaleUpperCase('pt-BR')}
        </Texto>
      );
    };
  return (
    <View style={{ flex: 1, backgroundColor: tema.fundo }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: tema.ouro,
          tabBarInactiveTintColor: tema.inativo,
          tabBarStyle: {
            backgroundColor: tema.barraAbas,
            borderTopColor: tema.bordaCampo,
            borderTopWidth: 1,
            height: ALTURA_DA_BARRA + bottom,
            paddingTop: 8,
            paddingBottom: bottom + 8,
            elevation: 0,
          },
          tabBarIconStyle: { marginBottom: 2 },
          sceneStyle: { backgroundColor: tema.fundo },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Hoje', tabBarIcon: IconeHoje, tabBarLabel: rotulo('Hoje') }}
        />
        <Tabs.Screen
          name="calendario"
          options={{
            title: 'Calendário',
            tabBarIcon: IconeCalendario,
            tabBarLabel: rotulo('Calendário'),
          }}
        />
        <Tabs.Screen
          name="recompensas"
          options={{
            title: 'Recompensas',
            tabBarIcon: IconeRecompensas,
            tabBarLabel: rotulo('Recompensas'),
          }}
        />
        <Tabs.Screen
          name="perfil"
          options={{ title: 'Perfil', tabBarIcon: IconePerfil, tabBarLabel: rotulo('Perfil') }}
        />
      </Tabs>
      {/* Captura rápida: acessível de qualquer aba, a um toque (especificação §7). */}
      <Pressable
        onPress={() => router.push('/captura')}
        accessibilityRole="button"
        accessibilityLabel="Captura rápida"
        style={[
          estilos.fab,
          {
            bottom: ALTURA_DA_BARRA + bottom + 18,
            backgroundColor: tema.ouro,
            borderColor: tema.ouroClaro,
            shadowColor: tema.texto,
          },
        ]}
      >
        <Mais cor={tema.sobreOuro} />
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowOpacity: 0.42,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 10 },
  },
});
