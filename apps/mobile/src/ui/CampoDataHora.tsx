import DateTimePicker from '@react-native-community/datetimepicker';
import { diaDe, formatarDiaCurto, horaDe, nomeCurtoDoDia } from '@compasso/core';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { doSeletor, paraSeletor } from '../datasUi';
import { useTema } from '../tema';
import { Texto } from './Texto';

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
  const dia = diaDe(valor);

  return (
    <View>
      <View style={estilos.campo}>
        <Texto style={{ fontSize: 12, color: tema.rotulo, width: 52 }}>{rotulo}</Texto>
        <Pressable
          onPress={() => setModo('date')}
          accessibilityRole="button"
          accessibilityLabel={`${rotulo}: data ${formatarDiaCurto(dia, 0)}`}
          style={[
            estilos.caixa,
            estilos.data,
            { backgroundColor: tema.campo, borderColor: tema.bordaCampo },
          ]}
        >
          <Texto style={{ fontSize: 13 }}>
            {nomeCurtoDoDia(dia)}, {formatarDiaCurto(dia, 0)}
          </Texto>
        </Pressable>
        {somenteData ? null : (
          <Pressable
            onPress={() => setModo('time')}
            accessibilityRole="button"
            accessibilityLabel={`${rotulo}: hora ${horaDe(valor)}`}
            style={[
              estilos.caixa,
              estilos.hora,
              { backgroundColor: tema.campo, borderColor: tema.bordaCampo },
            ]}
          >
            <Texto cinzel style={{ fontSize: 13 }}>
              {horaDe(valor)}
            </Texto>
          </Pressable>
        )}
      </View>
      {modo ? (
        <View style={Platform.OS === 'ios' ? estilos.ios : undefined}>
          <DateTimePicker
            value={paraSeletor(valor)}
            mode={modo}
            is24Hour
            locale="pt-BR"
            accentColor={tema.ouro}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(evento, data) => {
              if (Platform.OS === 'android') setModo(null);
              if (evento.type === 'set' && data) aoMudar(doSeletor(data));
            }}
          />
          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setModo(null)} style={estilos.ok}>
              <Texto cinzel style={{ color: tema.ouro, fontWeight: '700', letterSpacing: 1.2 }}>
                OK
              </Texto>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Só a hora (HH:mm), com o seletor nativo — horários da grade da disciplina. */
export function CampoHora({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (hhmm: string) => void;
}) {
  const tema = useTema();
  const [aberto, setAberto] = useState(false);
  const [h, m] = valor.split(':').map(Number);
  const base = new Date(2000, 0, 1, h || 0, m || 0);
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Texto style={{ fontSize: 10.5, color: tema.rotulo }}>{rotulo}</Texto>
      <Pressable
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel={`${rotulo}: ${valor}`}
        style={[
          estilos.caixa,
          { alignItems: 'center', backgroundColor: tema.campo, borderColor: tema.bordaCampo },
        ]}
      >
        <Texto cinzel style={{ fontSize: 14 }}>
          {valor}
        </Texto>
      </Pressable>
      {aberto ? (
        <View>
          <DateTimePicker
            value={base}
            mode="time"
            is24Hour
            locale="pt-BR"
            accentColor={tema.ouro}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(evento, data) => {
              if (Platform.OS === 'android') setAberto(false);
              if (evento.type === 'set' && data) {
                aoMudar(
                  `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`,
                );
              }
            }}
          />
          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setAberto(false)} style={estilos.ok}>
              <Texto cinzel style={{ color: tema.ouro, fontWeight: '700', letterSpacing: 1.2 }}>
                OK
              </Texto>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  campo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  caixa: { borderWidth: 1, borderRadius: 7, paddingVertical: 10 },
  data: { flex: 1, paddingHorizontal: 12 },
  hora: { width: 76, alignItems: 'center' },
  ios: { width: '100%' },
  ok: { alignSelf: 'flex-end', padding: 8 },
});
