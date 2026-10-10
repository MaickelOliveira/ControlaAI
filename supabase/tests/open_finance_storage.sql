-- Run only in a disposable PostgreSQL database with the local test fixtures.
-- This suite is never applied to the Zelo production project.
begin;
do $$ begin
  if current_setting('zelo.open_finance_test', true) is distinct from 'local' then
    raise exception 'This test requires a disposable local database';
  end if;
end $$;

create function pg_temp.of_assert(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAILED: %', message; end if;
end $$;

select pg_temp.of_assert((select count(*) = 8 from pg_tables where schemaname = 'open_finance'), 'eight private storage tables');
select pg_temp.of_assert((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'open_finance' and c.relkind = 'r'), 'RLS is enabled and forced on every table');
select pg_temp.of_assert(not exists(select 1 from pg_policies where schemaname = 'open_finance'), 'no browser access policies');
select pg_temp.of_assert(not exists(select 1 from information_schema.columns where table_schema = 'open_finance' and column_name in ('cvv', 'pin', 'pan', 'card_number', 'password', 'access_token', 'raw_payload')), 'no authentication secrets or unrestricted bank payload');

insert into open_finance.user_access(user_id, country_code, country_verified_at)
values ('00000000-0000-4000-8000-000000000001', 'BR', now()), ('00000000-0000-4000-8000-000000000002', 'BR', now());
select pg_temp.of_assert((select bool_and(not enabled) from open_finance.user_access), 'access starts disabled');
do $$ begin
  begin
    insert into open_finance.user_access(user_id, country_code, country_verified_at)
    values ('00000000-0000-4000-8000-000000000003', 'PT', now());
    raise exception 'non-Brazilian access was accepted';
  exception when check_violation then null; end;
  begin
    insert into open_finance.user_access(user_id, country_code, country_verified_at)
    values ('00000000-0000-4000-8000-000000000003', 'BR', null);
    raise exception 'unverified country was accepted';
  exception when not_null_violation then null; end;
end $$;

insert into open_finance.connections(id, user_id, environment, mode, external_consent_id, institution_id, institution_name)
values
('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'consent-one', 'bank-one', 'Test Bank'),
('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'sandbox', 'personal', 'consent-two', 'bank-two', 'Test Bank'),
('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'production', 'personal', 'consent-three', 'bank-one', 'Test Bank');

insert into open_finance.resources(id, connection_id, user_id, environment, mode, resource_type, external_id, name)
values
('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'card', 'card-one', 'Test Card'),
('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'account', 'account-one', 'Test Account'),
('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'loan', 'loan-one', 'Test Loan');

do $$ begin
  begin
    insert into open_finance.resources(connection_id, user_id, environment, mode, resource_type, external_id, name)
    values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'sandbox', 'personal', 'card', 'wrong-owner', 'Test');
    raise exception 'another user connection was accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into open_finance.resources(connection_id, user_id, environment, mode, resource_type, external_id, name)
    values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'production', 'personal', 'card', 'wrong-environment', 'Test');
    raise exception 'sandbox and production were mixed';
  exception when foreign_key_violation then null; end;
  begin
    insert into open_finance.resources(connection_id, user_id, environment, mode, resource_type, external_id, name)
    values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'business', 'card', 'wrong-mode', 'Test');
    raise exception 'personal and business modes were mixed';
  exception when foreign_key_violation then null; end;
  begin
    insert into open_finance.card_limits(resource_id, user_id, environment, mode, line_key, currency)
    values ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'total', 'BRL');
    raise exception 'an account was accepted as a card';
  exception when foreign_key_violation then null; end;
end $$;

insert into open_finance.card_limits(resource_id, user_id, environment, mode, line_key, currency, total_amount, used_amount, available_amount)
values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'total', 'BRL', 3500, 4000, 0);
insert into open_finance.card_limits(resource_id, user_id, environment, mode, line_key, currency)
values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'cash', 'USD');
select pg_temp.of_assert((select available_amount is null and total_amount is null from open_finance.card_limits where line_key = 'cash'), 'missing limits remain null and foreign currency is preserved');

insert into open_finance.bills(id, resource_id, user_id, environment, mode, external_id, currency, due_date, total_amount)
values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'bill-one', 'BRL', '2026-10-15', 100);
insert into open_finance.movements(resource_id, user_id, environment, mode, resource_type, external_id, description, transaction_date, amount, currency, direction, classification, bill_id)
values
('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'card', 'purchase-one', 'Test Market', '2026-09-30', 100, 'BRL', 'debit', 'purchase', '30000000-0000-4000-8000-000000000001'),
('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'card', 'payment-one', 'Bill Payment', '2026-10-15', 100, 'BRL', 'credit', 'bill_payment', '30000000-0000-4000-8000-000000000001');
select pg_temp.of_assert((select sum(amount) = 100 from open_finance.movements where transaction_date >= '2026-09-01' and transaction_date < '2026-10-01' and classification = 'purchase'), 'calendar month differs from bill due month');

do $$ begin
  begin
    insert into open_finance.movements(resource_id, user_id, environment, mode, resource_type, external_id, description)
    values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'card', 'purchase-one', 'Repeated');
    raise exception 'duplicate transaction was accepted';
  exception when unique_violation then null; end;
  begin
    insert into open_finance.movements(resource_id, user_id, environment, mode, resource_type, external_id, description, bill_id)
    values ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'account', 'wrong-bill', 'Test', '30000000-0000-4000-8000-000000000001');
    raise exception 'another resource bill was accepted';
  exception when check_violation or foreign_key_violation then null; end;
