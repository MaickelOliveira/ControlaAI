-- Bank products keep their identity and inherit the company of their consent.
-- The RPC owner is deliberately subject to RLS; service credentials cannot bypass it.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$begin
 if exists(select 1 from pg_roles where rolname='zelo_of_workspace') then raise exception 'OF_WORKSPACE_ROLE_ALREADY_EXISTS';end if;
 create role zelo_of_workspace nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
 execute format('grant zelo_of_workspace to %I',current_user);
end;$$;
grant usage,create on schema public,open_finance to zelo_of_workspace;
grant select on public.users,public.wpp_phone_links to zelo_of_workspace;

create function open_finance.selected_company(p_user uuid,p_mode text) returns uuid
language plpgsql stable security definer set search_path=pg_catalog as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb; selected uuid;owner uuid;
begin
 if p_mode is null or p_mode not in ('personal','business') then raise exception 'OF_SCOPE_INVALID';end if;
 if headers ? 'x-zelo-owner' or headers ? 'x-zelo-company' then
  if not(headers ? 'x-zelo-owner' and headers ? 'x-zelo-company') then raise exception 'OF_COMPANY_HEADERS_INVALID';end if;
  owner:=nullif(headers->>'x-zelo-owner','')::uuid;selected:=nullif(headers->>'x-zelo-company','')::uuid;
  if owner is null or selected is null or owner<>p_user or not exists(select 1 from public.companies where id=selected and user_id=owner) then raise exception 'OF_COMPANY_ACCESS_DENIED';end if;
 else
  select id into selected from public.companies where user_id=p_user and is_default;
  if selected is null then raise exception 'OF_COMPANY_ACCESS_DENIED';end if;
 end if;
 return case when p_mode='business' then selected else null end;
end;$$;
create function open_finance.company_visible(p_user uuid,p_mode text,p_company uuid) returns boolean
language plpgsql stable security definer set search_path=pg_catalog as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
begin
 if headers ? 'x-zelo-owner' and headers ? 'x-zelo-company' and (headers->>'x-zelo-owner')::uuid<>p_user then return false;end if;
 return p_company is not distinct from open_finance.selected_company(p_user,p_mode);
