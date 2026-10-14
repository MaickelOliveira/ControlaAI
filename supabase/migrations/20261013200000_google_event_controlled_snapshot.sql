-- Private desired controlled values bound to the exact confirmed revision.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
create function public.zelo_google_event_controlled_snapshot(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_expected_sync_version text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare row jsonb;link google_workspace.event_links%rowtype;creation google_workspace.event_creations%rowtype;meeting public.meets%rowtype;
 desired jsonb;guests jsonb;locals jsonb='[]'::jsonb;payload jsonb;summary text;captured_head_version bigint;
begin
 row=google_workspace.event_user_snapshot(p_user_id,p_mode,p_company_id,p_event_id);
 if p_expected_sync_version is null or row->>'google_sync_version' is distinct from p_expected_sync_version then raise exception 'GOOGLE_EVENT_COMMAND_CONFLICT';end if;
 if public.zelo_google_event_local_get(p_user_id,p_mode,p_company_id,p_event_id) is null or row->>'status'<>'scheduled' then raise exception 'GOOGLE_EVENT_LOCAL_INACTIVE';end if;
 select * into link from google_workspace.event_links where event_id=p_event_id and user_id=p_user_id;
 select * into creation from google_workspace.event_creations where event_id=p_event_id;
 if link.event_id is null or creation.event_id is null then raise exception 'GOOGLE_EVENT_ORIGIN_MISSING';end if;
 captured_head_version=split_part(p_expected_sync_version,':',3)::bigint;
 select c.payload into desired from google_workspace.event_commands c where c.event_id=p_event_id and c.kind='update' and c.head_version<=captured_head_version order by c.head_version desc limit 1;
 guests=coalesce(desired->'attendees',creation.payload->'attendees');summary=row->>'title';
 if link.kind='meet' then
  begin select * into meeting from public.meets where id=link.meet_id and user_id=p_user_id and company_id is not distinct from p_company_id and not workspace_legacy and status='scheduled' for share nowait;
  exception when lock_not_available then raise exception 'GOOGLE_EVENT_LOCAL_CONFLICT';end;
  if meeting.id is null then raise exception 'GOOGLE_EVENT_LOCAL_INACTIVE';end if;
  summary=meeting.title;locals=meeting.attendees;
  select coalesce(jsonb_agg(jsonb_build_object('email',guest->>'email','displayName',guest->>'name') order by ordinal),'[]'::jsonb) into guests
   from jsonb_array_elements(locals) with ordinality as attendees(guest,ordinal) where guest?'email';
 end if;
 payload=jsonb_build_object('summary',summary,'description',coalesce(row->>'description',''),'location',coalesce(row->>'location',''),
  'startAt',case when(row->>'all_day')::boolean then to_char((row->>'start_at')::timestamptz at time zone 'America/Sao_Paulo','YYYY-MM-DD') else to_char((row->>'start_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
  'endAt',case when(row->>'all_day')::boolean then to_char((row->>'end_at')::timestamptz at time zone 'America/Sao_Paulo','YYYY-MM-DD') else to_char((row->>'end_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
  'allDay',(row->>'all_day')::boolean,'repeat',row->>'repeat','attendees',guests);
 return jsonb_build_object('kind',link.kind,'payload',payload,'local_attendees',locals);
end;$$;
revoke all on function public.zelo_google_event_controlled_snapshot(uuid,text,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.zelo_google_event_controlled_snapshot(uuid,text,uuid,uuid,text) to service_role;
commit;
