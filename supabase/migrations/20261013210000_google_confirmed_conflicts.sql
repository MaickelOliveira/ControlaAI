-- A human confirms the current conflicting update/delete; journal inputs stay immutable.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
create table google_workspace.event_etag_confirmations (
 mutation_id uuid primary key,event_id uuid not null,user_id uuid not null references public.users(id) on delete cascade,
 mode text not null check(mode in ('personal','business')),company_id uuid,
 operation_id uuid not null references google_workspace.event_commands(operation_id) on delete cascade,
 expected_sync_version text not null check(expected_sync_version ~ '^v1:(0|[1-9][0-9]*):(0|[1-9][0-9]*):(0|[1-9][0-9]*)$'),
 etag text not null check(length(etag) between 1 and 1024 and etag !~ '[[:cntrl:]]'),
 baseline_attempt_version bigint not null check(baseline_attempt_version>0),created_at timestamptz not null default clock_timestamp(),
 check((mode='personal' and company_id is null) or(mode='business' and company_id is not null)),
 foreign key(event_id,user_id) references google_workspace.event_origins(event_id,user_id) on delete cascade,
 foreign key(company_id,user_id) references public.companies(id,user_id),unique(operation_id,baseline_attempt_version)
);
alter table google_workspace.event_etag_confirmations enable row level security;
revoke all on google_workspace.event_etag_confirmations from public,anon,authenticated,service_role;
grant select,insert on google_workspace.event_etag_confirmations to service_role;
create or replace function google_workspace.event_command_metadata(c google_workspace.event_commands)
returns jsonb language sql stable strict security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('operation_id',c.operation_id,'event_id',c.event_id,'head_version',c.head_version::text,'kind',c.kind,'payload',c.payload,'local_attendees',c.local_attendees,
  'payload_fingerprint',encode(sha256(convert_to(coalesce(c.payload::text,'null'),'UTF8')),'hex'),'expected_etag',coalesce((select consent.etag from google_workspace.event_etag_confirmations consent where consent.operation_id=c.operation_id and consent.baseline_attempt_version<=c.attempt_version order by consent.baseline_attempt_version desc limit 1),c.expected_etag),'conference_request_id',c.conference_request_id,
  'authorized_binding_version',c.authorized_binding_version::text,'state',c.state,'attempt_version',c.attempt_version::text,'round_attempts',c.round_attempts,
  'lease_id',c.lease_id,'lease_until',c.lease_until,'lease_binding_version',c.lease_binding_version::text,'mutation_allowed',c.mutation_allowed,
  'was_attempted',c.was_attempted,'etag',c.etag,'meet_link',c.meet_link,'failure_code',c.failure_code);
$$;

create function public.zelo_google_event_conflict_get(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_mutation_id uuid,p_expected_sync_version text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare receipt google_workspace.event_etag_confirmations%rowtype;
begin
 perform google_workspace.event_user_snapshot(p_user_id,p_mode,p_company_id,p_event_id);
 if p_mutation_id is null or p_expected_sync_version is null or p_expected_sync_version !~ '^v1:(0|[1-9][0-9]*):(0|[1-9][0-9]*):(0|[1-9][0-9]*)$' then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select * into receipt from google_workspace.event_etag_confirmations where mutation_id=p_mutation_id;
 if not found then return null;end if;
 if receipt.event_id<>p_event_id or receipt.user_id<>p_user_id or receipt.mode<>p_mode or receipt.company_id is distinct from p_company_id or receipt.expected_sync_version<>p_expected_sync_version then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 return jsonb_build_object('event_id',receipt.event_id,'operation_id',receipt.operation_id);
end;$$;
create function public.zelo_google_event_conflict_confirm(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_mutation_id uuid,p_expected_sync_version text,p_operation_id uuid,p_client_fingerprint text,p_binding_version bigint,p_etag text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare row jsonb;existing jsonb;c google_workspace.event_commands%rowtype;
begin
 row=google_workspace.event_user_snapshot(p_user_id,p_mode,p_company_id,p_event_id);
 existing=public.zelo_google_event_conflict_get(p_user_id,p_mode,p_company_id,p_event_id,p_mutation_id,p_expected_sync_version);
 if existing is not null then
  if existing->>'operation_id' is distinct from p_operation_id::text then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
  return existing;
 end if;
 if row->>'google_sync_version' is null or row->>'google_sync_version'<>p_expected_sync_version
  or exists(select 1 from google_workspace.event_user_retries where mutation_id=p_mutation_id) then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 if p_etag is null or length(p_etag) not between 1 and 1024 or p_etag ~ '[[:cntrl:]]' then raise exception 'GOOGLE_EVENT_INVALID';end if;
 c=google_workspace.event_command_context(p_user_id,p_mode,p_company_id,p_event_id,p_operation_id,p_client_fingerprint,p_binding_version);
 if c.state<>'failed' or c.failure_code is distinct from 'ETAG_CONFLICT' or c.kind not in ('update','delete')
  or c.head_version::text<>split_part(p_expected_sync_version,':',3) or c.attempt_version::text<>split_part(p_expected_sync_version,':',4) then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 -- Consent, the same operation reset and acknowledgment commit together. No DB
 -- lock spans the provider read; this final CAS rejects all intervening changes.
 insert into google_workspace.event_etag_confirmations(mutation_id,event_id,user_id,mode,company_id,operation_id,expected_sync_version,etag,baseline_attempt_version)
 values(p_mutation_id,p_event_id,p_user_id,p_mode,p_company_id,p_operation_id,p_expected_sync_version,p_etag,c.attempt_version+1);
 update google_workspace.event_commands set state='queued',attempt_version=attempt_version+1,round_attempts=0,authorized_binding_version=p_binding_version,
  lease_id=null,lease_until=null,lease_binding_version=null,mutation_allowed=null,failure_code=null where operation_id=p_operation_id;
 insert into google_workspace.event_user_retries(mutation_id,event_id,user_id,mode,company_id,expected_sync_version,operation_id)
 values(p_mutation_id,p_event_id,p_user_id,p_mode,p_company_id,p_expected_sync_version,p_operation_id);
 return jsonb_build_object('event_id',p_event_id,'operation_id',p_operation_id);
end;$$;
revoke all on function public.zelo_google_event_conflict_get(uuid,text,uuid,uuid,uuid,text),public.zelo_google_event_conflict_confirm(uuid,text,uuid,uuid,uuid,text,uuid,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.zelo_google_event_conflict_get(uuid,text,uuid,uuid,uuid,text),public.zelo_google_event_conflict_confirm(uuid,text,uuid,uuid,uuid,text,uuid,text,bigint,text) to service_role;
commit;
