alter table public.password_reset_codes
  add column if not exists purpose text not null default 'reset'
  check (purpose in ('reset', 'setup'));