end;
$$;
revoke all on function open_finance.selected_company(uuid,text),open_finance.company_visible(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function open_finance.selected_company(uuid,text),open_finance.company_visible(uuid,text,uuid) to zelo_of_workspace;

-- Production enables RLS on these owner records without client policies.
-- The NOLOGIN RPC role may read only its verified holder (legacy server calls
-- without workspace headers retain the existing require_access checks).
create policy zelo_workspace_owner on public.users for select to zelo_of_workspace
 using(open_finance.company_visible(id,'personal',null));
create policy zelo_workspace_phones on public.wpp_phone_links for select to zelo_of_workspace
 using(open_finance.company_visible(user_id,'personal',null));

do $$declare t text;begin
 foreach t in array array['connections','resources','card_limits','bills','movements','credit_details','sync_state','sync_jobs','card_schedules','notice_deliveries'] loop
  execute format('alter table open_finance.%I add column company_id uuid, add constraint %I foreign key(company_id,user_id) references public.companies(id,user_id)',t,t||'_company_owner_fk');
  execute format('update open_finance.%I r set company_id=c.id from public.companies c where c.user_id=r.user_id and c.is_default and r.mode=''business''',t);
  execute format('create index %I on open_finance.%I(user_id,company_id)',t||'_workspace_idx',t);
  execute format('create policy zelo_workspace on open_finance.%I for all to zelo_of_workspace using(open_finance.company_visible(user_id,mode,company_id)) with check(open_finance.company_visible(user_id,mode,company_id))',t);
  execute format('grant select,insert,update,delete on open_finance.%I to zelo_of_workspace',t);
 end loop;
end;$$;
create policy zelo_workspace_access on open_finance.user_access for all to zelo_of_workspace
 using(open_finance.company_visible(user_id,'personal',null)) with check(open_finance.company_visible(user_id,'personal',null));
grant select,update on open_finance.user_access to zelo_of_workspace;
create policy zelo_workspace_health on open_finance.worker_health for select to zelo_of_workspace using(true);
grant select on open_finance.worker_health to zelo_of_workspace;

-- jsonb_populate_record writes null explicitly: defaults alone cannot inherit a scope.
create function open_finance.company_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare payload jsonb:=to_jsonb(new); parent_scope uuid;parent_owner uuid;parent_mode text;link record;parent_id uuid;
begin
 if tg_table_name='connections' then
  if new.company_id is null then new.company_id:=open_finance.selected_company(new.user_id,new.mode);end if;
 elsif tg_table_name='notice_deliveries' then
  parent_id:=split_part(new.item_key,':',2)::uuid;
  if split_part(new.item_key,':',1)='bill' then select user_id,mode,company_id into parent_owner,parent_mode,parent_scope from open_finance.bills where id=parent_id;
  else select user_id,mode,company_id into parent_owner,parent_mode,parent_scope from open_finance.card_schedules where id=parent_id;end if;
  if not found or parent_owner<>new.user_id or parent_mode<>new.mode or (new.company_id is not null and new.company_id is distinct from parent_scope) then raise exception 'OF_COMPANY_PARENT_MISMATCH';end if;
  new.company_id:=parent_scope;
 else
  if payload->>'connection_id' is not null then
   select user_id,mode,company_id into parent_owner,parent_mode,parent_scope from open_finance.connections where id=(payload->>'connection_id')::uuid;
  else
   select user_id,mode,company_id into parent_owner,parent_mode,parent_scope from open_finance.resources where id=(payload->>'resource_id')::uuid;
  end if;
  if not found or parent_owner<>new.user_id or parent_mode<>new.mode or (new.company_id is not null and new.company_id is distinct from parent_scope) then raise exception 'OF_COMPANY_PARENT_MISMATCH';end if;
  new.company_id:=parent_scope;
  for link in select * from(values('parent_resource_id','resources'),('bill_id','bills'),('last_job_id','sync_jobs'))x(field,relation) loop
   parent_id:=nullif(payload->>link.field,'')::uuid;
   if parent_id is not null then
    execute format('select user_id,mode,company_id from open_finance.%I where id=$1',link.relation) into parent_owner,parent_mode,parent_scope using parent_id;
    if parent_owner is null or parent_owner<>new.user_id or parent_mode<>new.mode or parent_scope is distinct from new.company_id then raise exception 'OF_COMPANY_PARENT_MISMATCH';end if;
   end if;
  end loop;
 end if;
 if new.mode='personal' and new.company_id is not null or new.mode='business' and new.company_id is null then raise exception 'OF_COMPANY_MODE_MISMATCH';end if;
 if new.company_id is not null and not exists(select 1 from public.companies where id=new.company_id and user_id=new.user_id) then raise exception 'OF_COMPANY_ACCESS_DENIED';end if;
 if tg_op='UPDATE' and (new.user_id<>old.user_id or new.mode<>old.mode or new.company_id is distinct from old.company_id) then raise exception 'OF_COMPANY_REASSIGNMENT_DENIED';end if;
 return new;
end;$$;
revoke all on function open_finance.company_guard() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['connections','resources','card_limits','bills','movements','credit_details','sync_state','sync_jobs','card_schedules','notice_deliveries'] loop
  execute format('create trigger zelo_of_company_guard before insert or update on open_finance.%I for each row execute function open_finance.company_guard()',t);
 end loop;
end;$$;

-- Every scoped definer, including private helpers and the older overview, uses RLS.
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'zelo_of_%'
 and p.proname<>all(array['zelo_of_access','zelo_of_enable_brazil','zelo_of_event_target','zelo_of_worker_scope','zelo_of_notice_targets','zelo_of_prepare_schedules','zelo_of_claim_retirement','zelo_of_finish_retirement']) loop
  execute format('alter function %s owner to zelo_of_workspace',f.signature);
  execute format('alter function %s set row_security=on',f.signature);
  execute format('grant execute on function %s to zelo_of_workspace',f.signature);
 end loop;
end;$$;
alter function open_finance.require_access(uuid,text) owner to zelo_of_workspace;
alter function open_finance.require_access(uuid,text) set row_security=on;
-- A managed database's migrator may not be a superuser or inherit service_role.
do $$begin execute format('grant execute on function public.zelo_of_enqueue(uuid,text,uuid,jsonb) to %I',current_user);end;$$;
revoke create on schema public,open_finance from zelo_of_workspace;
grant execute on function open_finance.require_access(uuid,text),open_finance.pick(jsonb,text[]) to zelo_of_workspace;
alter view open_finance.agenda_items set(security_invoker=true);
grant select on open_finance.agenda_items to zelo_of_workspace;
do $$begin execute format('revoke zelo_of_workspace from %I',current_user);end;$$;

create or replace function public.zelo_of_event_target(p_reference text,p_family text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare matches integer; target record;
begin
  if length(p_reference)>200 then raise exception 'OF_REFERENCE_INVALID'; end if;
  if p_family='consents' then
    select count(*) into matches from open_finance.connections where environment='production' and external_consent_id=p_reference;
    select id,user_id,mode,status,company_id into target from open_finance.connections where environment='production' and external_consent_id=p_reference;
  else
    select count(distinct c.id) into matches from open_finance.connections c join open_finance.resources r on r.connection_id=c.id where c.environment='production' and r.external_id=p_reference and r.subtype=p_family;
    select distinct c.id,c.user_id,c.mode,c.status,c.company_id into target from open_finance.connections c join open_finance.resources r on r.connection_id=c.id where c.environment='production' and r.external_id=p_reference and r.subtype=p_family;
  end if;
  if matches=0 then return null; end if;
  if matches<>1 then raise exception 'OF_TARGET_AMBIGUOUS'; end if;
  return jsonb_build_object('id',target.id,'userId',target.user_id,'mode',target.mode,'status',target.status,'companyId',target.company_id);
end $$;

create or replace function public.zelo_of_worker_scope(p_mode text,p_owner_email text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare target record;
begin
  if p_mode is null or p_mode not in ('personal','business') then raise exception 'OF_SCOPE_INVALID'; end if;
  insert into open_finance.worker_health(mode,last_seen_at) values(p_mode,now()) on conflict(mode) do update set last_seen_at=now();
  select j.user_id,j.company_id into target from open_finance.sync_jobs j
  join open_finance.connections c on c.id=j.connection_id
  join open_finance.user_access a on a.user_id=j.user_id
  join public.users u on u.id=j.user_id
  where j.environment='production' and j.mode=p_mode and a.enabled and a.country_code='BR' and a.country_verified_at is not null
    and u.status='active' and (p_mode='personal' or u.plan='business' or (nullif(btrim(p_owner_email),'') is not null and lower(btrim(u.email))=lower(btrim(p_owner_email))))
    and (a.next_sync_claim_at is null or a.next_sync_claim_at<=now())
    and c.status not in ('revoked','revoking') and (c.status='active' or j.kind='consent')
    and j.available_at<=now() and (j.status='pending' or (j.status='running' and j.lease_until<now()))
    and not exists(select 1 from open_finance.sync_jobs running where running.user_id=j.user_id and running.status='running' and running.lease_until>now())
  order by j.available_at,j.updated_at,j.id limit 1;
  if not found then return null; end if;
  return jsonb_build_object('userId',target.user_id,'companyId',target.company_id,'mode',p_mode,'environment','production');
end $$;

create or replace function public.zelo_of_notice_targets(p_owner_email text default null) returns jsonb
language sql stable security definer set search_path=pg_catalog set row_security=off as $$
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (
    select i.user_id as "userId",r.company_id as "companyId",i.mode,i.item_key as "itemKey",p.phone
    from open_finance.agenda_items i join open_finance.resources r on r.id=i.resource_id join open_finance.user_access a on a.user_id=i.user_id join public.users u on u.id=i.user_id join public.wpp_phone_links p on p.user_id=i.user_id
    where i.kind in ('bill','recurring') and i.due_date=(now() at time zone 'America/Sao_Paulo')::date and i.amount>0 and i.synced_at between now()-interval '36 hours' and now()
      and (i.kind<>'recurring' or i.regularity_score>=0.8)
      and a.enabled and a.country_code='BR' and a.country_verified_at is not null and u.status='active'
      and (i.mode='personal' or u.plan='business' or (nullif(btrim(p_owner_email),'') is not null and lower(btrim(u.email))=lower(btrim(p_owner_email))))
      and p.access in (i.mode,'both') and p.phone ~ '^[0-9]{8,20}$'
      and not exists(select 1 from open_finance.notice_deliveries d where d.user_id=i.user_id and d.mode=i.mode and d.item_key=i.item_key and d.occurrence_date=i.due_date and d.phone=p.phone)
    order by i.due_date,i.user_id,i.mode,i.item_key,p.phone limit 20
  ) t;
$$;

create or replace function public.zelo_of_prepare_schedules(p_owner_email text default null) returns integer
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare r record; k text; queued integer:=0; original_headers text:=current_setting('request.headers',true);
begin
  for r in select resource.id,resource.user_id,resource.mode,resource.company_id,resource.connection_id,resource.external_id from open_finance.resources resource
    join open_finance.connections c on c.id=resource.connection_id join open_finance.user_access a on a.user_id=resource.user_id join public.users u on u.id=resource.user_id
    where resource.resource_type='card' and resource.environment='production' and 'CREDIT_CARD_ACCOUNT'=any(c.scopes) and c.status='active' and (c.consent_expires_at is null or c.consent_expires_at>now()) and a.enabled and a.country_code='BR' and a.country_verified_at is not null and u.status='active'
      and (resource.mode='personal' or u.plan='business' or (nullif(btrim(p_owner_email),'') is not null and lower(btrim(u.email))=lower(btrim(p_owner_email))))
      and exists(select 1 from unnest(array['recurrings','installments','bills']) needed(kind) where not exists(select 1 from open_finance.sync_jobs j where j.connection_id=c.id and j.external_resource_id=resource.external_id and j.kind=needed.kind and (j.status in ('pending','running') or j.updated_at>now()-interval '12 hours')))
    order by resource.synced_at,resource.id limit 20
  loop
    perform set_config('request.headers',jsonb_build_object('x-zelo-owner',r.user_id,'x-zelo-company',coalesce(r.company_id,(select id from public.companies where user_id=r.user_id and is_default)))::text,true);
    for k in select unnest(array['recurrings','installments','bills']) loop
      if not exists(select 1 from open_finance.sync_jobs where connection_id=r.connection_id and external_resource_id=r.external_id and kind=k and (status in ('pending','running') or updated_at>now()-interval '12 hours')) then
        perform public.zelo_of_enqueue(r.user_id,r.mode,r.connection_id,jsonb_build_object('kind',k,'family','credit-cards','external_resource_id',r.external_id,'window','{}'::jsonb));queued:=queued+1;
      end if;
    end loop;
  end loop;
  perform set_config('request.headers',coalesce(original_headers,'{}'),true);
  return queued;
exception when others then
 perform set_config('request.headers',coalesce(original_headers,'{}'),true);raise;
end $$;
commit;
