-- Dormant local effect guards/completion. No provider call or legacy inference.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create function google_workspace.event_local_context(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid)
returns google_workspace.event_links language plpgsql security invoker set search_path=pg_catalog as $$
declare l google_workspace.event_links%rowtype;a public.appointments%rowtype;m public.meets%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if public.zelo_google_event_local_get(p_user_id,p_mode,p_company_id,p_event_id) is null then raise exception 'GOOGLE_EVENT_LOCAL_INACTIVE';end if;
 select * into l from google_workspace.event_links where event_id=p_event_id and user_id=p_user_id;
 begin
  select * into a from public.appointments where id=l.appointment_id and user_id=p_user_id for update nowait;
  if a.id is null or a.company_id is distinct from p_company_id or a.workspace_legacy or a.status<>'scheduled' then raise exception 'GOOGLE_EVENT_LOCAL_INACTIVE';end if;
  if l.kind='meet' then
   select * into m from public.meets where id=l.meet_id and user_id=p_user_id for update nowait;
   if m.id is null or m.company_id is distinct from p_company_id or m.workspace_legacy or m.status<>'scheduled' then raise exception 'GOOGLE_EVENT_LOCAL_INACTIVE';end if;
  end if;
 exception when lock_not_available then raise exception 'GOOGLE_EVENT_LOCAL_CONFLICT';end;
 return l;
end;$$;

-- Before credential runtime: known missing/cancelled records cannot initiate work.
create function public.zelo_google_event_local_active(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
begin
 perform google_workspace.event_local_context(p_user_id,p_mode,p_company_id,p_event_id);
 return true;
end;$$;

-- Recheck immediately before each Calendar request, then release the locks.
create function public.zelo_google_event_local_preflight(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_client_fingerprint text,p_binding_version bigint,p_attempt_version bigint,p_lease_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare c google_workspace.event_creations%rowtype;
begin
 perform google_workspace.event_local_context(p_user_id,p_mode,p_company_id,p_event_id);
 perform google_workspace.event_creation_context(p_user_id,p_mode,p_company_id,p_event_id,p_client_fingerprint,p_binding_version);
 select * into c from google_workspace.event_creations where event_id=p_event_id;
 if p_attempt_version is null or p_lease_id is null or c.event_id is null or c.state<>'running' or c.attempt_version<>p_attempt_version
  or c.lease_id<>p_lease_id or c.lease_binding_version<>p_binding_version or c.lease_until<=clock_timestamp()+interval '16 seconds'
  then raise exception 'GOOGLE_EVENT_ATTEMPT_CONFLICT';end if;
 return true;
end;$$;

-- Verified adapter outcome only. Finish and both public results commit together.
create function public.zelo_google_event_local_finish(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_client_fingerprint text,p_binding_version bigint,
 p_attempt_version bigint,p_lease_id uuid,p_result text,p_remote_known boolean,p_etag text,p_meet_link text,p_failure_code text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare l google_workspace.event_links%rowtype;e google_workspace.event_origins%rowtype;result jsonb;
begin
 l=google_workspace.event_local_context(p_user_id,p_mode,p_company_id,p_event_id);
 e=google_workspace.event_creation_context(p_user_id,p_mode,p_company_id,p_event_id,p_client_fingerprint,p_binding_version);
 if p_result in ('succeeded','waiting') and (p_remote_known is distinct from true or p_etag is null) then raise exception 'GOOGLE_EVENT_INVALID';end if;
 result=public.zelo_google_event_creation_finish(p_user_id,p_mode,p_company_id,p_event_id,p_client_fingerprint,p_binding_version,
  p_attempt_version,p_lease_id,p_result,p_remote_known,p_etag,p_meet_link,p_failure_code);
 if p_result in ('succeeded','waiting') and result->>'state' in ('succeeded','waiting') then
  update public.appointments set calendar_event_id='gcal:'||jsonb_build_object('eventId',e.remote_event_id,'calendarId',e.calendar_id)::text,
   meet_link=case when p_result='succeeded' then p_meet_link else null end where id=l.appointment_id and user_id=p_user_id;
  if l.kind='meet' then
   update public.meets set calendar_event_id=e.remote_event_id,meet_link=case when p_result='succeeded' then coalesce(p_meet_link,'') else '' end
    where id=l.meet_id and user_id=p_user_id;
  end if;
 end if;
 return result;
end;$$;
revoke all on function google_workspace.event_local_context(uuid,text,uuid,uuid),public.zelo_google_event_local_active(uuid,text,uuid,uuid),
 public.zelo_google_event_local_preflight(uuid,text,uuid,uuid,text,bigint,bigint,uuid),
 public.zelo_google_event_local_finish(uuid,text,uuid,uuid,text,bigint,bigint,uuid,text,boolean,text,text,text) from public,anon,authenticated,service_role;
grant execute on function google_workspace.event_local_context(uuid,text,uuid,uuid),public.zelo_google_event_local_active(uuid,text,uuid,uuid),
 public.zelo_google_event_local_preflight(uuid,text,uuid,uuid,text,bigint,bigint,uuid),
 public.zelo_google_event_local_finish(uuid,text,uuid,uuid,text,bigint,bigint,uuid,text,boolean,text,text,text) to service_role;
commit;
