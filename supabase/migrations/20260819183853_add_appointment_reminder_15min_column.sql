-- Segundo nível de lembrete de compromisso (15min antes), independente do
-- lembrete de 2h que já existia (reminder_sent_at). Precisa de coluna
-- própria — reminder_sent_at já é usado pra marcar o lembrete de 2h como
-- enviado e não pode ser reaproveitado pro de 15min sem perder o controle
-- de qual dos dois já disparou.
alter table public.appointments add column if not exists reminder_15min_sent_at timestamptz;
