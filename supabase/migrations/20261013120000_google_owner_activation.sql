-- Permanent account-level cutover boundary. No backfill or legacy token changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table google_workspace.owner_activations (
 user_id uuid primary key references public.users(id) on delete cascade,
 activated_at timestamptz not null default clock_timestamp()
);
alter table google_workspace.owner_activations enable row level security;
revoke all on google_workspace.owner_activations from public,anon,authenticated,service_role;
grant select,insert on google_workspace.owner_activations to service_role;

create function public.zelo_google_owner_activated(p_user_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if p_user_id is null then raise exception 'GOOGLE_WORKSPACE_INVALID';end if;
 perform 1 from public.users where id=p_user_id for share;
 if not found then raise exception 'GOOGLE_WORKSPACE_ACCESS_DENIED';end if;
 return exists(select 1 from google_workspace.owner_activations where user_id=p_user_id);
end;$$;

-- Verified OAuth save and explicit legacy assignment already write bindings in
-- owner -> company transactions. This trigger commits activation with that write;
-- a failed save or abandoned consent cannot turn off a working old connection.
create function google_workspace.activate_binding_owner()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if new.unlinked_at is null then
  insert into google_workspace.owner_activations(user_id) values(new.user_id) on conflict do nothing;
 end if;
 return new;
end;$$;
create trigger zelo_google_activate_owner after insert or update on google_workspace.bindings
 for each row execute function google_workspace.activate_binding_owner();

-- An old callback/refresh cannot resurrect global credentials after activation.
-- NOWAIT breaks the legacy row -> owner order against owner -> scoped binding.
create function google_workspace.guard_legacy_token_write()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare owner_id uuid;
begin
 if tg_op='UPDATE' and new.user_id is distinct from old.user_id then raise exception 'GOOGLE_GLOBAL_DISABLED';end if;
 owner_id:=case when tg_op='DELETE' then old.user_id else new.user_id end;
 perform 1 from public.users where id=owner_id for share nowait;
 -- Account erasure may cascade after the parent has been removed; the existing
-- owner lifecycle owns that deletion. A normal surviving account fails closed.
 if found and exists(select 1 from google_workspace.owner_activations where user_id=owner_id) then raise exception 'GOOGLE_GLOBAL_DISABLED';end if;
 if tg_op='DELETE' then return old;end if;
 return new;
exception when lock_not_available then raise exception 'GOOGLE_GLOBAL_DISABLED';
end;$$;
create trigger zelo_google_guard_legacy before insert or update or delete on public.google_tokens
 for each row execute function google_workspace.guard_legacy_token_write();

revoke all on function public.zelo_google_owner_activated(uuid),google_workspace.activate_binding_owner(),google_workspace.guard_legacy_token_write()
 from public,anon,authenticated,service_role;
grant execute on function public.zelo_google_owner_activated(uuid),google_workspace.activate_binding_owner(),google_workspace.guard_legacy_token_write() to service_role;
commit;
