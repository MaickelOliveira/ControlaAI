-- Dormant atomic local creation only: no Google call or historical backfill.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table google_workspace.event_origins add constraint google_event_origin_owner_unique unique(event_id,user_id);
alter table public.appointments add constraint google_appointment_owner_unique unique(id,user_id);
alter table public.meets add constraint google_meet_owner_unique unique(id,user_id);
create table google_workspace.event_links (
 event_id uuid primary key references google_workspace.event_creations(event_id),
 user_id uuid not null references public.users(id) on delete cascade,
 appointment_id uuid not null unique,
 meet_id uuid unique,
 kind text not null check(kind in ('appointment','meet')),
 local_metadata jsonb not null check(jsonb_typeof(local_metadata)='object' and octet_length(local_metadata::text)<=16384),
 created_at timestamptz not null default clock_timestamp(),
 check(appointment_id=event_id and ((kind='appointment' and meet_id is null) or (kind='meet' and meet_id=event_id and meet_id is not null))),
 foreign key(event_id,user_id) references google_workspace.event_origins(event_id,user_id),
 -- Keep provenance/history; linked consumers must cancel rather than delete.
 foreign key(appointment_id,user_id) references public.appointments(id,user_id),
 foreign key(meet_id,user_id) references public.meets(id,user_id)
);
alter table google_workspace.event_links enable row level security;
revoke all on google_workspace.event_links from public,anon,authenticated,service_role;
grant select,insert on google_workspace.event_links to service_role;

-- Private linkage/history only, never permission for a provider effect.
create function public.zelo_google_event_local_get(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare l google_workspace.event_links%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 if p_event_id is null then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select x.* into l from google_workspace.event_links x
 join google_workspace.event_origins e on e.event_id=x.event_id and e.user_id=x.user_id
 join public.appointments a on a.id=x.appointment_id and a.user_id=x.user_id
 left join public.meets m on m.id=x.meet_id and m.user_id=x.user_id
 where x.event_id=p_event_id and x.user_id=p_user_id and e.mode=p_mode and e.company_id is not distinct from p_company_id
  and a.company_id is not distinct from p_company_id and not a.workspace_legacy
  and (x.kind='appointment' or (m.id is not null and m.company_id is not distinct from p_company_id and not m.workspace_legacy));
 if not found then return null;end if;
 return jsonb_build_object('event_id',l.event_id,'appointment_id',l.appointment_id,'meet_id',l.meet_id,'kind',l.kind,'local_metadata',l.local_metadata);
end;$$;

-- The server supplies a new authorized UUID, canonical provider payload and
-- captured configured-client/binding snapshot. All inserts commit before Google.
create function public.zelo_google_event_local_create(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,
 p_binding_id uuid,p_grant_id uuid,p_binding_version bigint,p_client_fingerprint text,
 p_payload jsonb,p_kind text,p_source text,p_attendees jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare existing google_workspace.event_links%rowtype;metadata jsonb;result jsonb;
 start_at timestamptz;end_at timestamptz;all_day boolean;requested_meet boolean;attendee jsonb;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if p_event_id is null or p_kind is null or p_kind not in ('appointment','meet') or p_source is null or p_source not in ('web','whatsapp')
  or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768
  or p_attendees is null or jsonb_typeof(p_attendees)<>'array' or octet_length(p_attendees::text)>16000 then raise exception 'GOOGLE_EVENT_INVALID';end if;
 if jsonb_array_length(p_attendees)>100 or jsonb_typeof(p_payload->'attendees') is distinct from 'array'
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
 for attendee in select value from jsonb_array_elements(p_attendees) loop
  if jsonb_typeof(attendee)<>'object' or (attendee-array['name','phone','email'])<>'{}'::jsonb
   or jsonb_typeof(attendee->'name') is distinct from 'string' or length(attendee->>'name')>256 or attendee->>'name' ~ '[[:cntrl:]]'
   or (attendee?'phone' and (jsonb_typeof(attendee->'phone') is distinct from 'string' or length(attendee->>'phone')>64 or attendee->>'phone' ~ '[[:cntrl:]]'))
   or (attendee?'email' and (jsonb_typeof(attendee->'email') is distinct from 'string' or length(attendee->>'email')>254 or attendee->>'email' ~ '[[:cntrl:]]'))
   then raise exception 'GOOGLE_EVENT_INVALID';end if;
 end loop;
 all_day=(p_payload->>'allDay')::boolean;requested_meet=(p_payload->>'withMeet')::boolean;
 if (p_kind='appointment' and p_attendees<>'[]'::jsonb) or (p_kind='meet' and (not requested_meet or all_day or p_payload->>'repeat'<>'none')) then raise exception 'GOOGLE_EVENT_INVALID';end if;
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
 metadata=jsonb_build_object('source',p_source,'attendees',p_attendees);
 select * into existing from google_workspace.event_links where event_id=p_event_id;
 if found then
  result=public.zelo_google_event_local_get(p_user_id,p_mode,p_company_id,p_event_id);
  if result is null or existing.kind<>p_kind or existing.local_metadata<>metadata
   or not exists(select 1 from google_workspace.event_creations where event_id=p_event_id and payload=p_payload and with_meet=requested_meet)
   then raise exception 'GOOGLE_EVENT_LOCAL_CONFLICT';end if;
  return result;
 end if;
 if exists(select 1 from google_workspace.event_origins where event_id=p_event_id)
  or exists(select 1 from public.appointments where id=p_event_id) or exists(select 1 from public.meets where id=p_event_id)
  then raise exception 'GOOGLE_EVENT_LOCAL_CONFLICT';end if;
 perform public.zelo_google_event_origin_reserve(p_user_id,p_mode,p_company_id,p_event_id,p_binding_id,p_grant_id,p_binding_version,p_client_fingerprint);
 perform public.zelo_google_event_creation_prepare(p_user_id,p_mode,p_company_id,p_event_id,p_client_fingerprint,p_binding_version,p_payload,requested_meet);
 insert into public.appointments(id,user_id,company_id,workspace_legacy,title,description,location,start_at,end_at,all_day,repeat,status,source)
 values(p_event_id,p_user_id,p_company_id,false,case when p_kind='meet' then '🎥 ' else '' end||(p_payload->>'summary'),
  p_payload->>'description',p_payload->>'location',start_at,end_at,all_day,p_payload->>'repeat','scheduled',p_source);
 if p_kind='meet' then
  insert into public.meets(id,user_id,company_id,workspace_legacy,title,description,start_at,end_at,attendees,status,source)
  values(p_event_id,p_user_id,p_company_id,false,p_payload->>'summary',p_payload->>'description',start_at,end_at,p_attendees,'scheduled',p_source);
 end if;
 insert into google_workspace.event_links(event_id,user_id,appointment_id,meet_id,kind,local_metadata)
 values(p_event_id,p_user_id,p_event_id,case when p_kind='meet' then p_event_id else null end,p_kind,metadata);
 result=public.zelo_google_event_local_get(p_user_id,p_mode,p_company_id,p_event_id);
 if result is null then raise exception 'GOOGLE_EVENT_LOCAL_CONFLICT';end if;
 return result;
end;$$;
revoke all on function public.zelo_google_event_local_get(uuid,text,uuid,uuid),
 public.zelo_google_event_local_create(uuid,text,uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.zelo_google_event_local_get(uuid,text,uuid,uuid),
 public.zelo_google_event_local_create(uuid,text,uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,jsonb) to service_role;
commit;
