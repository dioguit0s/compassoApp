-- Ledger append-only (especificação §5 e §6.6): a API só insere e lê. Sem UPDATE nem DELETE,
-- não existe caminho no código que altere ou apague um lançamento — estorno é lançamento oposto.
GRANT SELECT, INSERT ON "completions", "xp_entries", "coin_entries" TO compasso_app;
