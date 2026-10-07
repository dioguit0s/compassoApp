/**
 * Fingerprint do runtime do OTA (ADR-0013). O APK é gerado no Windows e o OTA é publicado no
 * runner Linux, e os dois precisam chegar ao mesmo hash. No Windows o @expo/fingerprint deixa
 * passar caminhos com "\" pelos padrões de ignorar dele. Entram assim o JS que o config plugin
 * carrega de node_modules e as saídas de build de pacotes já compilados (android/build, .cxx,
 * .gradle, e build/.gradle/.kotlin dos plugins do Gradle), que no Linux ficam de fora. Essas
 * saídas ainda mudam durante o próprio build: o hash que o Gradle embute no APK sairia diferente
 * do calculado depois (visto em 2026-09-29 com o expo-updates-gradle-plugin).
 * E o build do Gradle reescreve o AndroidManifest.xml de bibliotecas dentro de node_modules
 * (tira o atributo package), então o hash do Windows mudaria depois de cada build. Os padrões
 * abaixo, sem "**" na frente, casam nos dois sistemas.
 *
 * O JS dos pacotes vai no bundle, que é justamente o que o OTA atualiza. A compatibilidade nativa
 * continua coberta pelo código nativo e pelo package.json (versão) de cada pacote.
 *
 * @type {import('expo/fingerprint').Config}
 */
const ignorados = [
  '**/*.js',
  '**/android/build/**/*',
  '**/android/.cxx/**/*',
  '**/android/.gradle/**/*',
  '**/android/src/main/AndroidManifest.xml',
  '**/*-gradle-plugin/build/**/*',
  '**/*-gradle-plugin/.gradle/**/*',
  '**/*-gradle-plugin/.kotlin/**/*',
];

const config = {
  // node_modules da raiz do monorepo e o do próprio app.
  ignorePaths: ignorados.flatMap((p) => [`../../node_modules/${p}`, `node_modules/${p}`]),
  // A versão (version, android.versionCode) não decide compatibilidade nativa: o runner a injeta
  // no build (app.config.js, ADR-0016) e o OTA é calculado sem ela. O segundo item é o padrão do
  // @expo/fingerprint, que esta lista substitui.
  sourceSkips: ['ExpoConfigVersions', 'PackageJsonAndroidAndIosScriptsIfNotContainRun'],
};

module.exports = config;
