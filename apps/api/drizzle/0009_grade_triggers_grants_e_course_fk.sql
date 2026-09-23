-- Prova/trabalho ligados a uma disciplina da MESMA conta: FK composta, que é também a barreira
-- estrutural contra vínculo entre contas. Excluir fisicamente a disciplina (purga) anula só
-- course_id — SET NULL (coluna) do PostgreSQL 15+; o SET NULL comum anularia user_id também.
-- A exclusão LÓGICA (tombstone) é um UPDATE e não dispara isto: a aplicação anula o vínculo.
ALTER TABLE "items" ADD CONSTRAINT "items_course_fk"
  FOREIGN KEY ("user_id", "course_id") REFERENCES "courses" ("user_id", "id")
  ON DELETE SET NULL ("course_id");
--> statement-breakpoint
CREATE TRIGGER semesters_carimbar_servidor BEFORE INSERT OR UPDATE ON "semesters"
  FOR EACH ROW EXECUTE FUNCTION carimbar_servidor();
--> statement-breakpoint
CREATE TRIGGER courses_carimbar_servidor BEFORE INSERT OR UPDATE ON "courses"
  FOR EACH ROW EXECUTE FUNCTION carimbar_servidor();
--> statement-breakpoint
CREATE TRIGGER class_slots_carimbar_servidor BEFORE INSERT OR UPDATE ON "class_slots"
  FOR EACH ROW EXECUTE FUNCTION carimbar_servidor();
--> statement-breakpoint
CREATE TRIGGER class_exceptions_carimbar_servidor BEFORE INSERT OR UPDATE ON "class_exceptions"
  FOR EACH ROW EXECUTE FUNCTION carimbar_servidor();
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "semesters", "courses", "class_slots", "class_exceptions" TO compasso_app;
