/**
 * Versão do próximo APK (ADR-0016), sem commit de volta na main: o app.json diz a versão que o
 * autor quer (0.4.0, 0.5.0…) e o build recebe a final pelo ambiente (app.config.js).
 *
 * - versionCode: sempre maior que o publicado (o Android só instala por cima de um maior).
 * - versionName: a do app.json se for maior que a publicada; senão, o patch da publicada + 1.
 */

/** "0.4.0" → [0, 4, 0]; rejeita o que não for X.Y.Z. */
export function partesDaVersao(versao) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(versao).trim());
  if (!m) throw new Error(`versão "${versao}" fora do formato X.Y.Z`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compararVersoes(a, b) {
  const pa = partesDaVersao(a);
  const pb = partesDaVersao(b);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * @param {{ versionName: string, versionCode: number }} desejada do app.json
 * @param {{ versionName: string, versionCode: number } | null} publicada do android.json
 */
export function proximaVersao(desejada, publicada) {
  if (!publicada) return { versionName: desejada.versionName, versionCode: desejada.versionCode };
  const versionCode = Math.max(desejada.versionCode, publicada.versionCode + 1);
  if (compararVersoes(desejada.versionName, publicada.versionName) > 0) {
    return { versionName: desejada.versionName, versionCode };
  }
  const [maior, menor, patch] = partesDaVersao(publicada.versionName);
  return { versionName: `${maior}.${menor}.${patch + 1}`, versionCode };
}
