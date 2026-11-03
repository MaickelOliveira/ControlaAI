-- Small override lookups must not scan every bank movement or schedule.
-- Concurrent indexes preserve normal bank imports while they are built.
set lock_timeout='5s';
set statement_timeout='60s';
create index concurrently if not exists movements_saved_category_lookup_idx
 on open_finance.movements(resource_id,transaction_date,installment_count,currency) where user_category is not null;
create index concurrently if not exists card_schedules_saved_category_lookup_idx
 on open_finance.card_schedules(resource_id) where user_category is not null;
reset lock_timeout;
reset statement_timeout;
