-- Dormant creation recovery only. No provider call, public consumer or legacy copy.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table google_workspace.event_creations (
 event_id uuid primary key references google_workspace.event_origins(event_id) on delete cascade,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=32768),
 with_meet boolean not null,
 state text not null default 'queued' check(state in ('queued','running','waiting','succeeded','failed')),
 attempt_version bigint not null default 0 check(attempt_version>=0),
 round_attempts integer not null default 0 check(round_attempts between 0 and 10 and round_attempts<=attempt_version),
 authorized_binding_version bigint not null check(authorized_binding_version>0),
 lease_id uuid,
 lease_until timestamptz,
 lease_binding_version bigint check(lease_binding_version>0),
 insert_allowed boolean,
 was_attempted boolean not null default false,
 remote_known boolean not null default false,
 etag text check(length(etag) between 1 and 1024 and etag !~ '[[:cntrl:]]'),
 meet_link text check(meet_link ~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
 failure_code text check(failure_code in ('TEMPORARY','FOREIGN_EVENT','REMOTE_MISSING','CONFERENCE_FAILED','CONNECTION_CHANGED','ATTEMPTS_EXHAUSTED')),
 created_at timestamptz not null default clock_timestamp(),
 check((state='running' and lease_id is not null and lease_until is not null and isfinite(lease_until) and lease_binding_version is not null and insert_allowed is not null)
   or (state<>'running' and lease_id is null and lease_until is null and lease_binding_version is null and insert_allowed is null)),
 check(not remote_known or (was_attempted and etag is not null)),
 check(etag is null or remote_known),
 check(meet_link is null or (with_meet and remote_known)),
 check(state<>'succeeded' or (remote_known and (not with_meet or meet_link is not null))),
 check(state<>'waiting' or (with_meet and remote_known and meet_link is null)),
 check(state<>'failed' or failure_code is not null)
);
alter table google_workspace.event_creations enable row level security;
revoke all on google_workspace.event_creations from public,anon,authenticated,service_role;
grant select,insert on google_workspace.event_creations to service_role;
-- The backend cannot update an origin, its payload or the original request kind.
grant update(state,attempt_version,round_attempts,authorized_binding_version,lease_id,lease_until,lease_binding_version,insert_allowed,was_attempted,remote_known,etag,meet_link,failure_code)
 on google_workspace.event_creations to service_role;

create function google_workspace.event_creation_metadata(c google_workspace.event_creations)
returns jsonb language sql immutable strict security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('event_id',c.event_id,'payload',c.payload,
  'payload_fingerprint',encode(sha256(convert_to(c.payload::text,'UTF8')),'hex'),'with_meet',c.with_meet,'state',c.state,
  'attempt_version',c.attempt_version::text,'round_attempts',c.round_attempts,'authorized_binding_version',c.authorized_binding_version::text,
  'lease_id',c.lease_id,'lease_until',c.lease_until,'lease_binding_version',c.lease_binding_version::text,'insert_allowed',c.insert_allowed,
  'was_attempted',c.was_attempted,'remote_known',c.remote_known,'etag',c.etag,'meet_link',c.meet_link,'failure_code',c.failure_code);
$$;

-- Exact current binding revision comes from the scoped runtime, not a body/model.
-- This locks only storage; the worker performs Google calls after commit.
create function google_workspace.event_creation_context(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_client_fingerprint text,p_binding_version bigint)
returns google_workspace.event_origins language plpgsql security invoker set search_path=pg_catalog as $$
declare e google_workspace.event_origins%rowtype;b google_workspace.bindings%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if p_event_id is null or p_client_fingerprint is null or p_client_fingerprint !~ '^[a-f0-9]{64}$'
  or p_binding_version is null or p_binding_version<=0 then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select * into e from google_workspace.event_origins where event_id=p_event_id and user_id=p_user_id and mode=p_mode and company_id is not distinct from p_company_id;
 if not found then raise exception 'GOOGLE_EVENT_ORIGIN_MISSING';end if;
 select x.* into b from google_workspace.bindings x join google_workspace.grants g on g.id=x.grant_id and g.user_id=x.user_id
  where x.user_id=p_user_id and x.mode=p_mode and x.company_id is not distinct from p_company_id and x.unlinked_at is null and g.client_fingerprint=p_client_fingerprint;
 if b.id is null or b.id<>e.binding_id or b.grant_id<>e.grant_id or b.version<>p_binding_version then raise exception 'GOOGLE_EVENT_CONNECTION_CHANGED';end if;
 return e;
