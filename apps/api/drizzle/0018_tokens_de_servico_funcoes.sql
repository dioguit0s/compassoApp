-- Tokens de serviço (integração com a Luna, ADR-0012). A API continua sem enxergar api_tokens
-- (ADR-0002): tudo passa por funções SECURITY DEFINER, no mesmo desenho de 0002 e 0016.
--
-- resolver_token (0002) fica: a imagem anterior ainda o usa, e o rollback do deploy
-- (ADR-0011) precisa dela funcionando com o banco já migrado.
CREATE OR REPLACE FUNCTION resolver_sessao(p_token_hash text)
  RETURNS TABLE (user_id uuid, kind text, scopes text[])
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT t.user_id, t.kind, t.scopes FROM api_tokens t
    WHERE t.token_hash = p_token_hash AND t.revoked_at IS NULL
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolver_sessao(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolver_sessao(text) TO compasso_app;
--> statement-breakpoint
-- Emite um token de serviço na conta de app.user_id. Teto de 10 ativos por conta: é um usuário
-- com uma ou duas integrações, e o teto impede que um bug no app encha a tabela.
CREATE OR REPLACE FUNCTION emitir_token_de_servico(p_token_hash text, p_rotulo text, p_scopes text[])
  RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_id uuid;
  BEGIN
    IF app_user_id() IS NULL THEN
      RAISE EXCEPTION 'emitir_token_de_servico sem app.user_id';
    END IF;
    -- Serializa emissões concorrentes da mesma conta, para o teto valer.
    PERFORM pg_advisory_xact_lock(hashtext('tokens_de_servico:' || app_user_id()::text));
    IF (SELECT count(*) FROM api_tokens
        WHERE user_id = app_user_id() AND kind = 'service' AND revoked_at IS NULL) >= 10 THEN
      RETURN NULL;
    END IF;
    INSERT INTO api_tokens (token_hash, user_id, label, kind, scopes)
      VALUES (p_token_hash, app_user_id(), p_rotulo, 'service', p_scopes)
      RETURNING id INTO v_id;
    RETURN v_id;
  END
  $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION listar_tokens_de_servico()
  RETURNS TABLE (id uuid, label text, scopes text[], created_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT t.id, t.label, t.scopes, t.created_at FROM api_tokens t
    WHERE t.user_id = app_user_id() AND t.kind = 'service' AND t.revoked_at IS NULL
    ORDER BY t.created_at DESC
  $$;
--> statement-breakpoint
-- Revoga um token de serviço da própria conta. Nunca revoga sessão de aparelho por aqui.
CREATE OR REPLACE FUNCTION revogar_token_de_servico(p_id uuid) RETURNS boolean
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    WITH r AS (
      UPDATE api_tokens SET revoked_at = now()
      WHERE id = p_id AND user_id = app_user_id() AND kind = 'service' AND revoked_at IS NULL
      RETURNING 1
    )
    SELECT count(*) > 0 FROM r
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION emitir_token_de_servico(text, text, text[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION listar_tokens_de_servico() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION revogar_token_de_servico(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION emitir_token_de_servico(text, text, text[]) TO compasso_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION listar_tokens_de_servico() TO compasso_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION revogar_token_de_servico(uuid) TO compasso_app;
