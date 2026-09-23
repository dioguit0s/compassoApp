-- Privilégios do papel da API. Nunca DELETE: exclusão é lógica (deleted_at); a purga física
-- de tombstones roda com o papel dono, fora da API.
GRANT SELECT, UPDATE ON "users" TO compasso_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_user_id() TO compasso_app;
--> statement-breakpoint
-- O middleware precisa descobrir o userId ANTES de existir app.user_id, e o RLS esconderia a
-- linha do token. SECURITY DEFINER roda como o dono (que não está sujeito ao RLS, porque as
-- tabelas usam ENABLE e não FORCE) e expõe só esta consulta, nunca a tabela.
CREATE OR REPLACE FUNCTION resolver_token(p_token_hash text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT user_id FROM api_tokens
    WHERE token_hash = p_token_hash AND revoked_at IS NULL
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolver_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolver_token(text) TO compasso_app;
