CREATE TRIGGER rewards_carimbar_servidor BEFORE INSERT OR UPDATE ON "rewards"
  FOR EACH ROW EXECUTE FUNCTION carimbar_servidor();
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "rewards" TO compasso_app;
--> statement-breakpoint
-- Resgate é append-only, como o ledger: só inserção.
GRANT SELECT, INSERT ON "redemptions" TO compasso_app;
