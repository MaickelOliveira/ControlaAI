-- Incrementa e verifica o limite em uma única operação, impedindo que
-- requisições concorrentes leiam a mesma contagem e contornem o bloqueio.
create or replace function public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_ms bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_now timestamptz := clock_timestamp();
  v_cutoff timestamptz;
begin
  if p_key is null or p_key = '' or p_max < 1 or p_window_ms < 1 then
    return false;
  end if;

  v_cutoff := v_now - (p_window_ms::double precision * interval '1 millisecond');

  insert into public.rate_limits as rl (key, count, window_start)
  values (p_key, 1, v_now)
  on conflict (key) do update
  set
    count = case when rl.window_start <= v_cutoff then 1 else rl.count + 1 end,
    window_start = case when rl.window_start <= v_cutoff then v_now else rl.window_start end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, bigint) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, bigint) to service_role;
