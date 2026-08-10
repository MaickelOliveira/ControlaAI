-- Planos comerciais por período e compartilhamento familiar sem limite.
alter table public.users
  add column if not exists billing_cycle text not null default 'monthly';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_billing_cycle_check'
  ) then
    alter table public.users add constraint users_billing_cycle_check
      check (billing_cycle in ('monthly', 'semiannual', 'annual'));
  end if;
end $$;

alter table public.billing_config
  add column if not exists monthly numeric not null default 47,
  add column if not exists semiannual numeric not null default 39.66,
  add column if not exists annual numeric not null default 29.70;

insert into public.billing_config (id, monthly, semiannual, annual)
values (1, 47, 39.66, 29.70)
on conflict (id) do update set
  monthly = excluded.monthly,
  semiannual = excluded.semiannual,
  annual = excluded.annual;

update public.users set max_wpp_phones = null where max_wpp_phones is not null;
