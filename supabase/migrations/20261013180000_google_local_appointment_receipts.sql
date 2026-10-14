-- New local-only appointments have immutable retry receipts, no Google origin.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
create table google_workspace.local_appointment_receipts (
 event_id uuid primary key,
 user_id uuid not null references public.users(id) on delete cascade,
 mode text not null check(mode in ('personal','business')),
 company_id uuid,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=32768 and payload->'withMeet'='false'::jsonb),
 source text not null check(source in ('web','whatsapp')),
 created_at timestamptz not null default clock_timestamp(),
 check((mode='personal' and company_id is null) or(mode='business' and company_id is not null)),
 foreign key(company_id,user_id) references public.companies(id,user_id),
 foreign key(event_id,user_id) references public.appointments(id,user_id) on delete cascade
);
alter table google_workspace.local_appointment_receipts enable row level security;
revoke all on google_workspace.local_appointment_receipts from public,anon,authenticated,service_role;
grant select,insert on google_workspace.local_appointment_receipts to service_role;

-- Receipt data is private server history, never authority for a provider effect.
create function public.zelo_google_local_appointment_get(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare receipt google_workspace.local_appointment_receipts%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 if p_event_id is null then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select r.* into receipt from google_workspace.local_appointment_receipts r
 join public.appointments a on a.id=r.event_id and a.user_id=r.user_id
 where r.event_id=p_event_id and r.user_id=p_user_id and r.mode=p_mode and r.company_id is not distinct from p_company_id
  and a.company_id is not distinct from p_company_id and not a.workspace_legacy;
 if not found then return null;end if;
 return jsonb_build_object('event_id',receipt.event_id,'user_id',receipt.user_id,'mode',receipt.mode,'company_id',receipt.company_id,'payload',receipt.payload,'source',receipt.source);
end;$$;

create function public.zelo_google_local_appointment_create(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_payload jsonb,p_source text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare existing google_workspace.local_appointment_receipts%rowtype;result jsonb;all_day boolean;attendee jsonb;start_at timestamptz;end_at timestamptz;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if p_event_id is null or p_source is null or p_source not in ('web','whatsapp') or p_payload is null
  or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768 or p_payload->'withMeet' is distinct from 'false'::jsonb
  then raise exception 'GOOGLE_EVENT_INVALID';end if;
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
 all_day=(p_payload->>'allDay')::boolean;
 begin
  if all_day then
   if p_payload->>'startAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or p_payload->>'endAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then raise exception 'GOOGLE_EVENT_INVALID';end if;
   start_at=(p_payload->>'startAt')::date::timestamp at time zone 'America/Sao_Paulo';
   end_at=(p_payload->>'endAt')::date::timestamp at time zone 'America/Sao_Paulo';
  else
   if p_payload->>'startAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
    or p_payload->>'endAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' then raise exception 'GOOGLE_EVENT_INVALID';end if;
   start_at=(p_payload->>'startAt')::timestamptz;end_at=(p_payload->>'endAt')::timestamptz;
   if to_char(start_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p_payload->>'startAt'
    or to_char(end_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p_payload->>'endAt' then raise exception 'GOOGLE_EVENT_INVALID';end if;
  end if;
 exception when others then raise exception 'GOOGLE_EVENT_INVALID';end;
 if not isfinite(start_at) or not isfinite(end_at) or end_at<=start_at then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select * into existing from google_workspace.local_appointment_receipts where event_id=p_event_id;
 if found then
  result=public.zelo_google_local_appointment_get(p_user_id,p_mode,p_company_id,p_event_id);
  if result is null or existing.payload<>p_payload or existing.source<>p_source then raise exception 'GOOGLE_EVENT_LOCAL_CONFLICT';end if;
  -- Replays preserve current local edits/cancellation; the receipt stays original.
  return result;
 end if;
 if exists(select 1 from public.appointments where id=p_event_id) or exists(select 1 from public.meets where id=p_event_id)
  or exists(select 1 from google_workspace.event_origins where event_id=p_event_id)
  then raise exception 'GOOGLE_EVENT_LOCAL_CONFLICT';end if;
 insert into public.appointments(id,user_id,company_id,workspace_legacy,title,description,location,start_at,end_at,all_day,repeat,status,source)
 values(p_event_id,p_user_id,p_company_id,false,p_payload->>'summary',p_payload->>'description',p_payload->>'location',start_at,end_at,all_day,p_payload->>'repeat','scheduled',p_source);
 insert into google_workspace.local_appointment_receipts(event_id,user_id,mode,company_id,payload,source)
 values(p_event_id,p_user_id,p_mode,p_company_id,p_payload,p_source);
 result=public.zelo_google_local_appointment_get(p_user_id,p_mode,p_company_id,p_event_id);
 if result is null then raise exception 'GOOGLE_EVENT_LOCAL_CONFLICT';end if;
 return result;
end;$$;
revoke all on function public.zelo_google_local_appointment_get(uuid,text,uuid,uuid),public.zelo_google_local_appointment_create(uuid,text,uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.zelo_google_local_appointment_get(uuid,text,uuid,uuid),public.zelo_google_local_appointment_create(uuid,text,uuid,uuid,jsonb,text) to service_role;
commit;
