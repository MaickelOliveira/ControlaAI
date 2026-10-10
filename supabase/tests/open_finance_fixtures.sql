-- In-memory test bootstrap only. Never apply to an existing Zelo database.
create role anon;
create role authenticated;
create role service_role bypassrls;
alter default privileges grant all on tables to anon, authenticated, service_role;
create table public.users(id uuid primary key);
create table public.finances(id uuid primary key, user_id uuid references public.users(id), amount numeric);
insert into public.users values
('00000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000002'),
('00000000-0000-4000-8000-000000000003');
insert into public.finances values
('90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 42);
set zelo.open_finance_test = 'local';
