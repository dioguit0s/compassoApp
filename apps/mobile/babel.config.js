module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // As migrações do SQLite são arquivos .sql importados por drizzle/migrations.js.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
