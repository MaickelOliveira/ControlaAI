alter table public.users add column if not exists password_changed_at timestamptz;

create table if not exists public.password_reset_codes (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  code_hash text not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_codes_user_created_idx
  on public.password_reset_codes(user_id, created_at desc);

alter table public.password_reset_codes enable row level security;
revoke all on table public.password_reset_codes from public, anon, authenticated;
grant all on table public.password_reset_codes to service_role;

create or replace function public.consume_password_reset_code(p_id uuid, p_code_hash text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user_id uuid;
begin
  update public.password_reset_codes
     set attempts = attempts + 1,
         used_at = case when code_hash = p_code_hash then now() else used_at end
   where id = p_id and used_at is null and expires_at > now() and attempts < 5
  returning case when code_hash = p_code_hash then user_id else null end into v_user_id;
  return v_user_id;
end;
$$;

revoke all on function public.consume_password_reset_code(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_password_reset_code(uuid, text) to service_role;
