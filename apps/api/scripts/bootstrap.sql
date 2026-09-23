-- Roda UMA vez por servidor, como superusuário (psql -v ...). Cria os dois papéis e o banco.
--
--   psql -U postgres -v senha_dono="'...'" -v senha_app="'...'" -f scripts/bootstrap.sql
--
-- compasso_owner: dono do banco e das tabelas. Usado por migrações, criação de conta, purga e
--                 backup. Dono não está sujeito ao RLS (as tabelas usam ENABLE, não FORCE).
-- compasso_app:   papel da API. Não é dono nem superusuário: está sujeito ao RLS.
CREATE ROLE compasso_owner LOGIN PASSWORD :senha_dono;
CREATE ROLE compasso_app LOGIN PASSWORD :senha_app NOSUPERUSER NOBYPASSRLS;
CREATE DATABASE compasso OWNER compasso_owner;
\connect compasso
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO compasso_owner;
GRANT USAGE ON SCHEMA public TO compasso_app;
