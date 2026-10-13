-- Dormant immutable local intent/provenance. No historical origin is inferred.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table google_workspace.event_origins (
 event_id uuid primary key,
 user_id uuid not null references public.users(id) on delete cascade,
 mode text not null check(mode in ('personal','business')),
 company_id uuid,
 binding_id uuid not null,
 grant_id uuid not null,
 binding_version bigint not null check(binding_version>0),
 calendar_id text not null check(length(btrim(calendar_id))>0 and length(calendar_id)<=1024 and calendar_id !~ '[[:cntrl:]]'),
 remote_event_id text not null unique check(remote_event_id ~ '^[a-f0-9]{64}$'),
 conference_request_id text not null unique check(conference_request_id ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 check((mode='personal' and company_id is null) or (mode='business' and company_id is not null)),
 foreign key(company_id,user_id) references public.companies(id,user_id),
 foreign key(binding_id,user_id) references google_workspace.bindings(id,user_id),
 foreign key(grant_id,user_id) references google_workspace.grants(id,user_id)
);
alter table google_workspace.event_origins enable row level security;
revoke all on google_workspace.event_origins from public,anon,authenticated,service_role;
grant select,insert on google_workspace.event_origins to service_role;

create function google_workspace.event_retry_id(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_conference boolean)
returns text language plpgsql immutable security invoker set search_path=pg_catalog as $$
declare domain text;workspace text;
begin
 if p_user_id is null or p_event_id is null or p_conference is null or p_mode is null or p_mode not in ('personal','business')
  or (p_mode='personal' and p_company_id is not null) or (p_mode='business' and p_company_id is null) then raise exception 'GOOGLE_EVENT_INVALID';end if;
 domain=case when p_conference then 'zelo-google-conference-v1' else 'zelo-google-event-v1' end;
 workspace=p_user_id::text||':'||p_mode||':'||coalesce(p_company_id::text,'personal');
 -- PostgreSQL text cannot contain NUL; hash the same UTF-8/zero bytes as Node.
 return encode(sha256(convert_to(domain,'UTF8')||decode('00','hex')||convert_to(workspace,'UTF8')||decode('00','hex')||convert_to(p_event_id::text,'UTF8')),'hex');
end;$$;

create function google_workspace.event_origin_metadata(e google_workspace.event_origins)
returns jsonb language sql immutable strict security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('event_id',e.event_id,'user_id',e.user_id,'mode',e.mode,'company_id',e.company_id,
  'binding_id',e.binding_id,'grant_id',e.grant_id,'binding_version',e.binding_version::text,
  'calendar_id',e.calendar_id,'remote_event_id',e.remote_event_id,'conference_request_id',e.conference_request_id);
$$;

-- Metadata/history only. A future provider adapter must authorize the local row
-- and recheck the active exact binding/grant before using its captured calendar.
create function public.zelo_google_event_origin_get(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare e google_workspace.event_origins%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 if p_event_id is null then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select * into e from google_workspace.event_origins where event_id=p_event_id and user_id=p_user_id and mode=p_mode and company_id is not distinct from p_company_id;
 if not found then return null;end if;
 return google_workspace.event_origin_metadata(e);
end;$$;

create function public.zelo_google_event_origin_reserve(
 p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_binding_id uuid,p_grant_id uuid,
 p_binding_version bigint,p_client_fingerprint text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare e google_workspace.event_origins%rowtype;b google_workspace.bindings%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if p_event_id is null or p_binding_id is null or p_grant_id is null or p_binding_version is null or p_binding_version<=0
  or p_client_fingerprint is null or p_client_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select x.* into b from google_workspace.bindings x join google_workspace.grants g on g.id=x.grant_id and g.user_id=x.user_id
  where x.user_id=p_user_id and x.mode=p_mode and x.company_id is not distinct from p_company_id and x.unlinked_at is null and g.client_fingerprint=p_client_fingerprint;
 if b.id is null or b.id<>p_binding_id or b.grant_id<>p_grant_id or b.version<>p_binding_version then raise exception 'GOOGLE_EVENT_CONNECTION_CHANGED';end if;
 select * into e from google_workspace.event_origins where event_id=p_event_id;
 if found then
  if e.user_id<>p_user_id or e.mode<>p_mode or e.company_id is distinct from p_company_id or e.binding_id<>p_binding_id or e.grant_id<>p_grant_id or e.binding_version<>p_binding_version
   then raise exception 'GOOGLE_EVENT_ORIGIN_CONFLICT';end if;
  return google_workspace.event_origin_metadata(e);
 end if;
 insert into google_workspace.event_origins(event_id,user_id,mode,company_id,binding_id,grant_id,binding_version,calendar_id,remote_event_id,conference_request_id)
 values(p_event_id,p_user_id,p_mode,p_company_id,b.id,b.grant_id,b.version,b.calendar_id,
  google_workspace.event_retry_id(p_user_id,p_mode,p_company_id,p_event_id,false),google_workspace.event_retry_id(p_user_id,p_mode,p_company_id,p_event_id,true)) returning * into e;
 return google_workspace.event_origin_metadata(e);
end;$$;

revoke all on function google_workspace.event_retry_id(uuid,text,uuid,uuid,boolean),google_workspace.event_origin_metadata(google_workspace.event_origins),
 public.zelo_google_event_origin_get(uuid,text,uuid,uuid),public.zelo_google_event_origin_reserve(uuid,text,uuid,uuid,uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function google_workspace.event_retry_id(uuid,text,uuid,uuid,boolean),google_workspace.event_origin_metadata(google_workspace.event_origins),
 public.zelo_google_event_origin_get(uuid,text,uuid,uuid),public.zelo_google_event_origin_reserve(uuid,text,uuid,uuid,uuid,uuid,bigint,text) to service_role;
commit;
