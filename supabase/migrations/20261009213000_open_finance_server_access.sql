-- Reviewed server-only operations. Does not enable users or expose the schema.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function public.zelo_of_access(p_user uuid) returns jsonb
language sql stable security definer set search_path = pg_catalog set row_security = off as $$
  select jsonb_build_object('enabled',enabled,'country_code',country_code,'country_verified_at',country_verified_at)
  from open_finance.user_access where user_id = p_user;
$$;

create function public.zelo_of_overview(p_user uuid, p_environment text, p_mode text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog set row_security = off as $$
begin
  if p_environment <> 'production' or p_mode not in ('personal','business') or p_mode is null or p_environment is null then
    raise exception 'OF_SCOPE_INVALID';
  end if;
  if not exists(select 1 from open_finance.user_access where user_id=p_user and enabled and country_code='BR' and country_verified_at is not null) then
    raise exception 'OF_ACCESS_DENIED';
  end if;
  return jsonb_build_object(
    'connections',coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' - 'external_consent_id' - 'institution_id' order by c.created_at desc) from open_finance.connections c where c.user_id=p_user and c.environment=p_environment and c.mode=p_mode),'[]'::jsonb),
    'resources',coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' - 'external_id' order by r.name) from open_finance.resources r where r.user_id=p_user and r.environment=p_environment and r.mode=p_mode),'[]'::jsonb),
    'limits',coalesce((select jsonb_agg(to_jsonb(l) - 'user_id') from open_finance.card_limits l where l.user_id=p_user and l.environment=p_environment and l.mode=p_mode),'[]'::jsonb),
    'bills',coalesce((select jsonb_agg(to_jsonb(b) - 'user_id' - 'external_id' order by b.due_date desc) from open_finance.bills b where b.user_id=p_user and b.environment=p_environment and b.mode=p_mode),'[]'::jsonb),
    'credit',coalesce((select jsonb_agg(to_jsonb(d) - 'user_id') from open_finance.credit_details d where d.user_id=p_user and d.environment=p_environment and d.mode=p_mode),'[]'::jsonb),
    'sync',coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' - 'cursor' - 'scope_key') from open_finance.sync_state s where s.user_id=p_user and s.environment=p_environment and s.mode=p_mode),'[]'::jsonb)
  );
end;
$$;

-- PostgreSQL grants new functions to PUBLIC by default: revoke atomically.
revoke all on function public.zelo_of_access(uuid) from public, anon, authenticated;
revoke all on function public.zelo_of_overview(uuid,text,text) from public, anon, authenticated;
grant execute on function public.zelo_of_access(uuid) to service_role;
grant execute on function public.zelo_of_overview(uuid,text,text) to service_role;
commit;
