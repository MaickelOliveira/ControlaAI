-- Schema Zelo (controlaai) — migração de data/*.json para Postgres/Supabase.
-- Rode esse arquivo inteiro uma vez no SQL Editor do seu projeto Supabase
-- (Supabase Dashboard → SQL Editor → New query → cola tudo → Run).
--
-- Campos que no JSON eram objetos/arrays livres (ex: wppPhoneNames,
-- customCategoriesExpense, planMap) viraram colunas jsonb — mantém o
-- mesmo formato de dado, sem precisar de tabelas extras de relacionamento
-- pra cada um, então a migração fica fiel ao comportamento atual.

create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  name text not null,
  email text not null unique,
  password_hash text not null,
  plan text not null default 'personal',
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','semiannual','annual')),
  status text not null default 'trial',
  active_mode text not null default 'personal',
  company text,
  -- wpp_phone/wpp_phones/wpp_phone_names/wpp_phone_relations/wpp_phone_access
  -- ficam OBSOLETOS a partir da tabela wpp_phone_links abaixo — mantidos só
  -- pra não quebrar quem ainda não rodou a migração que move esses dados
  -- (ver supabase/migrations). Não são mais lidos pelo código.
  wpp_phone text,
  wpp_phones jsonb not null default '[]',
  wpp_phone_names jsonb not null default '{}',
  wpp_phone_relations jsonb not null default '{}',
  wpp_phone_access jsonb not null default '{}',
  max_wpp_phones int,
  wpp_verify_code text,
  wpp_verify_expires timestamptz,
  custom_categories_expense jsonb not null default '[]',
  custom_categories_income jsonb not null default '[]',
  price_override numeric,
  activated_at timestamptz,
  deactivated_at timestamptz,
  trial_ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Substitui os campos wpp_phones/wpp_phone_names/etc do users (acima) —
-- phone como PK garante que o mesmo número NUNCA fica vinculado a duas
-- contas ao mesmo tempo (impossível de garantir com array por usuário).
create table if not exists wpp_phone_links (
  phone text primary key,
  user_id uuid not null references users(id) on delete cascade,
  name text,
  relation text,
  access text not null default 'both' check (access in ('personal', 'business', 'both')),
  linked_at timestamptz not null default now()
);
create index if not exists wpp_phone_links_user_idx on wpp_phone_links(user_id);

create table if not exists finances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  amount numeric not null,
  description text not null,
  category text not null,
  mode text not null default 'personal',
  date date not null,
  pending boolean not null default false,
  source text,
  registered_by text,
  created_at timestamptz not null default now()
);
create index if not exists finances_user_idx on finances(user_id);
create index if not exists finances_user_mode_date_idx on finances(user_id, mode, date);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  status text not null default 'pending',
  priority text not null default 'medium',
  mode text not null default 'personal',
  due_date date,
  created_at timestamptz not null default now()
);
create index if not exists tasks_user_idx on tasks(user_id);
create index if not exists tasks_user_mode_status_idx on tasks(user_id, mode, status);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  message text not null,
  phone text not null,
  scheduled_at timestamptz not null,
  repeat text not null default 'none',
  mode text not null default 'personal',
  sent boolean not null default false,
  failed_attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists reminders_user_idx on reminders(user_id);
create index if not exists reminders_due_idx on reminders(sent, scheduled_at);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  target_amount numeric not null,
  current_amount numeric not null default 0,
  deadline date,
  category text not null default 'Geral',
  mode text not null default 'personal',
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists goals_user_idx on goals(user_id);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  plate text not null default '',
  brand text not null,
  model text not null,
  year int not null,
  fuel_type text not null default 'flex',
  current_km numeric not null default 0,
  mode text not null default 'personal',
  expenses jsonb not null default '[]',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists vehicles_user_idx on vehicles(user_id);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  repeat text not null default 'none',
  status text not null default 'scheduled',
  source text not null default 'web',
  meet_link text,
  calendar_event_id text,
  ata_generated boolean not null default false,
  ata_content text,
  ata_notified_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists appointments_user_idx on appointments(user_id);

create table if not exists recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  amount numeric not null,
  total_amount numeric,
  category text not null,
  description text not null,
  mode text not null default 'personal',
  recurrence_type text not null,
  total_installments int,
  paid_installments int not null default 0,
  repeat_unit text not null,
  day_of_month int,
  start_date date not null,
  next_due_date date not null,
  status text not null default 'active',
  last_notified_date date,
  source text not null default 'web',
  created_at timestamptz not null default now()
);
create index if not exists recurring_user_idx on recurring_transactions(user_id);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  role text not null,
  salary numeric not null,
  start_date date not null,
  status text not null default 'active',
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists employees_user_idx on employees(user_id);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  company text,
  address text,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists customers_user_idx on customers(user_id);

-- grocery.json original é um blob ÚNICO (não por usuário) com
-- { stores, purchases, shoppingList }, cada item já carregando seu próprio
-- userId — mantém a mesma forma aqui, 1 linha só, pra não reescrever a
-- lógica de filtro que já existe no código.
create table if not exists grocery (
  id int primary key default 1,
  data jsonb not null default '{"stores":[],"purchases":[],"shoppingList":[]}',
  constraint single_row check (id = 1)
);

create table if not exists meets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  meet_link text not null default '',
  calendar_event_id text not null default '',
  attendees jsonb not null default '[]',
  ata_generated boolean not null default false,
  ata_content text,
  ata_notified_at timestamptz,
  status text not null default 'scheduled',
  source text not null default 'web',
  created_at timestamptz not null default now()
);
create index if not exists meets_user_idx on meets(user_id);

create table if not exists drive_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  parent_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists drive_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  folder_id uuid,
  original_name text not null,
  stored_name text not null,
  mime_type text not null,
  size int not null,
  description text,
  ai_keywords jsonb not null default '[]',
  source text not null default 'web',
  created_at timestamptz not null default now()
);
create index if not exists drive_files_user_idx on drive_files(user_id);

create table if not exists conversations (
  phone text primary key,
  data jsonb not null default '{"messages":[],"lastActivity":0}'
);

create table if not exists pending_actions (
  phone text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists admin_config (
  id int primary key default 1,
  admin_email text,
  admin_password_hash text,
  constraint single_row check (id = 1)
);

create table if not exists billing_config (
  id int primary key default 1,
  personal numeric not null default 0,
  business numeric not null default 0,
  monthly numeric not null default 47,
  semiannual numeric not null default 39.66,
  annual numeric not null default 29.70,
  constraint single_row check (id = 1)
);

create table if not exists whatsapp_config (
  id int primary key default 1,
  data jsonb not null default '{}',
  constraint single_row check (id = 1)
);

create table if not exists google_tokens (
  user_id uuid primary key references users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null
);

create table if not exists billing_webhooks (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  active boolean not null default false,
  secret_body_field text,
  secret_header text,
  secret_value text,
  email_path text not null,
  status_path text not null,
  activate_values jsonb not null default '[]',
  deactivate_values jsonb not null default '[]',
  plan_path text,
  plan_map jsonb,
  created_at timestamptz not null default now()
);

-- dedup de webhook (mensagens já processadas) — substitui
-- data/webhook-message-ids.json; entradas velhas podem ser limpas
-- periodicamente com um DELETE where processed_at < now() - interval '7 days'
create table if not exists webhook_message_ids (
  message_id text primary key,
  processed_at timestamptz not null default now()
);

-- Mutex do cron (substitui o lockfile local) — tabela em vez de
-- pg_advisory_lock porque o Supabase acessa via REST/pooler sem conexão
-- persistente por chamada, e advisory lock é escopado à sessão (podia
-- travar pra sempre se o "unlock" caísse numa conexão física diferente
-- da que fez o "lock"). Update condicional numa linha é seguro mesmo sem
-- sessão fixa.
create table if not exists cron_lock (
  id int primary key default 1,
  locked_at timestamptz,
  owner text,
  constraint single_row check (id = 1)
);
insert into cron_lock (id, locked_at) values (1, null) on conflict (id) do nothing;

-- Contador de tentativas por janela (login, cadastro, código de vinculação
-- de WhatsApp) — sem isso nada impede força bruta/abuso automatizado.
create table if not exists rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

create or replace function public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_ms bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz;
begin
  if p_key is null or p_key = '' or p_max < 1 or p_window_ms < 1 then
    return false;
  end if;

  v_cutoff := v_now - (p_window_ms::double precision * interval '1 millisecond');

  insert into public.rate_limits as rl (key, count, window_start)
  values (p_key, 1, v_now)
  on conflict (key) do update
  set
    count = case when rl.window_start <= v_cutoff then 1 else rl.count + 1 end,
    window_start = case when rl.window_start <= v_cutoff then v_now else rl.window_start end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, bigint) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, bigint) to service_role;
