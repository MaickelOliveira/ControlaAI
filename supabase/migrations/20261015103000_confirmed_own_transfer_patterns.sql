begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
-- Keep the migrator's grants exactly as they were before transferring
-- SECURITY DEFINER ownership to the restricted workspace role.
create temporary table zelo_transfer_migration_privileges on commit drop as
 select pg_has_role(current_user,'zelo_of_workspace','SET') and pg_has_role(current_user,'zelo_of_workspace','USAGE') as effective,
 (select jsonb_build_object('admin',admin_option,'inherit',inherit_option,'set',set_option)
  from pg_auth_members where roleid='zelo_of_workspace'::regrole
    and member=(select oid from pg_roles where rolname=current_user)
    and grantor=(select oid from pg_roles where rolname=current_user)) as own_grant,
 has_schema_privilege('zelo_of_workspace','public','CREATE') as public_create,
 has_schema_privilege('zelo_of_workspace','open_finance','CREATE') as private_create;
do $$declare original jsonb;begin
 if not exists(select 1 from pg_roles where rolname='zelo_of_workspace' and not rolcanlogin and not rolsuper and not rolbypassrls) then raise exception 'OF_WORKSPACE_ROLE_UNSAFE';end if;
 if not(select effective from zelo_transfer_migration_privileges) then
  select own_grant into original from zelo_transfer_migration_privileges;
  execute format('grant zelo_of_workspace to %I with admin %s,inherit true,set true granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,current_user);
 end if;
end;$$;
do $$begin
 if not(select public_create from zelo_transfer_migration_privileges) then grant create on schema public to zelo_of_workspace;end if;
 if not(select private_create from zelo_transfer_migration_privileges) then grant create on schema open_finance to zelo_of_workspace;end if;
end;$$;

-- A customer-confirmed rule is scoped to one connected account and one exact
-- bank description and amount. Matching amount/date alone never creates a rule.
create table open_finance.own_transfer_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  environment text not null check (environment = 'production'),
  mode text not null check (mode in ('personal','business')),
  company_id uuid,
  resource_id uuid not null references open_finance.resources(id) on delete cascade,
  resource_type text not null default 'account' check (resource_type='account'),
  direction text not null check (direction in ('debit','credit')),
  amount numeric(24,8) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  description text not null check (length(btrim(description)) between 18 and 1000),
  source_type text,
  created_at timestamptz not null default now(),
  check ((mode='personal' and company_id is null) or (mode='business' and company_id is not null)),
  foreign key (company_id,user_id) references public.companies(id,user_id),
  foreign key (resource_id,user_id,environment,mode,resource_type)
    references open_finance.resources(id,user_id,environment,mode,resource_type) on delete cascade
);
create unique index own_transfer_patterns_exact
  on open_finance.own_transfer_patterns(resource_id,direction,amount,currency,lower(btrim(description)),coalesce(source_type,''));
alter table open_finance.own_transfer_patterns enable row level security;
alter table open_finance.own_transfer_patterns force row level security;
revoke all on open_finance.own_transfer_patterns from public,anon,authenticated,service_role;
create policy zelo_workspace on open_finance.own_transfer_patterns for all to zelo_of_workspace
  using (open_finance.company_visible(user_id,mode,company_id))
  with check (open_finance.company_visible(user_id,mode,company_id));
grant select,insert,delete on open_finance.own_transfer_patterns to zelo_of_workspace;

create function public.zelo_of_confirm_own_transfer_pattern(p_user uuid,p_mode text,p_movement uuid) returns integer
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare chosen open_finance.movements%rowtype; updated_count integer;
begin
  perform open_finance.require_access(p_user,p_mode);
  select * into chosen from open_finance.movements
    where id=p_movement and user_id=p_user and environment='production' and mode=p_mode
      and open_finance.company_visible(user_id,mode,company_id) for update;
  if not found then return -1;end if;
  if chosen.resource_type<>'account' or chosen.direction not in ('debit','credit')
    or chosen.amount is null or chosen.amount<=0 or chosen.currency is null
    or length(btrim(chosen.description))<18
    or chosen.description !~* '(pix|transf)'
    or lower(btrim(chosen.description)) ~ '^(pix|transf(erencia|erência)?)( (enviado|recebido|para|de|em|conta))*$'
  then raise exception 'OF_OWN_TRANSFER_PATTERN_UNSAFE';end if;

  insert into open_finance.own_transfer_patterns(user_id,environment,mode,company_id,resource_id,direction,amount,currency,description,source_type)
  values(chosen.user_id,chosen.environment,chosen.mode,chosen.company_id,chosen.resource_id,chosen.direction,chosen.amount,chosen.currency,chosen.description,chosen.source_type)
  on conflict do nothing;

  update open_finance.movements m set user_category='Transferência entre contas próprias'
    where m.user_id=chosen.user_id and m.environment=chosen.environment and m.mode=chosen.mode
      and m.company_id is not distinct from chosen.company_id and m.resource_id=chosen.resource_id
      and m.resource_type='account' and m.direction=chosen.direction
      and m.amount=chosen.amount and m.currency=chosen.currency
      and lower(btrim(m.description))=lower(btrim(chosen.description))
      and m.source_type is not distinct from chosen.source_type
      and (m.id=chosen.id or m.user_category is null or m.user_category in ('Transferência','Transferência entre contas próprias'));
  get diagnostics updated_count=row_count;
  return updated_count;
