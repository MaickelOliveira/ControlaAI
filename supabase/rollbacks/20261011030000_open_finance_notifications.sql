-- Run only during an intentional application rollback with its worker stopped.
-- Keep stored financial data and delivery receipts; the previous app ignores additions.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function public.zelo_of_prepare_schedules(p_owner_email text default null) returns integer
language sql security definer set search_path=pg_catalog set row_security=off as $$ select 0; $$;
update open_finance.sync_jobs set status='failed',lease_token=null,lease_until=null,error_code='ROLLBACK_DISABLED',updated_at=now()
where kind in ('recurrings','installments','bill-transactions') and status in ('pending','running');
commit;
