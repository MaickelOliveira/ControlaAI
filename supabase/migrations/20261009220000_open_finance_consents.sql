begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table open_finance.connections drop constraint connections_status_check;
alter table open_finance.connections add constraint connections_status_check check(status in ('pending','active','expired','revoking','revoked','error'));
alter table open_finance.connections add column terms_accepted_at timestamptz;
alter table open_finance.connections add column journey_version text check(length(journey_version)<=60);
alter table open_finance.connections add column purpose_version text check(length(purpose_version)<=60);

create function open_finance.require_access(p_user uuid,p_mode text) returns void
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
begin
  if p_mode is null or p_mode not in ('personal','business') then raise exception 'OF_SCOPE_INVALID'; end if;
  if not exists(select 1 from open_finance.user_access where user_id=p_user and enabled and country_code='BR' and country_verified_at is not null) then raise exception 'OF_ACCESS_DENIED'; end if;
end $$;
revoke all on function open_finance.require_access(uuid,text) from public,anon,authenticated,service_role;

create function public.zelo_of_save_consent(p_user uuid,p_mode text,p_consent jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare result open_finance.connections; products text[]; mapped text;
begin
  perform open_finance.require_access(p_user,p_mode);
  if p_consent->>'cliente_user_id' is distinct from p_user::text or length(p_consent::text)>10000 then raise exception 'OF_CONSENT_INVALID'; end if;
  if (p_consent->>'id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or (p_consent->>'institution_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'OF_CONSENT_INVALID'; end if;
  select array_agg(value) into products from jsonb_array_elements_text(p_consent->'products');
  if products is null or cardinality(products)=0 or not(products <@ array['ACCOUNT','CREDIT_CARD_ACCOUNT','CREDIT_OPERATIONS','INVESTMENTS']) then raise exception 'OF_CONSENT_INVALID'; end if;
  mapped:=case p_consent->>'status' when 'AUTHORISED' then 'active' when 'AWAITING_AUTHORIZATION' then 'pending' when 'EXPIRED' then 'expired' when 'REJECTED' then 'error' else null end;
  if mapped is null then raise exception 'OF_CONSENT_INVALID'; end if;
  insert into open_finance.connections(user_id,environment,mode,external_consent_id,institution_id,institution_name,status,provider_status,scopes,terms_accepted_at,journey_version,purpose_version)
  values(p_user,'production',p_mode,p_consent->>'id',p_consent->>'institution_id',p_consent->>'institution_name',mapped,p_consent->>'status',products,now(),'celcoin-2026-10','celcoin-2026-10')
  on conflict(provider,environment,external_consent_id) do update set updated_at=now()
    where connections.user_id=p_user and connections.mode=p_mode and connections.status not in ('revoked','revoking') and connections.scopes=products
  returning * into result;
  if result.id is null then raise exception 'OF_CONSENT_ALREADY_CLAIMED'; end if;
  return jsonb_build_object('id',result.id,'status',result.status);
end $$;

create function public.zelo_of_connection(p_user uuid,p_mode text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare result open_finance.connections;
begin
  perform open_finance.require_access(p_user,p_mode);
  select * into result from open_finance.connections where id=p_id and user_id=p_user and environment='production' and mode=p_mode;
  if result.id is null then raise exception 'OF_CONNECTION_NOT_FOUND'; end if;
  return to_jsonb(result);
end $$;

create function public.zelo_of_set_status(p_user uuid,p_mode text,p_id uuid,p_status text,p_provider_status text) returns void
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare current_status text;
begin
  perform open_finance.require_access(p_user,p_mode);
  select status into current_status from open_finance.connections where id=p_id and user_id=p_user and environment='production' and mode=p_mode for update;
  if current_status is null then raise exception 'OF_CONNECTION_NOT_FOUND'; end if;
  if p_status is null or p_status not in ('pending','active','expired','error','revoking','revoked') then raise exception 'OF_STATUS_INVALID'; end if;
  if current_status='revoked' or (current_status='revoking' and p_status<>'revoked') then return; end if;
  if p_status='revoked' and current_status<>'revoking' then raise exception 'OF_STATUS_INVALID'; end if;
  update open_finance.connections set status=p_status,provider_status=coalesce(p_provider_status,provider_status),revoked_at=case when p_status='revoked' then now() else revoked_at end,updated_at=now()
    where id=p_id and user_id=p_user and environment='production' and mode=p_mode;
end $$;

revoke all on function public.zelo_of_save_consent(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.zelo_of_connection(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.zelo_of_set_status(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.zelo_of_save_consent(uuid,text,jsonb) to service_role;
grant execute on function public.zelo_of_connection(uuid,text,uuid) to service_role;
grant execute on function public.zelo_of_set_status(uuid,text,uuid,text,text) to service_role;
commit;
