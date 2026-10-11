-- Disable MULTI_COMPANY_ENABLED first. Never discard another company's bank history.
begin;
set local lock_timeout='5s';set local statement_timeout='60s';
do $$declare t text;found_history boolean;begin
 foreach t in array array['connections','resources','card_limits','bills','movements','credit_details','sync_state','sync_jobs','card_schedules','notice_deliveries'] loop
  execute format('select exists(select 1 from open_finance.%I bank join public.companies c on c.id=bank.company_id where not c.is_default)',t) into found_history;
  if found_history then raise exception 'OF_WORKSPACE_HISTORY_REQUIRES_FORWARD_FIX';end if;
 end loop;
 execute format('grant zelo_of_workspace to %I',current_user);
end;$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p where p.proowner=(select oid from pg_roles where rolname='zelo_of_workspace') loop
  execute format('alter function %s owner to %I',f.signature,current_user);
  execute format('alter function %s set row_security=off',f.signature);
 end loop;
end;$$;
alter view open_finance.agenda_items reset(security_invoker);
do $$declare t text;begin
 foreach t in array array['connections','resources','card_limits','bills','movements','credit_details','sync_state','sync_jobs','card_schedules','notice_deliveries'] loop
  execute format('drop trigger zelo_of_company_guard on open_finance.%I',t);
  execute format('drop policy zelo_workspace on open_finance.%I',t);
  execute format('alter table open_finance.%I drop column company_id',t);
 end loop;
end;$$;
drop policy zelo_workspace_access on open_finance.user_access;
drop policy zelo_workspace_health on open_finance.worker_health;
drop function open_finance.company_guard();
drop function open_finance.company_visible(uuid,text,uuid);
drop function open_finance.selected_company(uuid,text);
drop owned by zelo_of_workspace;
drop role zelo_of_workspace;

create or replace function public.zelo_of_event_target(p_reference text,p_family text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare matches integer; target record;
begin
  if length(p_reference)>200 then raise exception 'OF_REFERENCE_INVALID'; end if;
  if p_family='consents' then
    select count(*) into matches from open_finance.connections where environment='production' and external_consent_id=p_reference;
    select id,user_id,mode,status into target from open_finance.connections where environment='production' and external_consent_id=p_reference;
  else
    select count(distinct c.id) into matches from open_finance.connections c join open_finance.resources r on r.connection_id=c.id where c.environment='production' and r.external_id=p_reference and r.subtype=p_family;
    select distinct c.id,c.user_id,c.mode,c.status into target from open_finance.connections c join open_finance.resources r on r.connection_id=c.id where c.environment='production' and r.external_id=p_reference and r.subtype=p_family;
  end if;
  if matches=0 then return null; end if;
  if matches<>1 then raise exception 'OF_TARGET_AMBIGUOUS'; end if;
  return jsonb_build_object('id',target.id,'userId',target.user_id,'mode',target.mode,'status',target.status);
end $$;

create or replace function public.zelo_of_worker_scope(p_mode text,p_owner_email text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare target uuid;
begin
  if p_mode is null or p_mode not in ('personal','business') then raise exception 'OF_SCOPE_INVALID'; end if;
  insert into open_finance.worker_health(mode,last_seen_at) values(p_mode,now()) on conflict(mode) do update set last_seen_at=now();
  select j.user_id into target from open_finance.sync_jobs j
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
  if target is null then return null; end if;
  return jsonb_build_object('userId',target,'mode',p_mode,'environment','production');
end $$;

create or replace function public.zelo_of_notice_targets(p_owner_email text default null) returns jsonb
language sql stable security definer set search_path=pg_catalog set row_security=off as $$
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (
    select i.user_id as "userId",i.mode,i.item_key as "itemKey",p.phone
    from open_finance.agenda_items i join open_finance.user_access a on a.user_id=i.user_id join public.users u on u.id=i.user_id join public.wpp_phone_links p on p.user_id=i.user_id
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
declare r record; k text; queued integer:=0;
begin
  for r in select resource.id,resource.user_id,resource.mode,resource.connection_id,resource.external_id from open_finance.resources resource
    join open_finance.connections c on c.id=resource.connection_id join open_finance.user_access a on a.user_id=resource.user_id join public.users u on u.id=resource.user_id
    where resource.resource_type='card' and resource.environment='production' and 'CREDIT_CARD_ACCOUNT'=any(c.scopes) and c.status='active' and (c.consent_expires_at is null or c.consent_expires_at>now()) and a.enabled and a.country_code='BR' and a.country_verified_at is not null and u.status='active'
      and (resource.mode='personal' or u.plan='business' or (nullif(btrim(p_owner_email),'') is not null and lower(btrim(u.email))=lower(btrim(p_owner_email))))
      and exists(select 1 from unnest(array['recurrings','installments','bills']) needed(kind) where not exists(select 1 from open_finance.sync_jobs j where j.connection_id=c.id and j.external_resource_id=resource.external_id and j.kind=needed.kind and (j.status in ('pending','running') or j.updated_at>now()-interval '12 hours')))
    order by resource.synced_at,resource.id limit 20
  loop
    for k in select unnest(array['recurrings','installments','bills']) loop
      if not exists(select 1 from open_finance.sync_jobs where connection_id=r.connection_id and external_resource_id=r.external_id and kind=k and (status in ('pending','running') or updated_at>now()-interval '12 hours')) then
        perform public.zelo_of_enqueue(r.user_id,r.mode,r.connection_id,jsonb_build_object('kind',k,'family','credit-cards','external_resource_id',r.external_id,'window','{}'::jsonb));queued:=queued+1;
      end if;
    end loop;
  end loop;
  return queued;
end $$;
commit;
