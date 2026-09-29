/**
 * Fingerprint do runtime do OTA (ADR-0013). O APK é gerado no Windows e o OTA é publicado no
 * runner Linux, e os dois precisam chegar ao mesmo hash. No Windows o @expo/fingerprint deixa
 * passar caminhos com "\" pelos padrões de ignorar dele. Entram assim o JS que o config plugin
 * carrega de node_modules e o android/build de pacotes já compilados, que no Linux ficam de fora.
 * E o build do Gradle reescreve o AndroidManifest.xml de bibliotecas dentro de node_modules
 * (tira o atributo package), então o hash do Windows mudaria depois de cada build. Os padrões
 * abaixo, sem "**" na frente, casam nos dois sistemas.
 *
 * O JS dos pacotes vai no bundle, que é justamente o que o OTA atualiza. A compatibilidade nativa
 * continua coberta pelo código nativo e pelo package.json (versão) de cada pacote.
 *
 * @type {import('expo/fingerprint').Config}
 */
const config = {
  ignorePaths: [
    '../../node_modules/**/*.js',
    '../../node_modules/**/android/build/**/*',
    '../../node_modules/**/android/src/main/AndroidManifest.xml',
    'node_modules/**/*.js',
    'node_modules/**/android/build/**/*',
    'node_modules/**/android/src/main/AndroidManifest.xml',
  ],
};

module.exports = config;
