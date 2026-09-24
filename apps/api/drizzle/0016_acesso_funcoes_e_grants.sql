-- Autenticação por senha e cadastro por convite (F10, ADR-0008).
--
-- O papel da API continua sem INSERT em users, sem acesso a invites e sem enxergar api_tokens
-- (ADR-0002): criar conta, emitir e revogar sessão passam por funções SECURITY DEFINER que
-- expõem só a operação, nunca a tabela. Mesmo uma consulta errada (ou injetada) com o papel da
-- API não cria conta sem convite nem lista tokens.

-- Troca de senha, sempre dentro da própria conta (credentials_dono).
GRANT SELECT ON "credentials" TO compasso_app;
--> statement-breakpoint
GRANT UPDATE ("password_hash", "updated_at") ON "credentials" TO compasso_app;
--> statement-breakpoint
-- Entrar: antes do login não existe app.user_id, e o RLS esconderia a linha. Mesmo desenho de
-- resolver_token (0002).
CREATE OR REPLACE FUNCTION credencial_por_email(p_email text)
  RETURNS TABLE (user_id uuid, password_hash text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT c.user_id, c.password_hash FROM credentials c WHERE c.email = lower(btrim(p_email))
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION credencial_por_email(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION credencial_por_email(text) TO compasso_app;
--> statement-breakpoint
-- Sessões. As três funções agem só na conta de app.user_id: sem ele, não fazem nada.
CREATE OR REPLACE FUNCTION emitir_token(p_token_hash text, p_rotulo text) RETURNS void
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF app_user_id() IS NULL THEN
      RAISE EXCEPTION 'emitir_token sem app.user_id';
    END IF;
    INSERT INTO api_tokens (token_hash, user_id, label) VALUES (p_token_hash, app_user_id(), p_rotulo);
  END
  $$;
--> statement-breakpoint
-- Revoga um token (sair) ou, com p_exceto, todos menos esse (troca de senha). Devolve quantos.
CREATE OR REPLACE FUNCTION revogar_tokens(p_token_hash text, p_exceto boolean) RETURNS integer
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    WITH r AS (
      UPDATE api_tokens SET revoked_at = now()
      WHERE user_id = app_user_id() AND revoked_at IS NULL
        AND (CASE WHEN p_exceto THEN token_hash <> p_token_hash ELSE token_hash = p_token_hash END)
      RETURNING 1
    )
    SELECT count(*)::int FROM r
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION emitir_token(text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION revogar_tokens(text, boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION emitir_token(text, text) TO compasso_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION revogar_tokens(text, boolean) TO compasso_app;
--> statement-breakpoint
-- Cadastro: consome o convite e cria conta, credencial e o primeiro token numa transação só.
-- Devolve 'ok', 'convite' (inexistente, usado ou vencido) ou 'email' (já cadastrado). Qualquer
-- recusa desfaz tudo, inclusive o consumo do convite.
CREATE OR REPLACE FUNCTION cadastrar_conta(
  p_convite_hash text,
  p_user_id uuid,
  p_nome text,
  p_cor text,
  p_email text,
  p_senha_hash text,
  p_token_hash text,
  p_rotulo text
) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    -- O convite é travado antes de tudo: dois cadastros simultâneos com o mesmo código
    -- esperam um pelo outro, e o segundo encontra used_at preenchido.
    PERFORM 1 FROM invites
      WHERE code_hash = p_convite_hash AND used_at IS NULL AND expires_at > now()
      FOR UPDATE;
    IF NOT FOUND THEN
      RETURN 'convite';
    END IF;

    BEGIN
      INSERT INTO users (id, display_name, accent_color) VALUES (p_user_id, p_nome, p_cor);
      INSERT INTO credentials (user_id, email, password_hash)
        VALUES (p_user_id, lower(btrim(p_email)), p_senha_hash);
    EXCEPTION WHEN unique_violation THEN
      -- O subbloco desfaz os INSERTs; o convite não chegou a ser marcado.
      RETURN 'email';
    END;

    INSERT INTO api_tokens (token_hash, user_id, label) VALUES (p_token_hash, p_user_id, p_rotulo);
    UPDATE invites SET used_at = now(), used_by = p_user_id WHERE code_hash = p_convite_hash;
    RETURN 'ok';
  END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cadastrar_conta(text, uuid, text, text, text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cadastrar_conta(text, uuid, text, text, text, text, text, text) TO compasso_app;
