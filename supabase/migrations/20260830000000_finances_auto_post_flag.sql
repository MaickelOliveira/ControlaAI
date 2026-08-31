-- "pending" hoje só existe pra lançamentos com DATA FUTURA conhecida
-- (agendados) — autoPostPendingFinances() posta automaticamente assim que
-- `date <= hoje`. Uma "conta a receber" sem data de recebimento definida
-- (ex: lista colada com cabeçalho "À Receber") precisa ficar pendente até
-- alguém confirmar manualmente (finance_confirm_pending), sem cair na
-- data de hoje e ser postada sozinha no próximo tick do cron. Esse campo
-- deixa a IA marcar esses casos como pending SEM data conhecida, sem afetar
-- nenhum lançamento agendado existente (default true preserva 100% do
-- comportamento atual).
alter table public.finances add column if not exists auto_post boolean not null default true;
