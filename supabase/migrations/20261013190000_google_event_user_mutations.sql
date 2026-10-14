-- Confirmed consumer mutations compare one snapshot under the owner write lock.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
create table google_workspace.event_user_retries (
 mutation_id uuid primary key,
 event_id uuid not null,
 user_id uuid not null references public.users(id) on delete cascade,
 mode text not null check(mode in ('personal','business')),
 company_id uuid,
 expected_sync_version text not null check(expected_sync_version ~ '^v1:(0|[1-9][0-9]*):(0|[1-9][0-9]*):(0|[1-9][0-9]*)$'),
 operation_id uuid,
 created_at timestamptz not null default clock_timestamp(),
 check((mode='personal' and company_id is null) or(mode='business' and company_id is not null)),
 foreign key(event_id,user_id) references google_workspace.event_origins(event_id,user_id) on delete cascade,
 foreign key(company_id,user_id) references public.companies(id,user_id)
);
create table google_workspace.event_user_commands (
 operation_id uuid primary key references google_workspace.event_commands(operation_id) on delete cascade,
 event_id uuid not null,user_id uuid not null references public.users(id) on delete cascade,
 expected_sync_version text not null check(expected_sync_version ~ '^v1:(0|[1-9][0-9]*):(0|[1-9][0-9]*):(0|[1-9][0-9]*)$'),
 foreign key(event_id,user_id) references google_workspace.event_origins(event_id,user_id) on delete cascade
);
create table google_workspace.event_user_local_mutations (
 mutation_id uuid primary key,event_id uuid not null,user_id uuid not null references public.users(id) on delete cascade,
 mode text not null check(mode in ('personal','business')),company_id uuid,
 expected_sync_version text check(expected_sync_version ~ '^v1:(0|[1-9][0-9]*):(0|[1-9][0-9]*):(0|[1-9][0-9]*)$'),
 payload jsonb,metadata jsonb not null check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=65536),
 check(payload is null or(jsonb_typeof(payload)='object' and octet_length(payload::text)<=32768)),
 check((mode='personal' and company_id is null) or(mode='business' and company_id is not null)),
 foreign key(event_id,user_id) references public.appointments(id,user_id) on delete cascade,
 foreign key(company_id,user_id) references public.companies(id,user_id)
);
alter table google_workspace.event_user_commands enable row level security;
alter table google_workspace.event_user_local_mutations enable row level security;
alter table google_workspace.event_user_retries enable row level security;
revoke all on google_workspace.event_user_retries,google_workspace.event_user_commands,google_workspace.event_user_local_mutations from public,anon,authenticated,service_role;
grant select,insert on google_workspace.event_user_retries,google_workspace.event_user_commands,google_workspace.event_user_local_mutations to service_role;

