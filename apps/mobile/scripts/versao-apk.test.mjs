/** Versão do próximo APK (ADR-0016). Roda com `node --test`. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compararVersoes, proximaVersao } from './versao-apk.mjs';

describe('proximaVersao', () => {
  it('primeira publicação: o que está no app.json', () => {
    assert.deepEqual(proximaVersao({ versionName: '0.1.0', versionCode: 1 }, null), {
      versionName: '0.1.0',
      versionCode: 1,
    });
  });

  it('app.json à frente do publicado: usa o app.json (o caso do widget, 0.3.0 → 0.4.0)', () => {
    assert.deepEqual(
      proximaVersao(
        { versionName: '0.4.0', versionCode: 4 },
        { versionName: '0.3.0', versionCode: 3 },
      ),
      { versionName: '0.4.0', versionCode: 4 },
    );
  });

  it('mesma versão já publicada: sobe o patch e o versionCode', () => {
    assert.deepEqual(
      proximaVersao(
        { versionName: '0.4.0', versionCode: 4 },
        { versionName: '0.4.0', versionCode: 4 },
      ),
      { versionName: '0.4.1', versionCode: 5 },
    );
    assert.deepEqual(
      proximaVersao(
        { versionName: '0.4.0', versionCode: 4 },
        { versionName: '0.4.3', versionCode: 7 },
      ),
      { versionName: '0.4.4', versionCode: 8 },
    );
  });

  it('app.json com versão nova mas versionCode velho: o versionCode ainda sobe', () => {
    assert.deepEqual(
      proximaVersao(
        { versionName: '0.5.0', versionCode: 4 },
        { versionName: '0.4.2', versionCode: 6 },
      ),
      { versionName: '0.5.0', versionCode: 7 },
    );
  });

  it('compara numericamente, não como texto', () => {
    assert.ok(compararVersoes('0.10.0', '0.9.0') > 0);
    assert.throws(() => compararVersoes('0.4', '0.4.0'), /X\.Y\.Z/);
  });
});
