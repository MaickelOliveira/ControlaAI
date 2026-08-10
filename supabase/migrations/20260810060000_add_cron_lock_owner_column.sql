-- cron_lock já existia em produção sem a coluna "owner" (adicionada só no
-- schema.sql do commit 04da7fa, que não afeta tabela já criada). Sem essa
-- coluna, acquireCronLock() falha em todo tick (ver [cron-lock] acquire erro
-- nos logs) e o mutex do cron nunca funciona.
alter table public.cron_lock add column if not exists owner text;
