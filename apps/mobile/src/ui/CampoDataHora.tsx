import DateTimePicker from '@react-native-community/datetimepicker';
import { diaDe, formatarDiaCurto, horaDe } from '@compasso/core';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { doSeletor, paraSeletor } from '../datasUi';
import { useTema } from '../tema';

/**
 * Data e hora em São Paulo (ADR-0003), com o seletor nativo. `somenteData` esconde a hora.
 * O seletor fala o fuso do aparelho; `paraSeletor`/`doSeletor` fazem a ponte.
 */
export function CampoDataHora({
  rotulo,
  valor,
  aoMudar,
  somenteData = false,
}: {
  rotulo: string;
  valor: Date;
  aoMudar: (novo: Date) => void;
  somenteData?: boolean;
}) {
  const tema = useTema();
  const [modo, setModo] = useState<'date' | 'time' | null>(null);

  return (
    <View style={estilos.campo}>
      <Text style={{ color: tema.sutil, width: 64 }}>{rotulo}</Text>
      <Pressable
        onPress={() => setModo('date')}
        style={[estilos.botao, { borderColor: tema.borda }]}
      >
        <Text style={{ color: tema.texto }}>{formatarDiaCurto(diaDe(valor), 0)}</Text>
      </Pressable>
      {somenteData ? null : (
        <Pressable
          onPress={() => setModo('time')}
          style={[estilos.botao, { borderColor: tema.borda }]}
        >
          <Text style={{ color: tema.texto }}>{horaDe(valor)}</Text>
        </Pressable>
      )}
      {modo ? (
        <View style={Platform.OS === 'ios' ? estilos.ios : undefined}>
          <DateTimePicker
            value={paraSeletor(valor)}
            mode={modo}
            is24Hour
            locale="pt-BR"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(evento, data) => {
              if (Platform.OS === 'android') setModo(null);
              if (evento.type === 'set' && data) aoMudar(doSeletor(data));
            }}
          />
          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setModo(null)} style={estilos.ok}>
              <Text style={{ color: tema.destaque, fontWeight: '600' }}>OK</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  campo: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  botao: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  ios: { width: '100%' },
  ok: { alignSelf: 'flex-end', padding: 8 },
});
