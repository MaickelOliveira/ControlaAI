begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
drop function public.zelo_of_enable_brazil(uuid,text,text,boolean);
drop function public.zelo_of_event_target(text,text);
drop function public.zelo_of_worker_scope(text,text);
create or replace function public.zelo_of_capabilities(p_user uuid,p_mode text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
begin
  perform open_finance.require_access(p_user,p_mode);
  return jsonb_build_object('version','private-sync-v4','worker_recent',coalesce((select (case when p_mode='personal' then last_worker_personal_at else last_worker_business_at end)>now()-interval '3 minutes' from open_finance.user_access where user_id=p_user),false));
end $$;
drop table open_finance.worker_health;
-- Keep the holder's eligibility evidence and connections; never delete bank history.
commit;
