-- Recoverable company removal; financial history is never deleted.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.companies add column archived_at timestamptz;
create index companies_active_owner_idx on public.companies(user_id,created_at) where archived_at is null;
-- Private maintenance views stop archived schedules without altering their history.
do $$declare t text;begin
 foreach t in array array['reminders','recurring_transactions','appointments'] loop
  execute format('create view public.zelo_active_%I with(security_invoker=true) as select r.* from public.%I r where r.company_id is null or exists(select 1 from public.companies c where c.id=r.company_id and c.user_id=r.user_id and c.archived_at is null)',t,t);
  execute format('revoke all on public.zelo_active_%I from public,anon,authenticated',t);
  execute format('grant select on public.zelo_active_%I to service_role',t);
 end loop;
end;$$;

create function public.zelo_archive_company(p_owner uuid,p_company uuid,p_confirmation text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare company public.companies;next_company uuid;retiring integer:=0;
begin
 perform 1 from public.users where id=p_owner for update;
 select * into company from public.companies where id=p_company and user_id=p_owner for update;
 if company.id is null then raise exception 'COMPANY_NOT_FOUND';end if;
 if p_confirmation is distinct from company.name then raise exception 'COMPANY_CONFIRMATION';end if;
 select id into next_company from public.companies where user_id=p_owner and id<>p_company and archived_at is null order by is_default desc,created_at,id limit 1;
 if company.archived_at is null then
  update public.companies set archived_at=now(),is_default=case when next_company is null then is_default else false end where id=p_company;
  if next_company is not null and company.is_default then update public.companies set is_default=true where id=next_company;end if;
  -- revoking prevents imports immediately; the worker confirms provider cancellation.
  update open_finance.connections set status='revoking',retirement_requested_at=coalesce(retirement_requested_at,now()),retirement_next_attempt_at=least(retirement_next_attempt_at,now()),updated_at=now()
   where user_id=p_owner and company_id=p_company and environment='production' and status not in ('revoked','revoking');
  get diagnostics retiring=row_count;
  update public.wpp_phone_links set active_company_id=null,active_workspace_mode=case when next_company is null and access='both' then 'personal' else null end
   where user_id=p_owner and active_company_id=p_company;
  delete from public.pending_actions where data->>'userId'=p_owner::text and data->>'companyId'=p_company::text and coalesce(data->>'workspaceMode',data->>'mode','business')<>'personal';
  if next_company is null then update public.users set active_mode='personal' where id=p_owner;end if;
 end if;
 return jsonb_build_object('activeCompanyId',next_company,'mode',case when next_company is null then 'personal' else 'business' end,'retiring',retiring);
end;$$;
create function public.zelo_restore_company(p_owner uuid,p_company uuid) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform 1 from public.users where id=p_owner for update;
 if not exists(select 1 from public.companies where id=p_company and user_id=p_owner) then raise exception 'COMPANY_NOT_FOUND';end if;
 if not exists(select 1 from public.companies where user_id=p_owner and archived_at is null) then
  update public.companies set is_default=false where user_id=p_owner and is_default;
  update public.companies set is_default=true where id=p_company;
 end if;
 update public.companies set archived_at=null where id=p_company;
 -- No status change to bank consents: the holder must connect again.
end;$$;
revoke all on function public.zelo_archive_company(uuid,uuid,text),public.zelo_restore_company(uuid,uuid) from public,anon,authenticated;
grant execute on function public.zelo_archive_company(uuid,uuid,text),public.zelo_restore_company(uuid,uuid) to service_role;

-- Lock the holder before the company, like archive. NOWAIT prevents a cycle
-- when an existing-row writer already holds a connection/product row lock.
-- Contended writes fail for retry; the archive never misses a committed insert.
create function public.zelo_company_archived_locked(p_new jsonb,p_old jsonb) returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
declare ids uuid[]:=array[nullif(p_new->>'company_id','')::uuid,nullif(p_old->>'company_id','')::uuid];company public.companies;archived boolean:=false;
begin
 perform 1 from public.users u where u.id in(select c.user_id from public.companies c where c.id=any(ids)) order by u.id for key share nowait;
 for company in select * from public.companies where id=any(ids) order by id for share nowait loop
  archived:=archived or company.archived_at is not null;
 end loop;
 return archived;
end;$$;
revoke all on function public.zelo_company_archived_locked(jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.zelo_company_active_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare row_new jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 row_old jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
begin
 if public.zelo_company_archived_locked(row_new,row_old) then raise exception 'COMPANY_ARCHIVED';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function public.zelo_company_active_guard() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['accounts','finances','tasks','reminders','goals','vehicles','recurring_transactions','employees','customers','appointments','meets','drive_folders','drive_files','card_invoices','nfse_profiles','nfse_services','nfse_drafts'] loop
  -- PostgreSQL orders same-kind triggers by name; validate the final derived scope.
  execute format('create trigger zz_zelo_company_active_guard before insert or update or delete on public.%I for each row execute function public.zelo_company_active_guard()',t);
 end loop;
end;$$;

create function open_finance.archived_company_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare row_new jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 row_old jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 retirement_fields text[]:=array['status','provider_status','revoked_at','updated_at','retirement_requested_at','retirement_attempts','retirement_next_attempt_at','retirement_lease_token','retirement_lease_until','retirement_error_code'];
begin
 -- Cancellation-only changes can safely overlap archive, including orphan cleanup.
 if tg_table_name='connections' and tg_op='INSERT' and row_new->>'status'='revoking' then return new;end if;
 if tg_table_name='connections' and tg_op='UPDATE' and row_new->>'status' in ('revoking','revoked') and row_new-retirement_fields=row_old-retirement_fields then return new;end if;
 if public.zelo_company_archived_locked(row_new,row_old) then raise exception 'COMPANY_ARCHIVED';end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function open_finance.archived_company_guard() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['connections','resources','card_limits','bills','movements','credit_details','sync_state','sync_jobs','card_schedules','notice_deliveries'] loop
  execute format('create trigger zz_zelo_of_archived_company_guard before insert or update or delete on open_finance.%I for each row execute function open_finance.archived_company_guard()',t);
 end loop;
end;$$;

create or replace function open_finance.selected_company(p_user uuid,p_mode text) returns uuid
language plpgsql stable security definer set search_path=pg_catalog as $$
declare headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb; selected uuid;owner uuid;
begin
 if p_mode is null or p_mode not in ('personal','business') then raise exception 'OF_SCOPE_INVALID';end if;
 if headers ? 'x-zelo-owner' or headers ? 'x-zelo-company' then
  if not(headers ? 'x-zelo-owner' and headers ? 'x-zelo-company') then raise exception 'OF_COMPANY_HEADERS_INVALID';end if;
  owner:=nullif(headers->>'x-zelo-owner','')::uuid;selected:=nullif(headers->>'x-zelo-company','')::uuid;
  if owner is null or selected is null or owner<>p_user or not exists(select 1 from public.companies where id=selected and user_id=owner and (p_mode='personal' or archived_at is null)) then raise exception 'OF_COMPANY_ACCESS_DENIED';end if;
 else
  select id into selected from public.companies where user_id=p_user and (p_mode='personal' or archived_at is null) order by is_default desc,created_at,id limit 1;
  if selected is null then raise exception 'OF_COMPANY_ACCESS_DENIED';end if;
 end if;
 return case when p_mode='business' then selected else null end;
end;$$;
-- A provider creation that overlaps company removal must still enter cancellation.
-- This server-only operation never grants access to the consent or its data.
create function public.zelo_of_register_retirement(p_owner uuid,p_company uuid,p_mode text,p_consent jsonb) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
begin
 if p_mode not in ('personal','business') or p_consent->>'cliente_user_id' is distinct from p_owner::text then raise exception 'OF_OWNER_INVALID';end if;
 if not exists(select 1 from public.companies where id=p_company and user_id=p_owner) then raise exception 'COMPANY_NOT_FOUND';end if;
 perform (p_consent->>'id')::uuid;perform (p_consent->>'institution_id')::uuid;
 insert into open_finance.connections(user_id,company_id,environment,mode,external_consent_id,institution_id,institution_name,status,scopes,retirement_requested_at)
 values(p_owner,case when p_mode='business' then p_company else null end,'production',p_mode,p_consent->>'id',p_consent->>'institution_id',p_consent->>'institution_name','revoking',array(select jsonb_array_elements_text(p_consent->'products')),now())
 on conflict(provider,environment,external_consent_id) do update set status='revoking',retirement_requested_at=coalesce(open_finance.connections.retirement_requested_at,now()),updated_at=now()
 where open_finance.connections.user_id=p_owner and open_finance.connections.company_id is not distinct from excluded.company_id;
 if not found then raise exception 'OF_OWNER_INVALID';end if;
end;$$;
revoke all on function public.zelo_of_register_retirement(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.zelo_of_register_retirement(uuid,uuid,text,jsonb) to service_role;
commit;
