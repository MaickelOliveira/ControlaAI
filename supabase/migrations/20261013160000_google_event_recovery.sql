-- Backend-only bounded references. No claim, provider call or inferred history.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
create function public.zelo_google_event_pending(p_limit integer)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare result jsonb;
begin
 if p_limit is null or p_limit<1 or p_limit>20 then raise exception 'GOOGLE_EVENT_INVALID';end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',job.user_id,'mode',job.mode,'company_id',job.company_id,'event_id',job.event_id,'operation_id',job.operation_id)
  order by job.created_at,job.event_id),'[]'::jsonb) into result from (
  select origin.user_id,origin.mode,origin.company_id,origin.event_id,command.operation_id,coalesce(command.created_at,creation.created_at) as created_at
  from google_workspace.event_origins origin
  join public.users owner on owner.id=origin.user_id and owner.status='active'
  join google_workspace.owner_activations activation on activation.user_id=owner.id
  join google_workspace.bindings binding on binding.id=origin.binding_id and binding.grant_id=origin.grant_id and binding.user_id=origin.user_id
   and binding.mode=origin.mode and binding.company_id is not distinct from origin.company_id and binding.unlinked_at is null
  join google_workspace.grants grant_record on grant_record.id=origin.grant_id and grant_record.user_id=origin.user_id
  join google_workspace.event_creations creation on creation.event_id=origin.event_id
  join google_workspace.event_links link on link.event_id=origin.event_id and link.user_id=origin.user_id
  join public.appointments appointment on appointment.id=link.appointment_id and appointment.user_id=origin.user_id
   and appointment.company_id is not distinct from origin.company_id and not appointment.workspace_legacy
  left join public.meets meet on meet.id=link.meet_id and meet.user_id=origin.user_id
  left join public.companies company on company.id=origin.company_id and company.user_id=origin.user_id
  left join google_workspace.event_command_heads head on head.event_id=origin.event_id
  left join google_workspace.event_commands command on command.operation_id=head.operation_id and command.event_id=head.event_id and command.head_version=head.version
  where(origin.company_id is null or(company.id is not null and company.archived_at is null))
   and(link.kind='appointment' or(meet.id is not null and meet.company_id is not distinct from origin.company_id and not meet.workspace_legacy))
   and((head.operation_id is null and creation.round_attempts<10 and(creation.was_attempted or creation.authorized_binding_version=binding.version)
    and(creation.state in ('queued','waiting') or(creation.state='running' and creation.lease_until<=statement_timestamp()))
    and appointment.status='scheduled' and(link.kind='appointment' or meet.status='scheduled'))
    or(command.operation_id is not null and not head.deleted and command.round_attempts<10 and(command.was_attempted or command.authorized_binding_version=binding.version)
     and(command.state in ('queued','waiting') or(command.state='running' and command.lease_until<=statement_timestamp()))
     and((command.kind='delete' and appointment.status='cancelled' and(link.kind='appointment' or meet.status='cancelled'))
      or(command.kind<>'delete' and appointment.status='scheduled' and(link.kind='appointment' or meet.status='scheduled')))))
  order by coalesce(command.created_at,creation.created_at),origin.event_id limit p_limit
 ) job;
 return result;
end;$$;
revoke all on function public.zelo_google_event_pending(integer) from public,anon,authenticated,service_role;
grant execute on function public.zelo_google_event_pending(integer) to service_role;
commit;
