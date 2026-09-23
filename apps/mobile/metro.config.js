// Monorepo: desde o SDK 52 o Expo detecta os workspaces do npm e configura sozinho
// watchFolders e nodeModulesPaths, então `@compasso/core` resolve pelo nome do pacote a partir
// de node_modules/@compasso/core (um symlink para packages/core). Não repetir essa configuração
// à mão: ela sobrescreve a automática e é a origem clássica de React duplicado.
// Ver docs/desenvolvimento.md#app.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Migrações do drizzle-kit (driver expo) são importadas como .sql.
config.resolver.sourceExts.push('sql');

module.exports = config;
