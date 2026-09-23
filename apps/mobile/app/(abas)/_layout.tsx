import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTema } from '../../src/tema';
import { IconeCalendario, IconeHoje, IconePerfil, IconeRecompensas } from '../../src/ui/IconesAbas';

export default function Abas() {
  const tema = useTema();
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: tema.destaque,
          // Sem isso o cinza padrão some no fundo escuro (visto no emulador, tema escuro).
          tabBarInactiveTintColor: tema.sutil,
          headerStyle: { backgroundColor: tema.fundo },
          headerTintColor: tema.texto,
          tabBarStyle: { backgroundColor: tema.superficie },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Hoje', tabBarIcon: IconeHoje }} />
        <Tabs.Screen
          name="calendario"
          options={{ title: 'Calendário', tabBarIcon: IconeCalendario }}
        />
        <Tabs.Screen
          name="recompensas"
          options={{ title: 'Recompensas', tabBarIcon: IconeRecompensas }}
        />
        <Tabs.Screen name="perfil" options={{ title: 'Perfil', tabBarIcon: IconePerfil }} />
      </Tabs>
      {/* Captura rápida: acessível de qualquer aba, a um toque (especificação §7). */}
      <Pressable
        onPress={() => router.push('/captura')}
        accessibilityRole="button"
        accessibilityLabel="Captura rápida"
        style={[estilos.fab, { backgroundColor: tema.destaque }]}
      >
        <Text style={[estilos.mais, { color: tema.superficie }]}>+</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  mais: { fontSize: 30, lineHeight: 32 },
});
