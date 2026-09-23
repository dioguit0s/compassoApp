/**
 * Conversão de um .ics (exportação do Google Calendar) em um plano de importação — puro, sem
 * banco (especificação §6.5, issues #50 a #52). Regras:
 *
 * - todo item importado nasce compromisso puro: `kind = event`, sem esforço nem atributos;
 * - RRULE dentro do subconjunto → série; EXDATE → ocorrência cancelada; VEVENT com RECURRENCE-ID
 *   → desvio da ocorrência (movida/editada, ou cancelada se STATUS:CANCELLED);
 * - RRULE fora do subconjunto → expandida em itens isolados na janela de 1 ano para trás e 2 para
 *   frente, com aviso — perder o evento é pior que perder a regra;
 * - idempotência por UID: série e evento simples usam o UID; item expandido usa `UID#AAAAMMDD`
 *   (ou `UID#AAAAMMDDTHHMMSS`), estável entre reimportações.
 *
 * Datas: `VALUE=DATE` = dia inteiro (fim exclusivo, como o próprio ICS); `Z` = UTC; `TZID` = hora
 * de parede daquele fuso (o `timezone` do item guarda o TZID, para a série expandir certo);
 * sem nada = hora flutuante, lida como São Paulo (ADR-0003). O `ical.js` só desdobra o arquivo e
 * expande as regras exóticas; a conversão de fuso é a do core, a mesma do resto do sistema.
 */
import {
  diaDe,
  FUSO_PADRAO,
  instanteDeParede,
  limitesDiaInteiro,
  montarDia,
  somarDias,
  validarRRule,
  type Dia,
} from '@compasso/core';
import ICAL from 'ical.js';

export const JANELA_EXPANSAO = { anosParaTras: 1, anosParaFrente: 2 };

export interface ItemImportado {
  sourceUid: string;
  title: string;
  notes: string | null;
  allDay: boolean;
  startAt: Date;
  endAt: Date | null;
  timezone: string;
  rrule: string | null;
}

export interface DesvioImportado {
  sourceUidDaSerie: string;
  occurrenceDate: Dia;
  cancelada: boolean;
  startAt: Date | null;
  endAt: Date | null;
  titleOverride: string | null;
  notesOverride: string | null;
}

export interface PlanoDeImportacao {
  itens: ItemImportado[];
  desvios: DesvioImportado[];
  expandidos: { titulo: string; regra: string; motivo: string; ocorrencias: number }[];
  ignorados: { uid: string | null; titulo: string | null; motivo: string }[];
}

type Tempo = InstanceType<typeof ICAL.Time>;

function fusoValido(tz: string | null | undefined): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

/** Instante de um ICAL.Time, conforme Z / TZID / flutuante. */
function instante(t: Tempo, tzid: string | null): Date {
  if (t.zone?.tzid === 'UTC') {
    return new Date(Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second));
  }
  const fuso = fusoValido(tzid) ?? FUSO_PADRAO;
  return new Date(
    instanteDeParede(t.year, t.month, t.day, t.hour, t.minute, fuso).getTime() + t.second * 1000,
  );
}

const diaDoTempo = (t: Tempo): Dia => montarDia(t.year, t.month, t.day);

interface Evento {
  uid: string;
  titulo: string;
  notas: string | null;
  cancelado: boolean;
  allDay: boolean;
  inicio: Date;
  fim: Date | null;
  timezone: string;
  inicioBruto: Tempo;
  tzid: string | null;
  rrule: string | null;
  exdates: Date[];
  exdatesDias: Dia[];
  recurrenceId: { dia: Dia; instante: Date } | null;
}

