/**
 * Versão do build vinda do ambiente (ADR-0016). O publicar-apk.mjs calcula a versão final
 * (versao-apk.mjs) e passa por COMPASSO_VERSION_NAME e COMPASSO_VERSION_CODE, sem editar o
 * app.json nem commitar de volta na main. Sem as variáveis, vale o app.json como está.
 *
 * A versão não entra no fingerprint do runtime (sourceSkips no fingerprint.config.js): o APK
 * gerado com ela continua casando com o OTA calculado sem ela.
 */
module.exports = ({ config }) => {
  const nome = process.env.COMPASSO_VERSION_NAME;
  const codigo = process.env.COMPASSO_VERSION_CODE;
  if (!nome && !codigo) return config;
  if (codigo && !/^\d+$/.test(codigo)) {
    throw new Error(`COMPASSO_VERSION_CODE inválido: ${codigo}`);
  }
  return {
    ...config,
    version: nome || config.version,
    android: {
      ...config.android,
      versionCode: codigo ? Number(codigo) : config.android?.versionCode,
    },
  };
};
