/**
 * Formatação de instantes num fuso IANA via `Intl.DateTimeFormat`, que o Hermes expõe nativamente.
 * Todo item guarda seu fuso (especificação §5); a hora mostrada depende dele, não do aparelho.
 */

export interface PartesNoFuso {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
}

export function partesNoFuso(instante: Date, fuso: string): PartesNoFuso {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const parte of fmt.formatToParts(instante)) p[parte.type] = parte.value;
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
  };
}

/** `AAAA-MM-DD HH:mm` no fuso pedido. Formato fixo, independente da localidade do aparelho. */
export function formatarNoFuso(instante: Date, fuso: string): string {
  const { ano, mes, dia, hora, minuto } = partesNoFuso(instante, fuso);
  const d = (n: number) => String(n).padStart(2, '0');
  return `${ano}-${d(mes)}-${d(dia)} ${d(hora)}:${d(minuto)}`;
}

/**
 * Casos do diagnóstico de fuso (issue #9): o mesmo instante em fusos distantes, incluindo os dois
 * lados de uma mudança de horário de verão em Nova York (8 de março de 2026, 2h → 3h local).
 * A tela de diagnóstico do app compara o resultado do aparelho com `esperado`.
 */
export const CASOS_DIAGNOSTICO_FUSO: readonly {
  instante: string;
  fuso: string;
  esperado: string;
}[] = [
  { instante: '2026-09-23T15:30:00Z', fuso: 'UTC', esperado: '2026-09-23 15:30' },
  { instante: '2026-09-23T15:30:00Z', fuso: 'America/Sao_Paulo', esperado: '2026-09-23 12:30' },
  { instante: '2026-09-23T15:30:00Z', fuso: 'Asia/Tokyo', esperado: '2026-09-24 00:30' },
  { instante: '2026-03-08T06:59:00Z', fuso: 'America/New_York', esperado: '2026-03-08 01:59' },
  { instante: '2026-03-08T07:00:00Z', fuso: 'America/New_York', esperado: '2026-03-08 03:00' },
];

export function rodarDiagnosticoDeFuso() {
  return CASOS_DIAGNOSTICO_FUSO.map((caso) => {
    let obtido: string;
    try {
      obtido = formatarNoFuso(new Date(caso.instante), caso.fuso);
    } catch (erro) {
      obtido = `erro: ${(erro as Error).message}`;
    }
    return { ...caso, obtido, ok: obtido === caso.esperado };
  });
}
