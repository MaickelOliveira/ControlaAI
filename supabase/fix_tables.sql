-- Corrige tabelas cujo schema inicial não batia com o formato real dos
-- dados (achado ao converter o código) — roda isso uma vez, substitui só
-- essas 7 tabelas. Seguro rodar mesmo se elas já tiverem linhas de teste,
-- já que ainda não há dado real de produção nelas.

drop table if exists vehicles cascade;
create table vehicles (
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
create index vehicles_user_idx on vehicles(user_id);

drop table if exists employees cascade;
create table employees (
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
create index employees_user_idx on employees(user_id);

drop table if exists meets cascade;
create table meets (
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
create index meets_user_idx on meets(user_id);

drop table if exists grocery cascade;
create table grocery (
  id int primary key default 1,
  data jsonb not null default '{"stores":[],"purchases":[],"shoppingList":[]}',
  constraint single_row check (id = 1)
);

drop table if exists conversations cascade;
create table conversations (
  phone text primary key,
  data jsonb not null default '{"messages":[],"lastActivity":0}'
);

drop table if exists recurring_transactions cascade;
create table recurring_transactions (
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
create index recurring_user_idx on recurring_transactions(user_id);

drop table if exists finances cascade;
create table finances (
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
create index finances_user_idx on finances(user_id);
