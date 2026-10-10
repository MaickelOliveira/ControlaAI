-- Preparation only: no bank calls, credentials, customer data, or app enablement.
-- Standard PostgreSQL 17 SQL. Existing public tables are referenced, not changed.
-- Apply once. If the outcome is unknown, run the verification query before retrying.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$ begin
  if exists(select 1 from pg_namespace where nspname = 'open_finance') then
    raise exception 'open_finance already exists; verify its migration before applying changes';
  end if;
  if to_regclass('public.users') is null then
    raise exception 'Zelo public.users is required';
  end if;
end $$;

create schema open_finance;
comment on schema open_finance is 'Zelo Open Finance storage v1 (20261009193000); private; disabled';
revoke all on schema open_finance from public;

create table open_finance.user_access (
  user_id uuid primary key references public.users(id) on delete cascade,
  country_code text not null check (country_code = 'BR'),
  country_verified_at timestamptz not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table open_finance.user_access is 'Eligibility based on verified country, not language. Empty and disabled until owner-only integration is approved.';

create table open_finance.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references open_finance.user_access(user_id) on delete cascade,
  provider text not null default 'polp_celcoin' check (provider = 'polp_celcoin'),
  environment text not null check (environment in ('sandbox', 'production')),
  mode text not null check (mode in ('personal', 'business')),
  external_consent_id text not null check (length(external_consent_id) between 1 and 200),
  institution_id text not null check (length(institution_id) between 1 and 200),
  institution_name text not null check (length(institution_name) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'revoked', 'error')),
  provider_status text check (length(provider_status) <= 100),
  scopes text[] not null default '{}'
    check (scopes <@ array['ACCOUNT', 'CREDIT_CARD_ACCOUNT', 'CREDIT_OPERATIONS', 'INVESTMENTS']::text[]),
  consent_expires_at timestamptz,
  revoked_at timestamptz,
  last_successful_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, external_consent_id),
  unique (id, user_id, environment, mode)
);
create index connections_owner_idx on open_finance.connections(user_id, environment, mode, status);

create table open_finance.resources (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  user_id uuid not null,
  environment text not null,
  mode text not null,
  resource_type text not null check (resource_type in ('account', 'card', 'investment', 'loan', 'financing', 'reserve')),
  external_id text not null check (length(external_id) between 1 and 200),
  parent_resource_id uuid,
  name text not null check (length(name) between 1 and 250),
  subtype text check (length(subtype) <= 100),
  card_network text check (length(card_network) <= 100),
  identification_last4 text check (identification_last4 ~ '^[0-9]{4}$'),
  currency text check (currency ~ '^[A-Z]{3}$'),
  available_amount numeric(24,8),
  gross_amount numeric(24,8),
  net_amount numeric(24,8),
  valuation_date date,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (connection_id, user_id, environment, mode)
    references open_finance.connections(id, user_id, environment, mode) on delete cascade,
  unique (user_id, environment, resource_type, external_id),
  unique (id, user_id, environment, mode, resource_type),
  unique (id, user_id, environment, mode),
  foreign key (parent_resource_id, user_id, environment, mode)
    references open_finance.resources(id, user_id, environment, mode),
  check (parent_resource_id is distinct from id),
  check (currency is not null or (available_amount is null and gross_amount is null and net_amount is null))
);
create index resources_connection_idx on open_finance.resources(connection_id);
create index resources_owner_idx on open_finance.resources(user_id, environment, mode, resource_type);
create index resources_parent_idx on open_finance.resources(parent_resource_id) where parent_resource_id is not null;
comment on table open_finance.resources is 'Canonical bank resources survive renewed consents by external ID. Positions are last known source values; null means unknown.';

create table open_finance.card_limits (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null,
  user_id uuid not null,
  environment text not null,
  mode text not null,
  resource_type text not null default 'card' check (resource_type = 'card'),
  line_key text not null check (length(line_key) between 1 and 200),
  line_name text check (length(line_name) <= 100),
  consolidation_type text check (length(consolidation_type) <= 100),
  limit_type text check (length(limit_type) <= 100),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_amount numeric(24,8) check (total_amount >= 0),
  used_amount numeric(24,8) check (used_amount >= 0),
  available_amount numeric(24,8) check (available_amount >= 0),
  customized_amount numeric(24,8) check (customized_amount >= 0),
  is_flexible boolean,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  foreign key (resource_id, user_id, environment, mode, resource_type)
    references open_finance.resources(id, user_id, environment, mode, resource_type) on delete cascade,
  unique (resource_id, line_key, currency)
);
comment on table open_finance.card_limits is 'Preserve each source limit line. Never sum consolidated and individual lines or derive available credit from local expenses.';

create table open_finance.bills (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null,
  user_id uuid not null,
  environment text not null,
  mode text not null,
  resource_type text not null default 'card' check (resource_type = 'card'),
  external_id text not null check (length(external_id) between 1 and 200),
  currency text check (currency ~ '^[A-Z]{3}$'),
  due_date date,
  total_amount numeric(24,8),
  minimum_payment_amount numeric(24,8) check (minimum_payment_amount >= 0),
  installment_allowed boolean,
  status text not null default 'unknown' check (status in ('unknown', 'open', 'closed', 'paid', 'partial', 'overdue')),
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  foreign key (resource_id, user_id, environment, mode, resource_type)
    references open_finance.resources(id, user_id, environment, mode, resource_type) on delete cascade,
  unique (resource_id, external_id),
  unique (id, resource_id, user_id, environment, mode),
  check (currency is not null or (total_amount is null and minimum_payment_amount is null))
);
create index bills_owner_due_idx on open_finance.bills(user_id, environment, mode, due_date);

