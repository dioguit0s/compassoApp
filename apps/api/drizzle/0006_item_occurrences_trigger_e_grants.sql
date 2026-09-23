CREATE TRIGGER item_occurrences_carimbar_servidor
  BEFORE INSERT OR UPDATE ON "item_occurrences"
  FOR EACH ROW EXECUTE FUNCTION carimbar_servidor();
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "item_occurrences" TO compasso_app;
