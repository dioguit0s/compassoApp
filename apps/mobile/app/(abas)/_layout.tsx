import { Tabs } from 'expo-router';

export default function Abas() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Hoje' }} />
      <Tabs.Screen name="calendario" options={{ title: 'Calendário' }} />
      <Tabs.Screen name="recompensas" options={{ title: 'Recompensas' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
