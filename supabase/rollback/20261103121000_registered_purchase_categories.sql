-- Apply as a forward rollback. Keep stored choices and positive identities;
-- removing the nullable columns would discard user metadata.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
drop trigger zelo_registered_category_history on public.recurring_transactions;
drop trigger zelo_registered_finance_category on public.finances;
drop trigger zz_zelo_registered_category_override on public.recurring_transactions;
-- Keep the ownership guard for existing recurring_id references.
notify pgrst,'reload schema';
commit;