create table open_finance.movements (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null,
  user_id uuid not null,
  environment text not null,
  mode text not null,
  resource_type text not null check (resource_type in ('account', 'card', 'investment')),
  external_id text not null check (length(external_id) between 1 and 200),
  description text not null check (length(description) <= 1000),
  transaction_date date,
  transaction_time timestamptz,
  bill_month date check (extract(day from bill_month) = 1),
  bill_id uuid,
  amount numeric(24,8) check (amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  original_amount numeric(24,8) check (original_amount >= 0),
  original_currency text check (original_currency ~ '^[A-Z]{3}$'),
  direction text not null default 'unknown' check (direction in ('unknown', 'debit', 'credit')),
  classification text not null default 'unknown'
    check (classification in ('unknown', 'purchase', 'income', 'fee', 'interest', 'refund', 'bill_payment', 'transfer', 'investment', 'other')),
  source_type text check (length(source_type) <= 100),
  source_category text check (length(source_category) <= 200),
  installment_number integer check (installment_number >= 1),
  installment_count integer check (installment_count >= 1),
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (resource_id, user_id, environment, mode, resource_type)
    references open_finance.resources(id, user_id, environment, mode, resource_type) on delete cascade,
  foreign key (bill_id, resource_id, user_id, environment, mode)
    references open_finance.bills(id, resource_id, user_id, environment, mode),
  unique (resource_id, external_id),
  check (bill_id is null or resource_type = 'card'),
  check (installment_number is null or installment_count is null or installment_number <= installment_count),
  check (amount is null or currency is not null),
  check ((original_amount is null) = (original_currency is null))
);
create index movements_owner_date_idx on open_finance.movements(user_id, environment, mode, transaction_date);
create index movements_resource_date_idx on open_finance.movements(resource_id, transaction_date);
create index movements_bill_idx on open_finance.movements(bill_id) where bill_id is not null;
comment on table open_finance.movements is 'Source movements, not automatic finances entries. Reports must reconcile manual/PDF/WhatsApp entries and exclude transfers and bill payments from duplicate spending.';

create table open_finance.credit_details (
  resource_id uuid primary key,
  user_id uuid not null,
  environment text not null,
  mode text not null,
  resource_type text not null check (resource_type in ('loan', 'financing')),
  currency text check (currency ~ '^[A-Z]{3}$'),
  contract_amount numeric(24,8) check (contract_amount >= 0),
  outstanding_amount numeric(24,8) check (outstanding_amount >= 0),
  next_installment_amount numeric(24,8) check (next_installment_amount >= 0),
  paid_installments integer check (paid_installments >= 0),
  remaining_installments integer check (remaining_installments >= 0),
  due_date date,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  foreign key (resource_id, user_id, environment, mode, resource_type)
    references open_finance.resources(id, user_id, environment, mode, resource_type) on delete cascade,
  check (currency is not null or (contract_amount is null and outstanding_amount is null and next_installment_amount is null))
);

create table open_finance.sync_state (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  user_id uuid not null,
  environment text not null,
  mode text not null,
  stream text not null check (stream in ('resources', 'account.transactions', 'card.transactions', 'card.limits', 'card.bills', 'investment.transactions', 'positions', 'credit')),
  scope_key text not null check (length(scope_key) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'running', 'complete', 'failed')),
  cursor text check (length(cursor) <= 1000),
  created_watermark timestamptz,
  updated_watermark timestamptz,
  covered_from date,
  covered_to date,
  last_successful_sync_at timestamptz,
  last_attempt_at timestamptz,
  error_code text check (error_code ~ '^[A-Z0-9_]{1,80}$'),
  updated_at timestamptz not null default now(),
  foreign key (connection_id, user_id, environment, mode)
    references open_finance.connections(id, user_id, environment, mode) on delete cascade,
  unique (connection_id, stream, scope_key),
  check ((covered_from is null) = (covered_to is null)),
  check (covered_to >= covered_from),
  check (status <> 'complete' or last_successful_sync_at is not null)
);
create index sync_state_owner_idx on open_finance.sync_state(user_id, environment, mode, status);
comment on table open_finance.sync_state is 'Advance watermarks and mark coverage complete only after all pages commit. Never mark a gap or partial response as complete.';

-- Fail closed, including projects with inherited default grants. No app role
-- gains access in this migration. Future server access needs its own reviewed
-- migration and authenticated per-user query layer; auth.uid() is not the
-- custom Zelo session identity.
do $$ declare relation_name text; role_name text; begin
  for relation_name in select tablename from pg_tables where schemaname = 'open_finance' loop
    execute format('alter table open_finance.%I enable row level security', relation_name);
    execute format('alter table open_finance.%I force row level security', relation_name);
  end loop;
  revoke all on all tables in schema open_finance from public;
  for role_name in select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role') loop
    execute format('revoke all on schema open_finance from %I', role_name);
    execute format('revoke all on all tables in schema open_finance from %I', role_name);
  end loop;
end $$;

commit;
