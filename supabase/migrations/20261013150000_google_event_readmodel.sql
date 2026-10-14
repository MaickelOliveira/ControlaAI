-- Scoped public rows and allowlisted sync metadata in one SELECT snapshot.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
create function google_workspace.event_read_sync(p_creation google_workspace.event_creations,p_head google_workspace.event_command_heads,p_command google_workspace.event_commands,p_status text,p_legacy boolean,p_calendar boolean)
returns jsonb language sql immutable security invoker set search_path=pg_catalog as $$
 select jsonb_build_object(
  'google_sync_version',case when (p_creation).event_id is null then null else 'v1:'||(p_creation).attempt_version::text||':'||coalesce((p_head).version::text,'0')||':'||coalesce((p_command).attempt_version::text,'0') end,
  'google_sync_state',case when (p_creation).event_id is null then case when p_legacy or p_calendar then 'legacy' else 'local' end else coalesce((p_command).state,(p_creation).state) end,
  'google_sync_failure_code',case when (p_creation).event_id is null then null when (p_command).operation_id is not null then (p_command).failure_code else (p_creation).failure_code end,
  'google_meet_pending',coalesce((p_creation).event_id is not null and case when (p_command).operation_id is not null then (p_command).kind='conference' and (p_command).state in ('queued','running','waiting') else (p_creation).with_meet and (p_creation).state in ('queued','running','waiting') end,false),
  'google_cancellation_pending',coalesce((p_creation).event_id is not null and p_status='cancelled' and (p_command).kind='delete' and (p_command).state in ('queued','running','waiting','failed'),false));
$$;
create function public.zelo_google_appointment_rows(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_limit integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare result jsonb;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 if p_limit is null or p_limit<1 or p_limit>1000 then raise exception 'GOOGLE_EVENT_INVALID';end if;
 with visible as (
  select r.* from public.appointments r where r.user_id=p_user_id and(p_event_id is null or r.id=p_event_id)
   and((p_mode='business' and r.company_id=p_company_id) or(p_mode='personal' and(r.company_id is null or r.workspace_legacy)))
   and(r.company_id is null or exists(select 1 from public.companies company where company.id=r.company_id and company.user_id=r.user_id and company.archived_at is null))
 ),prepared as (
  select r.id,r.start_at,r.status,jsonb_build_object('id',r.id,'user_id',r.user_id,'company_id',r.company_id,'workspace_legacy',r.workspace_legacy,'title',r.title,'description',r.description,'start_at',r.start_at,'end_at',r.end_at,'source',r.source,'created_at',r.created_at,'meet_link',r.meet_link,'calendar_event_id',r.calendar_event_id,'ata_generated',r.ata_generated,'ata_content',r.ata_content,'ata_notified_at',r.ata_notified_at,'status',r.status,'location',r.location,'all_day',r.all_day,'repeat',r.repeat,'reminder_sent_at',r.reminder_sent_at,'reminder_15min_sent_at',r.reminder_15min_sent_at) as public_row,
   google_workspace.event_read_sync(creation,head,command,r.status,r.workspace_legacy,length(btrim(coalesce(r.calendar_event_id,'')))>0) as sync
  from visible r left join google_workspace.event_links link on link.appointment_id=r.id and link.user_id=r.user_id and not r.workspace_legacy
  left join google_workspace.event_origins origin on origin.event_id=link.event_id and origin.user_id=r.user_id and origin.mode=p_mode and origin.company_id is not distinct from p_company_id
  left join google_workspace.event_creations creation on creation.event_id=origin.event_id
  left join google_workspace.event_command_heads head on head.event_id=creation.event_id
  left join google_workspace.event_commands command on command.operation_id=head.operation_id and command.event_id=head.event_id and command.head_version=head.version
 ),selected as (
  select * from prepared where p_event_id is not null or status<>'cancelled' or(sync->>'google_cancellation_pending')::boolean order by start_at,id limit p_limit
 )
 select coalesce(jsonb_agg(public_row||sync order by start_at,id),'[]'::jsonb) into result from selected;
 return result;
end;$$;
create function public.zelo_google_meet_rows(p_user_id uuid,p_mode text,p_company_id uuid,p_event_id uuid,p_limit integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare result jsonb;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 if p_limit is null or p_limit<1 or p_limit>1000 then raise exception 'GOOGLE_EVENT_INVALID';end if;
 with visible as (
  select r.* from public.meets r where r.user_id=p_user_id and(p_event_id is null or r.id=p_event_id)
   and((p_mode='business' and r.company_id=p_company_id) or(p_mode='personal' and(r.company_id is null or r.workspace_legacy)))
   and(r.company_id is null or exists(select 1 from public.companies company where company.id=r.company_id and company.user_id=r.user_id and company.archived_at is null))
 ),prepared as (
  select r.id,r.start_at,r.status,jsonb_build_object('id',r.id,'user_id',r.user_id,'company_id',r.company_id,'workspace_legacy',r.workspace_legacy,'title',r.title,'description',r.description,'start_at',r.start_at,'end_at',r.end_at,'source',r.source,'created_at',r.created_at,'meet_link',r.meet_link,'calendar_event_id',r.calendar_event_id,'ata_generated',r.ata_generated,'ata_content',r.ata_content,'ata_notified_at',r.ata_notified_at,'status',r.status,'attendees',r.attendees) as public_row,
   google_workspace.event_read_sync(creation,head,command,r.status,r.workspace_legacy,length(btrim(coalesce(r.calendar_event_id,'')))>0) as sync
  from visible r left join google_workspace.event_links link on link.meet_id=r.id and link.user_id=r.user_id and not r.workspace_legacy
  left join google_workspace.event_origins origin on origin.event_id=link.event_id and origin.user_id=r.user_id and origin.mode=p_mode and origin.company_id is not distinct from p_company_id
  left join google_workspace.event_creations creation on creation.event_id=origin.event_id
  left join google_workspace.event_command_heads head on head.event_id=creation.event_id
  left join google_workspace.event_commands command on command.operation_id=head.operation_id and command.event_id=head.event_id and command.head_version=head.version
 ),selected as (
  select * from prepared where p_event_id is not null or status<>'cancelled' or(sync->>'google_cancellation_pending')::boolean order by start_at,id limit p_limit
 )
 select coalesce(jsonb_agg(public_row||sync order by start_at,id),'[]'::jsonb) into result from selected;
 return result;
end;$$;
revoke all on function google_workspace.event_read_sync(google_workspace.event_creations,google_workspace.event_command_heads,google_workspace.event_commands,text,boolean,boolean),public.zelo_google_appointment_rows(uuid,text,uuid,uuid,integer),public.zelo_google_meet_rows(uuid,text,uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function google_workspace.event_read_sync(google_workspace.event_creations,google_workspace.event_command_heads,google_workspace.event_commands,text,boolean,boolean),public.zelo_google_appointment_rows(uuid,text,uuid,uuid,integer),public.zelo_google_meet_rows(uuid,text,uuid,uuid,integer) to service_role;
commit;

