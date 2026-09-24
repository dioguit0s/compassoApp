/**
 * APK de release para os amigos (F10, ADR-0008). A pasta android/ é gerada pelo prebuild e fica
 * fora do git, então o que precisa sobreviver a ela entra aqui, como config plugin:
 *
 * 1. Assinatura própria. Com as propriedades COMPASSO_RELEASE_* no ~/.gradle/gradle.properties
 *    (docs/desenvolvimento.md), o release é assinado com a chave do Compasso — a mesma sempre,
 *    senão o Android recusa instalar a atualização por cima. Sem elas, cai na chave de debug e o
 *    script avisa: serve para testar, não para distribuir.
 * 2. HTTP sem TLS. O release só fala HTTPS (o servidor de verdade fica atrás do túnel). Para testar
 *    o APK contra a API local, gere com COMPASSO_PERMITIR_HTTP=1 — e não distribua esse.
 */
const { withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

const MARCA = '// compasso: assinatura do release';

function comAssinatura(config) {
  return withAppBuildGradle(config, (c) => {
    let gradle = c.modResults.contents;
    if (gradle.includes(MARCA)) return c;
    const antesConfigs = 'signingConfigs {\n        debug {';
    const antesRelease =
      '// see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig signingConfigs.debug';
    if (!gradle.includes(antesConfigs) || !gradle.includes(antesRelease)) {
      throw new Error('apk-release: o build.gradle gerado mudou; revise o plugin');
    }
    gradle = gradle.replace(
      antesConfigs,
      `signingConfigs {
        ${MARCA}
        if (findProperty('COMPASSO_RELEASE_STORE_FILE')) {
            release {
                storeFile file(findProperty('COMPASSO_RELEASE_STORE_FILE'))
                storePassword findProperty('COMPASSO_RELEASE_STORE_PASSWORD')
                keyAlias findProperty('COMPASSO_RELEASE_KEY_ALIAS')
                keyPassword findProperty('COMPASSO_RELEASE_KEY_PASSWORD')
            }
        }
        debug {`,
    );
    gradle = gradle.replace(
      antesRelease,
      "// see https://reactnative.dev/docs/signed-apk-android.\n            signingConfig findProperty('COMPASSO_RELEASE_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    c.modResults.contents = gradle;
    return c;
  });
}

function comHttp(config) {
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    if (!app) return c;
    if (process.env.COMPASSO_PERMITIR_HTTP === '1') app.$['android:usesCleartextTraffic'] = 'true';
    else delete app.$['android:usesCleartextTraffic'];
    return c;
  });
}

module.exports = (config) => comHttp(comAssinatura(config));