end $$;

insert into open_finance.movements(resource_id, user_id, environment, mode, resource_type, external_id, description)
values ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'account', 'missing-values', 'Incomplete source');
select pg_temp.of_assert((select amount is null and transaction_date is null and classification = 'unknown' from open_finance.movements where external_id = 'missing-values'), 'incomplete source is not silently counted as zero');

insert into open_finance.credit_details(resource_id, user_id, environment, mode, resource_type, contract_amount, currency, paid_installments, remaining_installments)
values ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'loan', 13000, 'BRL', 10, 14);
insert into open_finance.sync_state(connection_id, user_id, environment, mode, stream, scope_key)
values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'card.transactions', 'card-one');
select pg_temp.of_assert((select status = 'pending' and covered_from is null and covered_to is null from open_finance.sync_state), 'coverage starts incomplete');
do $$ begin
  begin
    update open_finance.sync_state set covered_from = '2026-10-01', covered_to = '2026-09-01';
    raise exception 'reversed coverage was accepted';
  exception when check_violation then null; end;
  begin
    update open_finance.sync_state set status = 'complete';
    raise exception 'complete sync without success timestamp was accepted';
  exception when check_violation then null; end;
end $$;

select pg_temp.of_assert(not has_schema_privilege('anon', 'open_finance', 'USAGE') and not has_schema_privilege('authenticated', 'open_finance', 'USAGE') and not has_schema_privilege('service_role', 'open_finance', 'USAGE'), 'no new application or public schema access');
select pg_temp.of_assert(not exists(select 1 from pg_tables t cross join (values ('anon'), ('authenticated'), ('service_role')) roles(role_name) where schemaname = 'open_finance' and (has_table_privilege(role_name, format('%I.%I', schemaname, tablename), 'SELECT') or has_table_privilege(role_name, format('%I.%I', schemaname, tablename), 'INSERT') or has_table_privilege(role_name, format('%I.%I', schemaname, tablename), 'UPDATE') or has_table_privilege(role_name, format('%I.%I', schemaname, tablename), 'DELETE'))), 'no direct data privileges');

-- Prove denial using an actual application role, not just catalog flags.
set local role anon;
do $$ begin
  begin
    perform count(*) from open_finance.movements;
    raise exception 'anonymous role read private movements';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Disposable transaction only: temporary grants prove RLS still denies data.
-- ROLLBACK below removes these grants and all fixtures. Never run in production.
grant usage on schema open_finance to anon;
grant select, insert on open_finance.movements to anon;
set local role anon;
do $$ begin
  if (select count(*) from open_finance.movements) <> 0 then
    raise exception 'RLS exposed private movements';
  end if;
  begin
    insert into open_finance.movements(resource_id, user_id, environment, mode, resource_type, external_id, description)
    values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'card', 'anonymous-write', 'Test');
    raise exception 'RLS accepted anonymous write';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A renewed consent must reuse the canonical resource and its old movements.
insert into open_finance.connections(id, user_id, environment, mode, external_consent_id, institution_id, institution_name)
values ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'renewed-consent', 'bank-one', 'Test Bank');
insert into open_finance.resources(connection_id, user_id, environment, mode, resource_type, external_id, name)
values ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'sandbox', 'personal', 'card', 'card-one', 'Renewed Card')
on conflict (user_id, environment, resource_type, external_id) do update set connection_id = excluded.connection_id;
select pg_temp.of_assert((select count(*) = 1 from open_finance.resources where external_id = 'card-one'), 'renewed consent reuses canonical card');
select pg_temp.of_assert((select count(*) = 2 from open_finance.movements where resource_id = '20000000-0000-4000-8000-000000000001'), 'renewed card retains its transaction history');
select pg_temp.of_assert((select count(*) = 1 from public.finances), 'existing finance fixture remains untouched');
rollback;
select 'Open Finance storage tests passed; fixtures rolled back' as result;
