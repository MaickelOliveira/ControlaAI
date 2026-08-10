-- reminders já existia em produção sem a coluna "failed_attempts"
-- (adicionada só no schema.sql do commit a6c0626, que não afeta tabela já
-- criada). Sem essa coluna, getDueReminders() falha em todo tick do cron
-- (ver [reminders] getDueReminders erro nos logs) e nenhum lembrete dispara.
alter table public.reminders add column if not exists failed_attempts int not null default 0;
