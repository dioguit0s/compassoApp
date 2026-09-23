-- userId da transação corrente, definido pela API com SET LOCAL app.user_id.
-- missing_ok = true: sem a variável, devolve NULL e toda política compara com NULL, ou seja,
-- nenhuma linha passa. nullif trata o '' que sobra na sessão depois de um SET LOCAL já encerrado.
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
