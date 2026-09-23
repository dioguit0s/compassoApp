-- Relógio do servidor em toda escrita, venha de onde vier (push, restauração da lixeira, psql).
-- clock_timestamp() e não now(): o carimbo fica o mais perto possível do commit, o que encurta
-- a corrida que a janela de segurança do cursor cobre (especificação §6.6). Qualquer valor
-- enviado pelo client para esta coluna é sobrescrito.
CREATE OR REPLACE FUNCTION carimbar_servidor() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.server_updated_at := clock_timestamp();
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER items_carimbar_servidor
  BEFORE INSERT OR UPDATE ON "items"
  FOR EACH ROW EXECUTE FUNCTION carimbar_servidor();
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "items" TO compasso_app;
