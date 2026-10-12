-- Never merge independent workspace history back into one resource.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$begin
 if exists(select 1 from open_finance.resources group by user_id,environment,resource_type,external_id having count(*)>1) then raise exception 'OF_SCOPE_HISTORY_REQUIRES_FORWARD_FIX';end if;
end;$$;
do $$begin execute format('grant zelo_of_workspace to %I',current_user);end;$$;
do $$declare definition text;begin
 select pg_get_functiondef('public.zelo_of_commit_page(uuid,text,uuid,uuid,jsonb,text,jsonb)'::regprocedure) into definition;
 if position('on conflict(user_id,environment,mode,company_id,resource_type,external_id)' in definition)=0 then raise exception 'OF_COMMIT_DEFINITION_CHANGED';end if;
 definition:=replace(definition,'on conflict(user_id,environment,mode,company_id,resource_type,external_id)','on conflict(user_id,environment,resource_type,external_id)');
 definition:=replace(definition,'where user_id=p_user and environment=''production'' and mode=p_mode and company_id is not distinct from c.company_id and resource_type=row->>''resource_type'' and external_id=row->>''external_id'';','where user_id=p_user and environment=''production'' and resource_type=row->>''resource_type'' and external_id=row->>''external_id'';');
 execute definition;
end;$$;
do $$begin execute format('revoke zelo_of_workspace from %I',current_user);end;$$;
alter table open_finance.resources drop constraint resources_workspace_external_key;
alter table open_finance.resources add unique(user_id,environment,resource_type,external_id);
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

commit;