end;$$;
alter function public.zelo_of_confirm_own_transfer_pattern(uuid,text,uuid) owner to zelo_of_workspace;
revoke all on function public.zelo_of_confirm_own_transfer_pattern(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.zelo_of_confirm_own_transfer_pattern(uuid,text,uuid) to service_role;

create function public.zelo_of_clear_own_transfer_pattern(p_user uuid,p_mode text,p_movement uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare chosen open_finance.movements%rowtype;
begin
  perform open_finance.require_access(p_user,p_mode);
  select * into chosen from open_finance.movements
    where id=p_movement and user_id=p_user and environment='production' and mode=p_mode
      and open_finance.company_visible(user_id,mode,company_id) for update;
  if not found then return false;end if;
  delete from open_finance.own_transfer_patterns p
    where p.user_id=chosen.user_id and p.environment=chosen.environment and p.mode=chosen.mode
      and p.company_id is not distinct from chosen.company_id and p.resource_id=chosen.resource_id
      and p.direction=chosen.direction and p.amount=chosen.amount and p.currency=chosen.currency
      and lower(btrim(p.description))=lower(btrim(chosen.description))
      and p.source_type is not distinct from chosen.source_type;
  update open_finance.movements set user_category=null where id=chosen.id;
  return true;
end;$$;
alter function public.zelo_of_clear_own_transfer_pattern(uuid,text,uuid) owner to zelo_of_workspace;
revoke all on function public.zelo_of_clear_own_transfer_pattern(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.zelo_of_clear_own_transfer_pattern(uuid,text,uuid) to service_role;

-- New bank movements inherit only a pattern that this same holder confirmed.
create function open_finance.apply_own_transfer_pattern() returns trigger
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
begin
  if new.resource_type='account' and new.user_category is null and new.direction in ('debit','credit')
    and exists(select 1 from open_finance.own_transfer_patterns p
      where p.user_id=new.user_id and p.environment=new.environment and p.mode=new.mode
        and p.company_id is not distinct from new.company_id and p.resource_id=new.resource_id
        and p.direction=new.direction and p.amount=new.amount and p.currency=new.currency
        and lower(btrim(p.description))=lower(btrim(new.description))
        and p.source_type is not distinct from new.source_type)
  then new.user_category:='Transferência entre contas próprias';end if;
  return new;
end;$$;
alter function open_finance.apply_own_transfer_pattern() owner to zelo_of_workspace;
revoke all on function open_finance.apply_own_transfer_pattern() from public,anon,authenticated,service_role;
-- The company guard runs first; the imported row already has its company scope.
create trigger zelo_of_transfer_pattern before insert on open_finance.movements
  for each row execute function open_finance.apply_own_transfer_pattern();

-- The existing one-row category writer must honor the selected company too.
create or replace function public.zelo_of_set_movement_category(p_user uuid,p_mode text,p_movement uuid,p_category text) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
begin
  perform open_finance.require_access(p_user,p_mode);
  if p_category is not null and (length(btrim(p_category)) not between 1 and 100 or p_category<>btrim(p_category)) then raise exception 'OF_CATEGORY_INVALID';end if;
  update open_finance.movements set user_category=p_category
    where id=p_movement and user_id=p_user and environment='production' and mode=p_mode
      and open_finance.company_visible(user_id,mode,company_id);
  return found;
end;$$;
alter function public.zelo_of_set_movement_category(uuid,text,uuid,text) owner to zelo_of_workspace;
revoke all on function public.zelo_of_set_movement_category(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.zelo_of_set_movement_category(uuid,text,uuid,text) to service_role;

do $$declare original jsonb;begin
 if not(select public_create from zelo_transfer_migration_privileges) then revoke create on schema public from zelo_of_workspace;end if;
 if not(select private_create from zelo_transfer_migration_privileges) then revoke create on schema open_finance from zelo_of_workspace;end if;
 if not(select effective from zelo_transfer_migration_privileges) then
  if (select own_grant from zelo_transfer_migration_privileges) is null then execute format('revoke zelo_of_workspace from %I granted by %I',current_user,current_user);
  else
   select own_grant into original from zelo_transfer_migration_privileges;
   execute format('grant zelo_of_workspace to %I with admin %s,inherit %s,set %s granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,case when (original->>'inherit')::boolean then 'true' else 'false' end,case when (original->>'set')::boolean then 'true' else 'false' end,current_user);
  end if;
 end if;
end;$$;
commit;