create function google_workspace.event_user_snapshot(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare selected uuid;result jsonb;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if p_event_id is null then raise exception 'GOOGLE_EVENT_INVALID';end if;
 begin
  select a.id into selected from public.appointments a where a.id=p_event_id and a.user_id=p_user_id
   and((p_mode='business' and a.company_id=p_company_id) or(p_mode='personal' and(a.company_id is null or a.workspace_legacy)))
   and(a.company_id is null or exists(select 1 from public.companies company where company.id=a.company_id and company.user_id=p_user_id and company.archived_at is null)) for update nowait;
 exception when lock_not_available then raise exception 'GOOGLE_EVENT_LOCAL_CONFLICT';end;
 if selected is null then raise exception 'GOOGLE_EVENT_NOT_FOUND';end if;
 result=public.zelo_google_appointment_rows(p_user_id,p_mode,p_company_id,p_event_id,1)->0;
 if result is null then raise exception 'GOOGLE_EVENT_NOT_FOUND';end if;return result;
end;$$;

create function public.zelo_google_event_command_prepare_expected(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_operation_id uuid,p_expected_sync_version text,
 p_client_fingerprint text,p_binding_version bigint,p_kind text,p_payload jsonb,p_local_attendees jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare row jsonb;head_version bigint;receipt google_workspace.event_user_commands%rowtype;result jsonb;
begin
 row=google_workspace.event_user_snapshot(p_user_id,p_mode,p_company_id,p_event_id);
 if p_expected_sync_version is null or p_expected_sync_version !~ '^v1:(0|[1-9][0-9]*):(0|[1-9][0-9]*):(0|[1-9][0-9]*)$' then raise exception 'GOOGLE_EVENT_INVALID';end if;
 begin head_version=split_part(p_expected_sync_version,':',3)::bigint;exception when others then raise exception 'GOOGLE_EVENT_INVALID';end;
 -- A lost response replays the immutable existing command; SQL13 validates all
 -- original kind/input/head/owned provenance before returning its journal result.
 select * into receipt from google_workspace.event_user_commands where operation_id=p_operation_id;
 if found then
  if receipt.event_id<>p_event_id or receipt.user_id<>p_user_id or receipt.expected_sync_version<>p_expected_sync_version then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 elsif exists(select 1 from google_workspace.event_commands where operation_id=p_operation_id)
  or row->>'google_sync_version' is distinct from p_expected_sync_version then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 result=public.zelo_google_event_command_prepare(p_user_id,p_mode,p_company_id,p_event_id,p_operation_id,head_version,p_client_fingerprint,p_binding_version,p_kind,p_payload,p_local_attendees);
 if receipt.operation_id is null then
  insert into google_workspace.event_user_commands(operation_id,event_id,user_id,expected_sync_version) values(p_operation_id,p_event_id,p_user_id,p_expected_sync_version);
 end if;
 return result;
end;$$;

create function public.zelo_google_event_user_retry_get(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_mutation_id uuid,p_expected_sync_version text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare receipt google_workspace.event_user_retries%rowtype;
begin
 perform google_workspace.event_user_snapshot(p_user_id,p_mode,p_company_id,p_event_id);
 if p_mutation_id is null or p_expected_sync_version is null or p_expected_sync_version !~ '^v1:(0|[1-9][0-9]*):(0|[1-9][0-9]*):(0|[1-9][0-9]*)$' then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select * into receipt from google_workspace.event_user_retries where mutation_id=p_mutation_id;
 if not found then return null;end if;
 if receipt.event_id<>p_event_id or receipt.user_id<>p_user_id or receipt.mode<>p_mode or receipt.company_id is distinct from p_company_id
  or receipt.expected_sync_version<>p_expected_sync_version then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 return jsonb_build_object('event_id',receipt.event_id,'operation_id',receipt.operation_id);
end;$$;
create function public.zelo_google_event_user_retry(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_mutation_id uuid,p_expected_sync_version text,p_client_fingerprint text,p_binding_version bigint)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare row jsonb;existing jsonb;operation uuid;head_version bigint;attempt bigint;
begin
 row=google_workspace.event_user_snapshot(p_user_id,p_mode,p_company_id,p_event_id);
 existing=public.zelo_google_event_user_retry_get(p_user_id,p_mode,p_company_id,p_event_id,p_mutation_id,p_expected_sync_version);
 if existing is not null then return existing;end if;
 if row->>'google_sync_version' is null or row->>'google_sync_version'<>p_expected_sync_version then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 -- Matching a stored version bounds these numbers before casting, and keeps
 -- creation/command retries on the very same confirmed current operation.
 head_version=split_part(p_expected_sync_version,':',3)::bigint;
 if head_version=0 then
  attempt=split_part(p_expected_sync_version,':',2)::bigint;
  perform public.zelo_google_event_creation_retry(p_user_id,p_mode,p_company_id,p_event_id,p_client_fingerprint,p_binding_version,attempt);
 else
  select operation_id into operation from google_workspace.event_command_heads where event_id=p_event_id and version=head_version;
  if operation is null then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
  attempt=split_part(p_expected_sync_version,':',4)::bigint;
  perform public.zelo_google_event_command_retry(p_user_id,p_mode,p_company_id,p_event_id,operation,p_client_fingerprint,p_binding_version,attempt);
 end if;
 insert into google_workspace.event_user_retries(mutation_id,event_id,user_id,mode,company_id,expected_sync_version,operation_id)
 values(p_mutation_id,p_event_id,p_user_id,p_mode,p_company_id,p_expected_sync_version,operation);
 return jsonb_build_object('event_id',p_event_id,'operation_id',operation);
end;$$;

create function public.zelo_google_appointment_local_patch(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_mutation_id uuid,p_expected_sync_version text,p_payload jsonb,p_patch jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare row jsonb;desired_all_day boolean;attendee jsonb;desired_start timestamptz;desired_end timestamptz;metadata_key text;metadata_value jsonb;receipt google_workspace.event_user_local_mutations%rowtype;
begin
 row=google_workspace.event_user_snapshot(p_user_id,p_mode,p_company_id,p_event_id);
 if p_mutation_id is null then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select * into receipt from google_workspace.event_user_local_mutations where mutation_id=p_mutation_id;
 if found then
  if receipt.event_id<>p_event_id or receipt.user_id<>p_user_id or receipt.mode<>p_mode or receipt.company_id is distinct from p_company_id
   or receipt.expected_sync_version is distinct from p_expected_sync_version or receipt.payload is distinct from p_payload or receipt.metadata is distinct from p_patch then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
  return true;
 end if;
 if row->>'google_sync_version' is distinct from p_expected_sync_version then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>65536
  or(p_patch-array['status','ata_generated','ata_content','ata_notified_at','reminder_sent_at','reminder_15min_sent_at'])<>'{}'::jsonb then raise exception 'GOOGLE_EVENT_INVALID';end if;
 if p_patch?'status' and(jsonb_typeof(p_patch->'status') is distinct from 'string' or p_patch->>'status' not in ('scheduled','done','cancelled'))
  or p_patch?'ata_generated' and jsonb_typeof(p_patch->'ata_generated') is distinct from 'boolean'
  or p_patch?'ata_content' and(p_patch->'ata_content'<>'null'::jsonb and(jsonb_typeof(p_patch->'ata_content') is distinct from 'string' or length(p_patch->>'ata_content')>65536)) then raise exception 'GOOGLE_EVENT_INVALID';end if;
 if(row->>'google_sync_version' is not null or exists(select 1 from google_workspace.event_origins where event_id=p_event_id)) and(p_payload is not null or p_patch->>'status'='cancelled')
  or row->>'status'='cancelled' and p_patch?'status' and p_patch->>'status'<>'cancelled' then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 for metadata_key,metadata_value in select * from jsonb_each(p_patch) loop
  if metadata_key in ('ata_notified_at','reminder_sent_at','reminder_15min_sent_at') and metadata_value<>'null'::jsonb then
   if jsonb_typeof(metadata_value)<>'string' or p_patch->>metadata_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'GOOGLE_EVENT_INVALID';end if;
   begin if not isfinite((p_patch->>metadata_key)::timestamptz) then raise exception 'GOOGLE_EVENT_INVALID';end if;exception when others then raise exception 'GOOGLE_EVENT_INVALID';end;
  end if;
 end loop;
 if p_payload is not null then
  if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768 or p_payload->'withMeet' is distinct from 'false'::jsonb then raise exception 'GOOGLE_EVENT_INVALID';end if;
 if jsonb_typeof(p_payload->'attendees') is distinct from 'array'
  or (p_payload-array['summary','description','location','startAt','endAt','allDay','repeat','attendees','withMeet'])<>'{}'::jsonb
  or jsonb_typeof(p_payload->'summary') is distinct from 'string' or length(btrim(p_payload->>'summary'))=0 or length(p_payload->>'summary')>512
  or jsonb_typeof(p_payload->'description') is distinct from 'string' or length(p_payload->>'description')>8192
  or jsonb_typeof(p_payload->'location') is distinct from 'string' or length(p_payload->>'location')>1024
  or jsonb_typeof(p_payload->'startAt') is distinct from 'string' or jsonb_typeof(p_payload->'endAt') is distinct from 'string'
  or jsonb_typeof(p_payload->'allDay') is distinct from 'boolean' or jsonb_typeof(p_payload->'withMeet') is distinct from 'boolean'
  or jsonb_typeof(p_payload->'repeat') is distinct from 'string' or p_payload->>'repeat' not in ('none','daily','weekly','monthly','yearly')
  then raise exception 'GOOGLE_EVENT_INVALID';end if;
 if jsonb_array_length(p_payload->'attendees')>100 or p_payload->>'summary' ~ '[[:cntrl:]]' or p_payload->>'location' ~ '[[:cntrl:]]'
  or regexp_replace(p_payload->>'description',E'[\\n\\r\\t]','','g') ~ '[[:cntrl:]]' then raise exception 'GOOGLE_EVENT_INVALID';end if;
 for attendee in select value from jsonb_array_elements(p_payload->'attendees') loop
  if jsonb_typeof(attendee)<>'object' or (attendee-array['email','displayName'])<>'{}'::jsonb
   or jsonb_typeof(attendee->'email') is distinct from 'string' or length(attendee->>'email') not between 3 and 254 or attendee->>'email' ~ '[[:cntrl:][:space:]]'
   or position('@' in attendee->>'email')<2 or jsonb_typeof(attendee->'displayName') is distinct from 'string'
   or length(attendee->>'displayName')>256 or attendee->>'displayName' ~ '[[:cntrl:]]' then raise exception 'GOOGLE_EVENT_INVALID';end if;
 end loop;
 desired_all_day=(p_payload->>'allDay')::boolean;
 begin
  if desired_all_day then
   if p_payload->>'startAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or p_payload->>'endAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then raise exception 'GOOGLE_EVENT_INVALID';end if;
   desired_start=(p_payload->>'startAt')::date::timestamp at time zone 'America/Sao_Paulo';
   desired_end=(p_payload->>'endAt')::date::timestamp at time zone 'America/Sao_Paulo';
  else
   if p_payload->>'startAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
    or p_payload->>'endAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' then raise exception 'GOOGLE_EVENT_INVALID';end if;
   desired_start=(p_payload->>'startAt')::timestamptz;desired_end=(p_payload->>'endAt')::timestamptz;
   if to_char(desired_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p_payload->>'startAt'
    or to_char(desired_end at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p_payload->>'endAt' then raise exception 'GOOGLE_EVENT_INVALID';end if;
  end if;
 exception when others then raise exception 'GOOGLE_EVENT_INVALID';end;
 if not isfinite(desired_start) or not isfinite(desired_end) or desired_end<=desired_start then raise exception 'GOOGLE_EVENT_INVALID';end if;
 end if;
 update public.appointments a set
  title=case when p_payload is null then a.title else p_payload->>'summary' end,
  description=case when p_payload is null then a.description else p_payload->>'description' end,
  location=case when p_payload is null then a.location else p_payload->>'location' end,
  start_at=case when p_payload is null then a.start_at else desired_start end,
  end_at=case when p_payload is null then a.end_at else desired_end end,
  all_day=case when p_payload is null then a.all_day else desired_all_day end,
  repeat=case when p_payload is null then a.repeat else p_payload->>'repeat' end,
  status=case when p_patch?'status' then p_patch->>'status' else a.status end,
  ata_generated=case when p_patch?'ata_generated' then (p_patch->>'ata_generated')::boolean else a.ata_generated end,
  ata_content=case when p_patch?'ata_content' then p_patch->>'ata_content' else a.ata_content end,
  ata_notified_at=case when p_patch?'ata_notified_at' then (p_patch->>'ata_notified_at')::timestamptz else a.ata_notified_at end,
  reminder_sent_at=case when p_patch?'reminder_sent_at' then (p_patch->>'reminder_sent_at')::timestamptz else a.reminder_sent_at end,
  reminder_15min_sent_at=case when p_patch?'reminder_15min_sent_at' then (p_patch->>'reminder_15min_sent_at')::timestamptz else a.reminder_15min_sent_at end
 where a.id=p_event_id and a.user_id=p_user_id;
 insert into google_workspace.event_user_local_mutations(mutation_id,event_id,user_id,mode,company_id,expected_sync_version,payload,metadata)
 values(p_mutation_id,p_event_id,p_user_id,p_mode,p_company_id,p_expected_sync_version,p_payload,p_patch);
 return true;
end;$$;
revoke all on function google_workspace.event_user_snapshot(uuid,text,uuid,uuid),
 public.zelo_google_event_command_prepare_expected(uuid,text,uuid,uuid,uuid,text,text,bigint,text,jsonb,jsonb),
 public.zelo_google_event_user_retry_get(uuid,text,uuid,uuid,uuid,text),
 public.zelo_google_event_user_retry(uuid,text,uuid,uuid,uuid,text,text,bigint),
 public.zelo_google_appointment_local_patch(uuid,text,uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function google_workspace.event_user_snapshot(uuid,text,uuid,uuid),
 public.zelo_google_event_command_prepare_expected(uuid,text,uuid,uuid,uuid,text,text,bigint,text,jsonb,jsonb),
 public.zelo_google_event_user_retry_get(uuid,text,uuid,uuid,uuid,text),
 public.zelo_google_event_user_retry(uuid,text,uuid,uuid,uuid,text,text,bigint),
 public.zelo_google_appointment_local_patch(uuid,text,uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
commit;