end;$$;

-- Private payload/history read, never a credential or effect authorization.
create function public.zelo_google_event_creation_get(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare c google_workspace.event_creations%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 if p_event_id is null then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select x.* into c from google_workspace.event_creations x join google_workspace.event_origins e using(event_id)
  where e.event_id=p_event_id and e.user_id=p_user_id and e.mode=p_mode and e.company_id is not distinct from p_company_id;
 if not found then return null;end if;
 return google_workspace.event_creation_metadata(c);
end;$$;

create function public.zelo_google_event_creation_prepare(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_client_fingerprint text,p_binding_version bigint,p_payload jsonb,p_with_meet boolean)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare e google_workspace.event_origins%rowtype;c google_workspace.event_creations%rowtype;
begin
 e=google_workspace.event_creation_context(p_user_id,p_mode,p_company_id,p_event_id,p_client_fingerprint,p_binding_version);
 if e.binding_version<>p_binding_version then raise exception 'GOOGLE_EVENT_CONNECTION_CHANGED';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768 or p_with_meet is null then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select * into c from google_workspace.event_creations where event_id=p_event_id;
 if found then
  if c.payload<>p_payload or c.with_meet<>p_with_meet then raise exception 'GOOGLE_EVENT_PAYLOAD_CONFLICT';end if;
 else
  insert into google_workspace.event_creations(event_id,payload,with_meet,authorized_binding_version)
   values(p_event_id,p_payload,p_with_meet,e.binding_version) returning * into c;
 end if;
 return google_workspace.event_creation_metadata(c);
end;$$;

create function public.zelo_google_event_creation_claim(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_client_fingerprint text,p_binding_version bigint,p_attempt_version bigint)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare c google_workspace.event_creations%rowtype;now_at timestamptz;
begin
 perform google_workspace.event_creation_context(p_user_id,p_mode,p_company_id,p_event_id,p_client_fingerprint,p_binding_version);
 select * into c from google_workspace.event_creations where event_id=p_event_id;
 now_at=clock_timestamp();
 if c.event_id is null or p_attempt_version is null or c.attempt_version<>p_attempt_version or c.state in ('succeeded','failed') or c.round_attempts>=10
  or (c.state='running' and c.lease_until>now_at) then raise exception 'GOOGLE_EVENT_ATTEMPT_CONFLICT';end if;
 if c.authorized_binding_version<>p_binding_version and not c.was_attempted then raise exception 'GOOGLE_EVENT_CONNECTION_CHANGED';end if;
 update google_workspace.event_creations set state='running',attempt_version=attempt_version+1,round_attempts=round_attempts+1,
  lease_id=gen_random_uuid(),lease_until=now_at+interval '60 seconds',lease_binding_version=p_binding_version,
  insert_allowed=(authorized_binding_version=p_binding_version and not remote_known),was_attempted=true,failure_code=null
  where event_id=p_event_id returning * into c;
 return google_workspace.event_creation_metadata(c);
end;$$;

-- Only a verified provider adapter supplies these outcomes. Never persist raw
-- responses/diagnostics. Expired/changed workers cannot commit any result.
create function public.zelo_google_event_creation_finish(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_client_fingerprint text,p_binding_version bigint,
 p_attempt_version bigint,p_lease_id uuid,p_result text,p_remote_known boolean,p_etag text,p_meet_link text,p_failure_code text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare c google_workspace.event_creations%rowtype;known boolean;new_etag text;next_state text;next_error text;
begin
 perform google_workspace.event_creation_context(p_user_id,p_mode,p_company_id,p_event_id,p_client_fingerprint,p_binding_version);
 select * into c from google_workspace.event_creations where event_id=p_event_id;
 if c.event_id is null or p_attempt_version is null or p_lease_id is null or c.state<>'running' or c.attempt_version<>p_attempt_version
  or c.lease_id<>p_lease_id or c.lease_binding_version<>p_binding_version or c.lease_until<=clock_timestamp() then raise exception 'GOOGLE_EVENT_ATTEMPT_CONFLICT';end if;
 if p_result is null or p_result not in ('retry','waiting','succeeded','failed') or p_remote_known is null
  or (p_etag is not null and (not p_remote_known or length(p_etag) not between 1 and 1024 or p_etag ~ '[[:cntrl:]]'))
  or (p_meet_link is not null and (not c.with_meet or p_meet_link !~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}$'))
  then raise exception 'GOOGLE_EVENT_INVALID';end if;
 known=c.remote_known or p_remote_known;new_etag=coalesce(p_etag,c.etag);
 if (known and new_etag is null) or (p_meet_link is not null and not known)
  or (p_result='succeeded' and (not known or (c.with_meet and p_meet_link is null)))
  or (p_result='waiting' and (not c.with_meet or not known or p_meet_link is not null))
  or (p_result in ('retry','failed') and p_meet_link is not null)
  or (p_result='retry' and p_failure_code is distinct from 'TEMPORARY')
  or (p_result in ('waiting','succeeded') and p_failure_code is not null)
  or (p_result='failed' and (p_failure_code is null or p_failure_code not in ('TEMPORARY','FOREIGN_EVENT','REMOTE_MISSING','CONFERENCE_FAILED','CONNECTION_CHANGED','ATTEMPTS_EXHAUSTED')))
  or (p_failure_code='CONFERENCE_FAILED' and not c.with_meet) then raise exception 'GOOGLE_EVENT_INVALID';end if;
 next_state=case when p_result='retry' then 'queued' else p_result end;next_error=p_failure_code;
 if p_result in ('retry','waiting') and c.round_attempts>=10 then next_state='failed';next_error='ATTEMPTS_EXHAUSTED';end if;
 update google_workspace.event_creations set state=next_state,lease_id=null,lease_until=null,lease_binding_version=null,insert_allowed=null,
  remote_known=known,etag=new_etag,meet_link=p_meet_link,failure_code=next_error where event_id=p_event_id returning * into c;
 return google_workspace.event_creation_metadata(c);
end;$$;

-- A later explicit authorized user action can resume the same original target.
-- It never resets known/attempted history or reuses a definitive failed conference.
create function public.zelo_google_event_creation_retry(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_client_fingerprint text,p_binding_version bigint,p_attempt_version bigint)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare c google_workspace.event_creations%rowtype;
begin
 perform google_workspace.event_creation_context(p_user_id,p_mode,p_company_id,p_event_id,p_client_fingerprint,p_binding_version);
 select * into c from google_workspace.event_creations where event_id=p_event_id;
 if c.event_id is null or p_attempt_version is null or c.attempt_version<>p_attempt_version or c.state='succeeded'
  or (c.state='running' and c.lease_until>clock_timestamp()) or c.failure_code in ('FOREIGN_EVENT','REMOTE_MISSING','CONFERENCE_FAILED') then raise exception 'GOOGLE_EVENT_ATTEMPT_CONFLICT';end if;
 update google_workspace.event_creations set state='queued',attempt_version=attempt_version+1,round_attempts=0,authorized_binding_version=p_binding_version,
  lease_id=null,lease_until=null,lease_binding_version=null,insert_allowed=null,failure_code=null where event_id=p_event_id returning * into c;
 return google_workspace.event_creation_metadata(c);
end;$$;

revoke all on function google_workspace.event_creation_context(uuid,text,uuid,uuid,text,bigint),google_workspace.event_creation_metadata(google_workspace.event_creations),
 public.zelo_google_event_creation_get(uuid,text,uuid,uuid),public.zelo_google_event_creation_prepare(uuid,text,uuid,uuid,text,bigint,jsonb,boolean),
 public.zelo_google_event_creation_claim(uuid,text,uuid,uuid,text,bigint,bigint),public.zelo_google_event_creation_finish(uuid,text,uuid,uuid,text,bigint,bigint,uuid,text,boolean,text,text,text),
 public.zelo_google_event_creation_retry(uuid,text,uuid,uuid,text,bigint,bigint) from public,anon,authenticated,service_role;
grant execute on function google_workspace.event_creation_context(uuid,text,uuid,uuid,text,bigint),google_workspace.event_creation_metadata(google_workspace.event_creations),
 public.zelo_google_event_creation_get(uuid,text,uuid,uuid),public.zelo_google_event_creation_prepare(uuid,text,uuid,uuid,text,bigint,jsonb,boolean),
 public.zelo_google_event_creation_claim(uuid,text,uuid,uuid,text,bigint,bigint),public.zelo_google_event_creation_finish(uuid,text,uuid,uuid,text,bigint,bigint,uuid,text,boolean,text,text,text),
 public.zelo_google_event_creation_retry(uuid,text,uuid,uuid,text,bigint,bigint) to service_role;
commit;
