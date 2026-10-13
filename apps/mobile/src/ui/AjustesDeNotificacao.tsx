import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useGrade } from '../hooks';
import { pedirPermissao, reagendar } from '../notificacoes';
import {
  gravarDisciplinaSilenciada,
  gravarLembreteDeAula,
  gravarResumoDaManha,
  usePreferenciasDeNotificacao,
} from '../preferenciasDeNotificacao';
import { useTema } from '../tema';
import { Chip, Rotulo } from './Campos';
import { Texto } from './Texto';

const MINUTOS_ANTES_DA_AULA = [5, 10, 15, 30];
const HORAS_DO_RESUMO = ['06:00', '07:00', '08:00'];

const d2 = (n: number) => String(n).padStart(2, '0');

/**
 * Lembrete de aula e resumo da manhã (especificação §6.2), em Configurações. Valem para este
 * aparelho. Ligar qualquer um dos dois é o momento com contexto para pedir a permissão de
 * notificação; toda mudança reagenda na hora.
 */
export function AjustesDeNotificacao() {
  const tema = useTema();
  const prefs = usePreferenciasDeNotificacao();
  const grade = useGrade();
  const [escolhendoHora, setEscolhendoHora] = useState(false);
  const ativo = grade.semestres.find((s) => s.active);
  const disciplinas = grade.disciplinas.filter((c) => c.semesterId === ativo?.id);

  const aplicar = (gravar: () => void, ligando: boolean) => {
    gravar();
    void (async () => {
      if (ligando) await pedirPermissao();
      await reagendar();
    })();
  };
  const horaFora = prefs.resumoHora !== null && !HORAS_DO_RESUMO.includes(prefs.resumoHora);
  const valorDoSeletor = () => {
    const [h, m] = (prefs.resumoHora ?? '07:00').split(':').map(Number);
    const d = new Date();
    d.setHours(h!, m!, 0, 0);
    return d;
  };

  return (
    <>
      <View style={estilos.bloco}>
        <Rotulo>Lembrete de aula</Rotulo>
        <Texto style={{ fontSize: 12.5, lineHeight: 19, color: tema.texto2 }}>
          Um aviso antes de cada aula da grade, com a sala — e a sala trocada em destaque.
        </Texto>
        <View style={estilos.chips}>
          <Chip
            rotulo="Desligado"
            dica="Lembrete de aula desligado"
            ativo={prefs.aulaMinutos === null}
            aoTocar={() => aplicar(() => gravarLembreteDeAula(null), false)}
          />
          {MINUTOS_ANTES_DA_AULA.map((m) => (
            <Chip
              key={m}
              rotulo={`${m} min`}
              dica={`Avisar ${m} minutos antes da aula`}
              ativo={prefs.aulaMinutos === m}
              aoTocar={() => aplicar(() => gravarLembreteDeAula(m), true)}
            />
          ))}
        </View>
        {prefs.aulaMinutos !== null && disciplinas.length ? (
          <>
            <Texto style={{ fontSize: 11.5, color: tema.rotulo }}>
              Avisar para (toque para ligar ou desligar)
            </Texto>
            <View style={estilos.chips}>
              {disciplinas.map((c) => {
                const avisa = !prefs.silenciadas.includes(c.id);
                return (
                  <Chip
                    key={c.id}
                    rotulo={c.code ?? c.name}
                    cor={c.color}
                    dica={`${c.name}: ${avisa ? 'avisa' : 'não avisa'}`}
                    ativo={avisa}
                    aoTocar={() => aplicar(() => gravarDisciplinaSilenciada(c.id, avisa), false)}
                  />
                );
              })}
            </View>
          </>
        ) : null}
      </View>

      <View style={estilos.bloco}>
        <Rotulo>Resumo da manhã</Rotulo>
        <Texto style={{ fontSize: 12.5, lineHeight: 19, color: tema.texto2 }}>
          Uma notificação por dia com o que há pela frente: aulas, compromissos, tarefas e a carga
          do dia. Dia sem nada marcado não avisa.
        </Texto>
        <View style={estilos.chips}>
          <Chip
            rotulo="Desligado"
            dica="Resumo da manhã desligado"
            ativo={prefs.resumoHora === null}
            aoTocar={() => aplicar(() => gravarResumoDaManha(null), false)}
          />
          {HORAS_DO_RESUMO.map((h) => (
            <Chip
              key={h}
              rotulo={h}
              dica={`Resumo às ${h}`}
              ativo={prefs.resumoHora === h}
              aoTocar={() => aplicar(() => gravarResumoDaManha(h), true)}
            />
          ))}
          <Chip
            rotulo={horaFora ? prefs.resumoHora! : 'Outro horário'}
            dica="Escolher outro horário para o resumo"
            ativo={horaFora}
            aoTocar={() => setEscolhendoHora(true)}
          />
        </View>
        {escolhendoHora ? (
          <View>
            <DateTimePicker
              value={valorDoSeletor()}
              mode="time"
              is24Hour
              locale="pt-BR"
              accentColor={tema.ouro}
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(evento, data) => {
                if (Platform.OS === 'android') setEscolhendoHora(false);
                if (evento.type !== 'set' || !data) return;
                // O resumo é hora de parede de São Paulo (ADR-0003), como todo horário do app: o
                // que a pessoa escolhe no relógio é o que vale, sem converter pelo fuso do aparelho.
                const hora = `${d2(data.getHours())}:${d2(data.getMinutes())}`;
                aplicar(() => gravarResumoDaManha(hora), true);
              }}
            />
            {Platform.OS === 'ios' ? (
              <Pressable onPress={() => setEscolhendoHora(false)} style={estilos.ok}>
                <Texto cinzel style={{ color: tema.ouro, fontWeight: '700', letterSpacing: 1.2 }}>
                  OK
                </Texto>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  ok: { alignSelf: 'flex-end', padding: 8 },
});