function lerEvento(
  v: InstanceType<typeof ICAL.Component>,
): Evento | { erro: string; uid: string | null; titulo: string | null } {
  const uid = (v.getFirstPropertyValue('uid') as string | null) ?? null;
  const titulo =
    ((v.getFirstPropertyValue('summary') as string | null) ?? '').trim() || '(sem título)';
  if (!uid) return { erro: 'VEVENT sem UID', uid, titulo };
  const pInicio = v.getFirstProperty('dtstart');
  if (!pInicio) return { erro: 'VEVENT sem DTSTART', uid, titulo };
  const tInicio = pInicio.getFirstValue() as Tempo;
  const tzid = (pInicio.getParameter('tzid') as string | undefined) ?? null;
  const allDay = tInicio.isDate;
  const timezone = allDay ? FUSO_PADRAO : (fusoValido(tzid) ?? FUSO_PADRAO);

  let inicio: Date;
  let fim: Date | null = null;
  const pFim = v.getFirstProperty('dtend');
  const duracao = v.getFirstPropertyValue('duration') as InstanceType<typeof ICAL.Duration> | null;
  if (allDay) {
    const primeiro = diaDoTempo(tInicio);
    let ultimo = primeiro;
    if (pFim) {
      const tFim = pFim.getFirstValue() as Tempo;
      // DTEND de data é exclusivo no ICS, como no Compasso.
      const exclusivo = diaDoTempo(tFim);
      if (exclusivo > primeiro) ultimo = somarDias(exclusivo, -1);
    } else if (duracao) {
      ultimo = somarDias(primeiro, Math.max(0, duracao.days + duracao.weeks * 7 - 1));
    }
    ({ startAt: inicio, endAt: fim } = limitesDiaInteiro(primeiro, ultimo));
  } else {
    inicio = instante(tInicio, tzid);
    if (pFim) {
      fim = instante(
        pFim.getFirstValue() as Tempo,
        (pFim.getParameter('tzid') as string | undefined) ?? tzid,
      );
    } else if (duracao) {
      fim = new Date(inicio.getTime() + duracao.toSeconds() * 1000);
    }
    if (fim && fim < inicio) fim = null;
  }

  const exdates: Date[] = [];
  const exdatesDias: Dia[] = [];
  for (const p of v.getAllProperties('exdate')) {
    const tz = (p.getParameter('tzid') as string | undefined) ?? tzid;
    for (const t of p.getValues() as Tempo[]) {
      if (t.isDate) exdatesDias.push(diaDoTempo(t));
      else exdates.push(instante(t, tz));
    }
  }

  let recurrenceId: Evento['recurrenceId'] = null;
  const pRec = v.getFirstProperty('recurrence-id');
  if (pRec) {
    const t = pRec.getFirstValue() as Tempo;
    const inst = t.isDate
      ? limitesDiaInteiro(diaDoTempo(t), diaDoTempo(t)).startAt
      : instante(t, (pRec.getParameter('tzid') as string | undefined) ?? tzid);
    recurrenceId = { dia: t.isDate ? diaDoTempo(t) : diaDe(inst, timezone), instante: inst };
  }

  const recur = v.getFirstPropertyValue('rrule') as InstanceType<typeof ICAL.Recur> | null;
  return {
    uid,
    titulo,
    notas: ((v.getFirstPropertyValue('description') as string | null) ?? '').trim() || null,
    cancelado: String(v.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED',
    allDay,
    inicio,
    fim,
    timezone,
    inicioBruto: tInicio,
    tzid,
    rrule: recur ? recur.toString() : null,
    exdates,
    exdatesDias,
    recurrenceId,
  };
}

/** Expande uma regra exótica com o ical.js, em hora de parede, dentro da janela. */
function expandirExotica(e: Evento, agora: Date): { dia: Dia; inicio: Date; fim: Date | null }[] {
  const de = new Date(agora);
  de.setUTCFullYear(de.getUTCFullYear() - JANELA_EXPANSAO.anosParaTras);
  const ate = new Date(agora);
  ate.setUTCFullYear(ate.getUTCFullYear() + JANELA_EXPANSAO.anosParaFrente);
  const duracao = e.fim ? e.fim.getTime() - e.inicio.getTime() : 0;

  const flutuante = e.inicioBruto.clone();
  flutuante.zone = ICAL.Timezone.localTimezone;
  const it = ICAL.Recur.fromString(e.rrule!).iterator(flutuante);
  const saida: { dia: Dia; inicio: Date; fim: Date | null }[] = [];
  const excluidos = new Set([...e.exdates.map((d) => d.getTime())]);
  const diasExcluidos = new Set(e.exdatesDias);
  for (let t = it.next(), n = 0; t && n < 100_000; t = it.next(), n++) {
    const dia = diaDoTempo(t);
    const inicio = e.allDay
      ? limitesDiaInteiro(dia, dia).startAt
      : new Date(
          instanteDeParede(t.year, t.month, t.day, t.hour, t.minute, e.timezone).getTime() +
            t.second * 1000,
        );
    if (inicio >= ate) break;
    if (inicio < de || excluidos.has(inicio.getTime()) || diasExcluidos.has(dia)) continue;
    saida.push({ dia, inicio, fim: duracao ? new Date(inicio.getTime() + duracao) : null });
  }
  return saida;
}

const sufixo = (dia: Dia, inicio: Date, allDay: boolean, tz: string) => {
  const d = dia.replace(/-/g, '');
  if (allDay) return d;
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(inicio);
  return `${d}T${p.replace(/:/g, '')}`;
};

export function planejarImportacao(texto: string, agora: Date = new Date()): PlanoDeImportacao {
  const plano: PlanoDeImportacao = { itens: [], desvios: [], expandidos: [], ignorados: [] };
  let raiz: InstanceType<typeof ICAL.Component>;
  try {
    raiz = new ICAL.Component(ICAL.parse(texto));
  } catch (e) {
    throw new Error(`arquivo .ics inválido: ${(e as Error).message}`, { cause: e });
  }

  const mestres = new Map<string, Evento>();
  const excecoes: Evento[] = [];
  for (const v of raiz.getAllSubcomponents('vevent')) {
    let e: ReturnType<typeof lerEvento>;
    try {
      e = lerEvento(v);
    } catch (erro) {
      plano.ignorados.push({
        uid: null,
        titulo: null,
        motivo: `VEVENT ilegível: ${(erro as Error).message}`,
      });
      continue;
    }
    if ('erro' in e) {
      plano.ignorados.push({ uid: e.uid, titulo: e.titulo, motivo: e.erro });
      continue;
    }
    if (e.recurrenceId) excecoes.push(e);
    else if (mestres.has(e.uid)) {
      plano.ignorados.push({ uid: e.uid, titulo: e.titulo, motivo: 'UID repetido no arquivo' });
    } else mestres.set(e.uid, e);
  }

  /** Séries expandidas: UID → itens isolados por dia, para as exceções acharem o seu. */
  const expandidas = new Map<string, Map<Dia, ItemImportado>>();

  for (const e of mestres.values()) {
    if (e.cancelado) {
      plano.ignorados.push({ uid: e.uid, titulo: e.titulo, motivo: 'evento cancelado na origem' });
      continue;
    }
    const base = {
      title: e.titulo,
      notes: e.notas,
      allDay: e.allDay,
      timezone: e.timezone,
    };
    if (!e.rrule) {
      plano.itens.push({ ...base, sourceUid: e.uid, startAt: e.inicio, endAt: e.fim, rrule: null });
      continue;
    }
    const v = validarRRule(e.rrule, e.timezone);
    if (v.valida) {
      plano.itens.push({
        ...base,
        sourceUid: e.uid,
        startAt: e.inicio,
        endAt: e.fim,
        rrule: e.rrule,
      });
      const diasCancelados = new Set([
        ...e.exdatesDias,
        ...e.exdates.map((d) => diaDe(d, e.timezone)),
      ]);
      for (const dia of diasCancelados) {
        plano.desvios.push({
          sourceUidDaSerie: e.uid,
          occurrenceDate: dia,
          cancelada: true,
          startAt: null,
          endAt: null,
          titleOverride: null,
          notesOverride: null,
        });
      }
      continue;
    }
    // Fora do subconjunto: itens isolados na janela, com aviso.
    const porDia = new Map<Dia, ItemImportado>();
    for (const o of expandirExotica(e, agora)) {
      const item: ItemImportado = {
        ...base,
        sourceUid: `${e.uid}#${sufixo(o.dia, o.inicio, e.allDay, e.timezone)}`,
        startAt: o.inicio,
        endAt: o.fim,
        rrule: null,
      };
      porDia.set(o.dia, item);
      plano.itens.push(item);
    }
    expandidas.set(e.uid, porDia);
    plano.expandidos.push({
      titulo: e.titulo,
      regra: e.rrule,
      motivo: v.motivo,
      ocorrencias: porDia.size,
    });
  }

  for (const x of excecoes) {
    const rec = x.recurrenceId!;
    const mestre = mestres.get(x.uid);
    const expandida = expandidas.get(x.uid);
    if (expandida) {
      const alvo = expandida.get(rec.dia);
      if (!alvo) continue; // fora da janela de expansão
      if (x.cancelado) {
        plano.itens.splice(plano.itens.indexOf(alvo), 1);
      } else {
        Object.assign(alvo, {
          title: x.titulo,
          notes: x.notas,
          startAt: x.inicio,
          endAt: x.fim,
          allDay: x.allDay,
        });
      }
      continue;
    }
    if (mestre && !mestre.cancelado && mestre.rrule) {
      const mudouHora =
        x.inicio.getTime() !== rec.instante.getTime() ||
        (x.fim?.getTime() ?? null) !==
          (mestre.fim
            ? rec.instante.getTime() + (mestre.fim.getTime() - mestre.inicio.getTime())
            : null);
      plano.desvios.push({
        sourceUidDaSerie: x.uid,
        occurrenceDate: rec.dia,
        cancelada: x.cancelado,
        startAt: !x.cancelado && mudouHora ? x.inicio : null,
        endAt: !x.cancelado && mudouHora ? x.fim : null,
        titleOverride: !x.cancelado && x.titulo !== mestre.titulo ? x.titulo : null,
        notesOverride: !x.cancelado && x.notas !== mestre.notas ? x.notas : null,
      });
      continue;
    }
    if (x.cancelado) continue;
    // Exceção sem série conhecida: vira evento avulso, estável pela data original.
    plano.itens.push({
      sourceUid: `${x.uid}#${sufixo(rec.dia, rec.instante, x.allDay, x.timezone)}`,
      title: x.titulo,
      notes: x.notas,
      allDay: x.allDay,
      startAt: x.inicio,
      endAt: x.fim,
      timezone: x.timezone,
      rrule: null,
    });
  }

  // A mesma data desviada duas vezes (EXDATE + RECURRENCE-ID): fica o último.
  const unicos = new Map<string, DesvioImportado>();
  for (const d of plano.desvios) unicos.set(`${d.sourceUidDaSerie}@${d.occurrenceDate}`, d);
  plano.desvios = [...unicos.values()];
  return plano;
}
