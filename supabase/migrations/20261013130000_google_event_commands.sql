-- Dormant conditional commands. No Google call, legacy inference or backfill.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
create table google_workspace.event_command_heads (
 event_id uuid primary key references google_workspace.event_origins(event_id) on delete cascade,
 version bigint not null default 0 check(version>=0),operation_id uuid,
 etag text not null check(length(etag) between 1 and 1024 and etag !~ '[[:cntrl:]]'),
 deleted boolean not null default false,
 check((version=0 and operation_id is null) or (version>0 and operation_id is not null))
);
create table google_workspace.event_commands (
 operation_id uuid primary key,event_id uuid not null references google_workspace.event_command_heads(event_id) on delete cascade,
 head_version bigint not null check(head_version>0),kind text not null check(kind in ('update','delete','conference')),
 payload jsonb check(payload is null or (jsonb_typeof(payload)='object' and octet_length(payload::text)<=32768)),
 local_attendees jsonb check(local_attendees is null or (jsonb_typeof(local_attendees)='array' and octet_length(local_attendees::text)<=16384)),
 expected_etag text not null check(length(expected_etag) between 1 and 1024 and expected_etag !~ '[[:cntrl:]]'),
 conference_request_id text check(conference_request_id ~ '^[a-f0-9]{64}$'),
 authorized_binding_version bigint not null check(authorized_binding_version>0),
 state text not null default 'queued' check(state in ('queued','running','waiting','succeeded','failed')),
 attempt_version bigint not null default 0 check(attempt_version>=0),round_attempts integer not null default 0 check(round_attempts between 0 and 10 and round_attempts<=attempt_version),
 lease_id uuid,lease_until timestamptz,lease_binding_version bigint check(lease_binding_version>0),mutation_allowed boolean,
 was_attempted boolean not null default false,etag text check(length(etag) between 1 and 1024 and etag !~ '[[:cntrl:]]'),
 meet_link text check(meet_link ~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
 failure_code text check(failure_code in ('TEMPORARY','FOREIGN_EVENT','REMOTE_MISSING','CONFERENCE_FAILED','CONNECTION_CHANGED','ATTEMPTS_EXHAUSTED','ETAG_CONFLICT','SUPERSEDED')),
 created_at timestamptz not null default clock_timestamp(),unique(event_id,head_version),
 check((kind='update' and payload is not null and local_attendees is not null and conference_request_id is null)
  or (kind='delete' and payload is null and local_attendees is null and conference_request_id is null)
  or (kind='conference' and payload is null and local_attendees is null and conference_request_id is not null)),
 check((state='running' and lease_id is not null and lease_until is not null and isfinite(lease_until) and lease_binding_version is not null and mutation_allowed is not null)
  or (state<>'running' and lease_id is null and lease_until is null and lease_binding_version is null and mutation_allowed is null)),
 check(meet_link is null or (kind='conference' and etag is not null)),
 check(state<>'succeeded' or kind='delete' or (etag is not null and (kind<>'conference' or meet_link is not null))),
 check(state<>'waiting' or (kind='conference' and etag is not null and meet_link is null)),
 check(state<>'failed' or failure_code is not null)
);
alter table google_workspace.event_command_heads enable row level security;
alter table google_workspace.event_commands enable row level security;
revoke all on google_workspace.event_command_heads,google_workspace.event_commands from public,anon,authenticated,service_role;
grant select,insert on google_workspace.event_command_heads,google_workspace.event_commands to service_role;
grant update(version,operation_id,etag,deleted) on google_workspace.event_command_heads to service_role;
grant update(state,attempt_version,round_attempts,authorized_binding_version,lease_id,lease_until,lease_binding_version,mutation_allowed,was_attempted,etag,meet_link,failure_code)
 on google_workspace.event_commands to service_role;
create function google_workspace.event_command_metadata(c google_workspace.event_commands)
returns jsonb language sql immutable strict security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('operation_id',c.operation_id,'event_id',c.event_id,'head_version',c.head_version::text,'kind',c.kind,'payload',c.payload,'local_attendees',c.local_attendees,
  'payload_fingerprint',encode(sha256(convert_to(coalesce(c.payload::text,'null'),'UTF8')),'hex'),'expected_etag',c.expected_etag,'conference_request_id',c.conference_request_id,
  'authorized_binding_version',c.authorized_binding_version::text,'state',c.state,'attempt_version',c.attempt_version::text,'round_attempts',c.round_attempts,
  'lease_id',c.lease_id,'lease_until',c.lease_until,'lease_binding_version',c.lease_binding_version::text,'mutation_allowed',c.mutation_allowed,
  'was_attempted',c.was_attempted,'etag',c.etag,'meet_link',c.meet_link,'failure_code',c.failure_code);
$$;
create function google_workspace.event_command_local_context(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_cancelled boolean)
returns google_workspace.event_links language plpgsql security invoker set search_path=pg_catalog as $$
declare l google_workspace.event_links%rowtype;a public.appointments%rowtype;m public.meets%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if p_cancelled is null or public.zelo_google_event_local_get(p_user_id,p_mode,p_company_id,p_event_id) is null then raise exception 'GOOGLE_EVENT_LOCAL_INACTIVE';end if;
 select * into l from google_workspace.event_links where event_id=p_event_id and user_id=p_user_id;
 begin
  select * into a from public.appointments where id=l.appointment_id and user_id=p_user_id for update nowait;
  if a.id is null or a.company_id is distinct from p_company_id or a.workspace_legacy or (a.status<>'scheduled' and not(p_cancelled and a.status='cancelled')) then raise exception 'GOOGLE_EVENT_LOCAL_INACTIVE';end if;
  if l.kind='meet' then
   select * into m from public.meets where id=l.meet_id and user_id=p_user_id for update nowait;
   if m.id is null or m.company_id is distinct from p_company_id or m.workspace_legacy or (m.status<>'scheduled' and not(p_cancelled and m.status='cancelled')) then raise exception 'GOOGLE_EVENT_LOCAL_INACTIVE';end if;
  end if;
 exception when lock_not_available then raise exception 'GOOGLE_EVENT_LOCAL_CONFLICT';end;
 return l;
end;$$;
create function public.zelo_google_event_command_head(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare h google_workspace.event_command_heads%rowtype;c google_workspace.event_creations%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 if public.zelo_google_event_local_get(p_user_id,p_mode,p_company_id,p_event_id) is null then return null;end if;
 select * into h from google_workspace.event_command_heads where event_id=p_event_id;
 if found then return jsonb_build_object('event_id',h.event_id,'head_version',h.version::text,'operation_id',h.operation_id,'etag',h.etag,'deleted',h.deleted);end if;
 select * into c from google_workspace.event_creations where event_id=p_event_id;
 if c.etag is null or not c.remote_known then return null;end if;
 return jsonb_build_object('event_id',p_event_id,'head_version','0','operation_id',null,'etag',c.etag,'deleted',false);
end;$$;
create function public.zelo_google_event_command_get(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare c google_workspace.event_commands%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 if p_operation_id is null then raise exception 'GOOGLE_EVENT_INVALID';end if;
 if public.zelo_google_event_local_get(p_user_id,p_mode,p_company_id,p_event_id) is null then return null;end if;
 select * into c from google_workspace.event_commands where event_id=p_event_id and operation_id=p_operation_id;
 if not found then return null;end if;return google_workspace.event_command_metadata(c);
end;$$;
-- Before credential runtime, including a logically canceled delete recovery.
create function public.zelo_google_event_command_active(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_operation_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare c google_workspace.event_commands%rowtype;h google_workspace.event_command_heads%rowtype;l google_workspace.event_links%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 select * into c from google_workspace.event_commands where event_id=p_event_id and operation_id=p_operation_id;
 select * into h from google_workspace.event_command_heads where event_id=p_event_id;
 if c.operation_id is null or h.deleted or h.operation_id<>c.operation_id or h.version<>c.head_version then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 l=google_workspace.event_command_local_context(p_user_id,p_mode,p_company_id,p_event_id,c.kind='delete');
 if c.kind='delete' and(not exists(select 1 from public.appointments where id=l.appointment_id and status='cancelled')
  or(l.kind='meet' and not exists(select 1 from public.meets where id=l.meet_id and status='cancelled'))) then raise exception 'GOOGLE_EVENT_LOCAL_INACTIVE';end if;
 return true;
end;$$;
create function public.zelo_google_event_command_prepare(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_operation_id uuid,p_head_version bigint,
 p_client_fingerprint text,p_binding_version bigint,p_kind text,p_payload jsonb,p_local_attendees jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare l google_workspace.event_links%rowtype;e google_workspace.event_origins%rowtype;creation google_workspace.event_creations%rowtype;
 h google_workspace.event_command_heads%rowtype;c google_workspace.event_commands%rowtype;prior google_workspace.event_commands%rowtype;
 desired_start timestamptz;desired_end timestamptz;desired_all_day boolean;attendee jsonb;request_id text;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if p_event_id is null or p_operation_id is null or p_head_version is null or p_head_version<0 or p_kind is null or p_kind not in ('update','delete','conference') then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select * into c from google_workspace.event_commands where operation_id=p_operation_id;
 if found then
  if c.event_id<>p_event_id or c.head_version<>p_head_version+1 or c.kind<>p_kind or c.payload is distinct from p_payload or c.local_attendees is distinct from p_local_attendees
   or public.zelo_google_event_local_get(p_user_id,p_mode,p_company_id,p_event_id) is null then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
  return google_workspace.event_command_metadata(c);
 end if;
 l=google_workspace.event_command_local_context(p_user_id,p_mode,p_company_id,p_event_id,p_kind='delete');
 e=google_workspace.event_creation_context(p_user_id,p_mode,p_company_id,p_event_id,p_client_fingerprint,p_binding_version);
 select * into creation from google_workspace.event_creations where event_id=p_event_id;
 if creation.event_id is null or not creation.remote_known or creation.etag is null or not(creation.state='succeeded'
  or(p_kind='conference' and creation.state='failed' and creation.failure_code='CONFERENCE_FAILED')) then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 insert into google_workspace.event_command_heads(event_id,etag) values(p_event_id,creation.etag) on conflict(event_id) do nothing;
 select * into h from google_workspace.event_command_heads where event_id=p_event_id;
 if h.deleted or h.version<>p_head_version then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 select * into prior from google_workspace.event_commands where operation_id=h.operation_id;
 if (prior.state='running' and prior.lease_until>clock_timestamp())
  or(p_kind<>'delete' and prior.kind='conference' and prior.state<>'succeeded' and prior.failure_code is distinct from 'CONFERENCE_FAILED') then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 if p_kind='conference' and not coalesce((creation.state='failed' and creation.failure_code='CONFERENCE_FAILED')
  or(prior.kind='conference' and prior.state='failed' and prior.failure_code='CONFERENCE_FAILED')
  or(not creation.with_meet and not exists(select 1 from google_workspace.event_commands where event_id=p_event_id and kind='conference')),false) then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 if p_kind='update' then
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768
   or(p_payload-array['summary','description','location','startAt','endAt','allDay','repeat','attendees'])<>'{}'::jsonb
   or jsonb_typeof(p_payload->'summary') is distinct from 'string' or length(btrim(p_payload->>'summary'))=0 or length(p_payload->>'summary')>512 or p_payload->>'summary' ~ '[[:cntrl:]]'
   or jsonb_typeof(p_payload->'description') is distinct from 'string' or length(p_payload->>'description')>8192 or regexp_replace(p_payload->>'description',E'[\\n\\r\\t]','','g') ~ '[[:cntrl:]]'
   or jsonb_typeof(p_payload->'location') is distinct from 'string' or length(p_payload->>'location')>1024 or p_payload->>'location' ~ '[[:cntrl:]]'
   or jsonb_typeof(p_payload->'allDay') is distinct from 'boolean' or jsonb_typeof(p_payload->'startAt') is distinct from 'string' or jsonb_typeof(p_payload->'endAt') is distinct from 'string'
   or jsonb_typeof(p_payload->'repeat') is distinct from 'string' or p_payload->>'repeat' not in ('none','daily','weekly','monthly','yearly')
   or jsonb_typeof(p_payload->'attendees') is distinct from 'array' or jsonb_array_length(p_payload->'attendees')>100
   or p_local_attendees is null or jsonb_typeof(p_local_attendees)<>'array' or jsonb_array_length(p_local_attendees)>100 or octet_length(p_local_attendees::text)>16384
   then raise exception 'GOOGLE_EVENT_INVALID';end if;
  for attendee in select value from jsonb_array_elements(p_payload->'attendees') loop
   if jsonb_typeof(attendee)<>'object' or(attendee-array['email','displayName'])<>'{}'::jsonb or jsonb_typeof(attendee->'email') is distinct from 'string'
    or length(attendee->>'email') not between 3 and 254 or attendee->>'email' ~ '[[:cntrl:][:space:]]' or position('@' in attendee->>'email')<2
    or jsonb_typeof(attendee->'displayName') is distinct from 'string' or length(attendee->>'displayName')>256 or attendee->>'displayName' ~ '[[:cntrl:]]' then raise exception 'GOOGLE_EVENT_INVALID';end if;
  end loop;
  for attendee in select value from jsonb_array_elements(p_local_attendees) loop
   if jsonb_typeof(attendee)<>'object' or(attendee-array['name','phone','email'])<>'{}'::jsonb or jsonb_typeof(attendee->'name') is distinct from 'string' or length(attendee->>'name')>256 or attendee->>'name' ~ '[[:cntrl:]]'
    or(attendee?'phone' and(jsonb_typeof(attendee->'phone') is distinct from 'string' or length(attendee->>'phone')>64 or attendee->>'phone' ~ '[[:cntrl:]]'))
    or(attendee?'email' and(jsonb_typeof(attendee->'email') is distinct from 'string' or length(attendee->>'email')>254 or attendee->>'email' ~ '[[:cntrl:]]')) then raise exception 'GOOGLE_EVENT_INVALID';end if;
  end loop;
  desired_all_day=(p_payload->>'allDay')::boolean;
  if(l.kind='appointment' and p_local_attendees<>'[]'::jsonb) or(l.kind='meet' and(desired_all_day or p_payload->>'repeat'<>'none'
   or coalesce((select jsonb_agg(jsonb_build_object('email',value->>'email','displayName',value->>'name') order by ordinal) from jsonb_array_elements(p_local_attendees) with ordinality as guests(value,ordinal) where value?'email'),'[]'::jsonb)<>p_payload->'attendees')) then raise exception 'GOOGLE_EVENT_INVALID';end if;
  begin
   if desired_all_day then
    if p_payload->>'startAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or p_payload->>'endAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'GOOGLE_EVENT_INVALID';end if;
    desired_start=(p_payload->>'startAt')::date::timestamp at time zone 'America/Sao_Paulo';desired_end=(p_payload->>'endAt')::date::timestamp at time zone 'America/Sao_Paulo';
   else
    if p_payload->>'startAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' or p_payload->>'endAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' then raise exception 'GOOGLE_EVENT_INVALID';end if;
    desired_start=(p_payload->>'startAt')::timestamptz;desired_end=(p_payload->>'endAt')::timestamptz;
    if to_char(desired_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p_payload->>'startAt' or to_char(desired_end at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p_payload->>'endAt' then raise exception 'GOOGLE_EVENT_INVALID';end if;
   end if;
  exception when others then raise exception 'GOOGLE_EVENT_INVALID';end;
  if not isfinite(desired_start) or not isfinite(desired_end) or desired_end<=desired_start then raise exception 'GOOGLE_EVENT_INVALID';end if;
 elsif p_payload is not null or p_local_attendees is not null then raise exception 'GOOGLE_EVENT_INVALID';end if;
 if p_kind='conference' then request_id=encode(sha256(convert_to('zelo-google-conference-command-v1','UTF8')||decode('00','hex')||convert_to(p_user_id::text||':'||p_mode||':'||coalesce(p_company_id::text,'personal'),'UTF8')||decode('00','hex')||convert_to(p_event_id::text,'UTF8')||decode('00','hex')||convert_to(p_operation_id::text,'UTF8')),'hex');end if;
 if prior.operation_id is not null and prior.state not in ('succeeded','failed') then
  update google_workspace.event_commands set state='failed',failure_code='SUPERSEDED',lease_id=null,lease_until=null,lease_binding_version=null,mutation_allowed=null where operation_id=prior.operation_id;
 end if;
 insert into google_workspace.event_commands(operation_id,event_id,head_version,kind,payload,local_attendees,expected_etag,conference_request_id,authorized_binding_version)
  values(p_operation_id,p_event_id,h.version+1,p_kind,p_payload,p_local_attendees,h.etag,request_id,p_binding_version) returning * into c;
 update google_workspace.event_command_heads set version=c.head_version,operation_id=c.operation_id where event_id=p_event_id;
 if p_kind='delete' then
  update public.appointments set status='cancelled' where id=l.appointment_id and user_id=p_user_id;
  if l.kind='meet' then update public.meets set status='cancelled' where id=l.meet_id and user_id=p_user_id;end if;
 elsif p_kind='update' then
  update public.appointments set title=(case when l.kind='meet' then '🎥 ' else '' end)||(p_payload->>'summary'),description=p_payload->>'description',location=p_payload->>'location',start_at=desired_start,end_at=desired_end,all_day=desired_all_day,repeat=p_payload->>'repeat' where id=l.appointment_id and user_id=p_user_id;
  if l.kind='meet' then update public.meets set title=p_payload->>'summary',description=p_payload->>'description',start_at=desired_start,end_at=desired_end,attendees=p_local_attendees where id=l.meet_id and user_id=p_user_id;end if;
 end if;
 return google_workspace.event_command_metadata(c);
end;$$;
create function google_workspace.event_command_context(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_operation_id uuid,p_client_fingerprint text,p_binding_version bigint)
returns google_workspace.event_commands language plpgsql security invoker set search_path=pg_catalog as $$
declare c google_workspace.event_commands%rowtype;h google_workspace.event_command_heads%rowtype;l google_workspace.event_links%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if p_operation_id is null then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select * into c from google_workspace.event_commands where event_id=p_event_id and operation_id=p_operation_id;
 select * into h from google_workspace.event_command_heads where event_id=p_event_id;
 if c.operation_id is null or h.deleted or h.operation_id<>c.operation_id or h.version<>c.head_version then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 l=google_workspace.event_command_local_context(p_user_id,p_mode,p_company_id,p_event_id,c.kind='delete');
 if c.kind='delete' and(not exists(select 1 from public.appointments where id=l.appointment_id and status='cancelled')
  or(l.kind='meet' and not exists(select 1 from public.meets where id=l.meet_id and status='cancelled'))) then raise exception 'GOOGLE_EVENT_LOCAL_INACTIVE';end if;
 perform google_workspace.event_creation_context(p_user_id,p_mode,p_company_id,p_event_id,p_client_fingerprint,p_binding_version);
 return c;
end;$$;
create function public.zelo_google_event_command_claim(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_operation_id uuid,p_client_fingerprint text,p_binding_version bigint,p_attempt_version bigint)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare c google_workspace.event_commands%rowtype;now_at timestamptz=clock_timestamp();
begin
 c=google_workspace.event_command_context(p_user_id,p_mode,p_company_id,p_event_id,p_operation_id,p_client_fingerprint,p_binding_version);
 if p_attempt_version is null or c.attempt_version<>p_attempt_version or c.state in ('succeeded','failed') or c.round_attempts>=10
  or(c.state='running' and c.lease_until>now_at) then raise exception 'GOOGLE_EVENT_ATTEMPT_CONFLICT';end if;
 if c.authorized_binding_version<>p_binding_version and not c.was_attempted then raise exception 'GOOGLE_EVENT_CONNECTION_CHANGED';end if;
 update google_workspace.event_commands set state='running',attempt_version=attempt_version+1,round_attempts=round_attempts+1,
  lease_id=gen_random_uuid(),lease_until=now_at+interval '60 seconds',lease_binding_version=p_binding_version,
  mutation_allowed=(authorized_binding_version=p_binding_version),was_attempted=true,failure_code=null where operation_id=p_operation_id returning * into c;
 return google_workspace.event_command_metadata(c);
end;$$;
create function public.zelo_google_event_command_preflight(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_operation_id uuid,p_client_fingerprint text,p_binding_version bigint,p_attempt_version bigint,p_lease_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare c google_workspace.event_commands%rowtype;
begin
 c=google_workspace.event_command_context(p_user_id,p_mode,p_company_id,p_event_id,p_operation_id,p_client_fingerprint,p_binding_version);
 if p_attempt_version is null or p_lease_id is null or c.state<>'running' or c.attempt_version<>p_attempt_version or c.lease_id<>p_lease_id
  or c.lease_binding_version<>p_binding_version or c.lease_until<=clock_timestamp()+interval '16 seconds' then raise exception 'GOOGLE_EVENT_ATTEMPT_CONFLICT';end if;
 return true;
end;$$;
create function public.zelo_google_event_command_finish(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_operation_id uuid,p_client_fingerprint text,p_binding_version bigint,
 p_attempt_version bigint,p_lease_id uuid,p_result text,p_etag text,p_meet_link text,p_failure_code text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare c google_workspace.event_commands%rowtype;l google_workspace.event_links%rowtype;e google_workspace.event_origins%rowtype;next_state text;next_error text;
begin
 c=google_workspace.event_command_context(p_user_id,p_mode,p_company_id,p_event_id,p_operation_id,p_client_fingerprint,p_binding_version);
 if p_attempt_version is null or p_lease_id is null or c.state<>'running' or c.attempt_version<>p_attempt_version or c.lease_id<>p_lease_id
  or c.lease_binding_version<>p_binding_version or c.lease_until<=clock_timestamp() then raise exception 'GOOGLE_EVENT_ATTEMPT_CONFLICT';end if;
 if p_result is null or p_result not in ('retry','waiting','succeeded','failed')
  or(p_etag is not null and(length(p_etag) not between 1 and 1024 or p_etag ~ '[[:cntrl:]]'))
  or(p_meet_link is not null and(c.kind<>'conference' or p_meet_link !~ '^https://meet[.]google[.]com/[a-z]{3}-[a-z]{4}-[a-z]{3}$'))
  or(p_result='succeeded' and(c.kind<>'delete' and(p_etag is null or(c.kind='conference' and p_meet_link is null))))
  or(p_result='waiting' and(c.kind<>'conference' or p_etag is null or p_meet_link is not null))
  or(p_result in ('retry','failed') and p_meet_link is not null)
  or(p_result in ('waiting','succeeded') and p_failure_code is not null)
  or(p_result='retry' and p_failure_code is distinct from 'TEMPORARY')
  or(p_result='failed' and(p_failure_code is null or p_failure_code not in ('TEMPORARY','FOREIGN_EVENT','REMOTE_MISSING','CONFERENCE_FAILED','CONNECTION_CHANGED','ATTEMPTS_EXHAUSTED','ETAG_CONFLICT')))
  or(p_failure_code='CONFERENCE_FAILED' and(c.kind<>'conference' or p_etag is null)) then raise exception 'GOOGLE_EVENT_INVALID';end if;
 next_state=case when p_result='retry' then 'queued' else p_result end;next_error=p_failure_code;
 if p_result in ('retry','waiting') and c.round_attempts>=10 then next_state='failed';next_error='ATTEMPTS_EXHAUSTED';end if;
 update google_workspace.event_commands set state=next_state,lease_id=null,lease_until=null,lease_binding_version=null,mutation_allowed=null,
  etag=coalesce(p_etag,etag),meet_link=p_meet_link,failure_code=next_error where operation_id=p_operation_id returning * into c;
 update google_workspace.event_command_heads set etag=coalesce(p_etag,etag),deleted=(p_result='succeeded' and c.kind='delete') where event_id=p_event_id;
 if c.kind='conference' and p_etag is not null and(p_result in ('waiting','succeeded') or p_failure_code='CONFERENCE_FAILED') then
  select * into l from google_workspace.event_links where event_id=p_event_id;
  select * into e from google_workspace.event_origins where event_id=p_event_id;
  update public.appointments set meet_link=p_meet_link,calendar_event_id=case when p_result in ('waiting','succeeded') then 'gcal:'||jsonb_build_object('eventId',e.remote_event_id,'calendarId',e.calendar_id)::text else calendar_event_id end where id=l.appointment_id and user_id=p_user_id;
  if l.kind='meet' then update public.meets set meet_link=coalesce(p_meet_link,''),calendar_event_id=case when p_result in ('waiting','succeeded') then e.remote_event_id else calendar_event_id end where id=l.meet_id and user_id=p_user_id;end if;
  if p_result='succeeded' then
   update google_workspace.event_creations set state='succeeded',etag=p_etag,meet_link=p_meet_link,failure_code=null where event_id=p_event_id and with_meet;
  end if;
 end if;
 return google_workspace.event_command_metadata(c);
end;$$;
create function public.zelo_google_event_command_retry(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_operation_id uuid,p_client_fingerprint text,p_binding_version bigint,p_attempt_version bigint)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare c google_workspace.event_commands%rowtype;
begin
 c=google_workspace.event_command_context(p_user_id,p_mode,p_company_id,p_event_id,p_operation_id,p_client_fingerprint,p_binding_version);
 if p_attempt_version is null or c.attempt_version<>p_attempt_version or c.state='succeeded' or(c.state='running' and c.lease_until>clock_timestamp())
  or c.failure_code in ('FOREIGN_EVENT','REMOTE_MISSING','CONFERENCE_FAILED','ETAG_CONFLICT','SUPERSEDED') then raise exception 'GOOGLE_EVENT_ATTEMPT_CONFLICT';end if;
 update google_workspace.event_commands set state='queued',attempt_version=attempt_version+1,round_attempts=0,authorized_binding_version=p_binding_version,
  lease_id=null,lease_until=null,lease_binding_version=null,mutation_allowed=null,failure_code=null where operation_id=p_operation_id returning * into c;
 return google_workspace.event_command_metadata(c);
end;$$;
revoke all on function google_workspace.event_command_metadata(google_workspace.event_commands),google_workspace.event_command_local_context(uuid,text,uuid,uuid,boolean),
 google_workspace.event_command_context(uuid,text,uuid,uuid,uuid,text,bigint),public.zelo_google_event_command_head(uuid,text,uuid,uuid),public.zelo_google_event_command_active(uuid,text,uuid,uuid,uuid),
 public.zelo_google_event_command_get(uuid,text,uuid,uuid,uuid),public.zelo_google_event_command_prepare(uuid,text,uuid,uuid,uuid,bigint,text,bigint,text,jsonb,jsonb),
 public.zelo_google_event_command_claim(uuid,text,uuid,uuid,uuid,text,bigint,bigint),public.zelo_google_event_command_preflight(uuid,text,uuid,uuid,uuid,text,bigint,bigint,uuid),
 public.zelo_google_event_command_finish(uuid,text,uuid,uuid,uuid,text,bigint,bigint,uuid,text,text,text,text),public.zelo_google_event_command_retry(uuid,text,uuid,uuid,uuid,text,bigint,bigint)
 from public,anon,authenticated,service_role;
grant execute on function google_workspace.event_command_metadata(google_workspace.event_commands),google_workspace.event_command_local_context(uuid,text,uuid,uuid,boolean),
 google_workspace.event_command_context(uuid,text,uuid,uuid,uuid,text,bigint),public.zelo_google_event_command_head(uuid,text,uuid,uuid),public.zelo_google_event_command_active(uuid,text,uuid,uuid,uuid),
 public.zelo_google_event_command_get(uuid,text,uuid,uuid,uuid),public.zelo_google_event_command_prepare(uuid,text,uuid,uuid,uuid,bigint,text,bigint,text,jsonb,jsonb),
 public.zelo_google_event_command_claim(uuid,text,uuid,uuid,uuid,text,bigint,bigint),public.zelo_google_event_command_preflight(uuid,text,uuid,uuid,uuid,text,bigint,bigint,uuid),
 public.zelo_google_event_command_finish(uuid,text,uuid,uuid,uuid,text,bigint,bigint,uuid,text,text,text,text),public.zelo_google_event_command_retry(uuid,text,uuid,uuid,uuid,text,bigint,bigint)
 to service_role;
commit;
