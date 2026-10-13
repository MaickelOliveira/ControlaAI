-- Dormant preparation: capture the exact connection revision before Google consent.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table google_workspace.oauth_states in access exclusive mode;
do $$begin
 if exists(select 1 from google_workspace.oauth_states where expires_at>clock_timestamp()) then
  raise exception 'GOOGLE_STATE_MIGRATION_PENDING';
 end if;
end;$$;
-- Old expired rows remain unchanged; never invent a usable original revision.
alter table google_workspace.oauth_states add column binding_version bigint check(binding_version>=0);

create or replace function public.zelo_google_state_issue(
 p_user_id uuid,p_mode text,p_company_id uuid,p_state_hash text,p_session_hash text,
 p_client_fingerprint text,p_nonce_hash text,p_locale text
) returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare hash_value text;created timestamptz;captured_version bigint;
begin
 if p_user_id is null or p_mode is null or p_mode not in ('personal','business')
    or not ((p_mode='personal' and p_company_id is null) or (p_mode='business' and p_company_id is not null))
    or p_locale is null or p_locale not in ('pt-BR','pt-PT','es') then raise exception 'GOOGLE_STATE_INVALID';end if;
 foreach hash_value in array array[p_state_hash,p_session_hash,p_client_fingerprint,p_nonce_hash] loop
  if hash_value is null or hash_value !~ '^[a-f0-9]{64}$' then raise exception 'GOOGLE_STATE_INVALID';end if;
 end loop;
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 perform pg_advisory_xact_lock(hashtextextended('google-oauth-state:'||p_user_id::text,0));
 select coalesce((select version from google_workspace.bindings where user_id=p_user_id and mode=p_mode and company_id is not distinct from p_company_id),0) into captured_version;
 created:=clock_timestamp();
 delete from google_workspace.oauth_states where state_hash in (
  select state_hash from google_workspace.oauth_states where user_id=p_user_id and expires_at<=created order by expires_at,state_hash limit 100
 );
 if (select count(*) from google_workspace.oauth_states where user_id=p_user_id and expires_at>created)>=20 then raise exception 'GOOGLE_STATE_LIMIT';end if;
 insert into google_workspace.oauth_states(state_hash,user_id,mode,company_id,session_hash,client_fingerprint,nonce_hash,locale,created_at,expires_at,binding_version)
 values(p_state_hash,p_user_id,p_mode,p_company_id,p_session_hash,p_client_fingerprint,p_nonce_hash,p_locale,created,created+interval '10 minutes',captured_version);
end;$$;

create or replace function public.zelo_google_state_consume(
 p_user_id uuid,p_state_hash text,p_session_hash text,p_client_fingerprint text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare pending google_workspace.oauth_states%rowtype;hash_value text;current_version bigint;
begin
 if p_user_id is null then raise exception 'GOOGLE_STATE_INVALID';end if;
 foreach hash_value in array array[p_state_hash,p_session_hash,p_client_fingerprint] loop
  if hash_value is null or hash_value !~ '^[a-f0-9]{64}$' then raise exception 'GOOGLE_STATE_INVALID';end if;
 end loop;
 -- Owner lock comes before the state row, as issue and binding mutations do.
 perform 1 from public.users where id=p_user_id for update;
 if not found then return null;end if;
 delete from google_workspace.oauth_states
 where state_hash=p_state_hash and user_id=p_user_id and session_hash=p_session_hash and client_fingerprint=p_client_fingerprint
 returning * into pending;
 if not found then return null;end if;
 if pending.expires_at<=clock_timestamp() or pending.binding_version is null then return null;end if;
 if pending.mode='business' then
  perform 1 from public.companies where id=pending.company_id and user_id=pending.user_id and archived_at is null for share;
  if not found then return null;end if;
 end if;
 select coalesce((select version from google_workspace.bindings where user_id=pending.user_id and mode=pending.mode and company_id is not distinct from pending.company_id),0) into current_version;
 if current_version<>pending.binding_version then return null;end if;
 return jsonb_build_object('user_id',pending.user_id,'mode',pending.mode,'company_id',pending.company_id,
  'locale',pending.locale,'nonce_hash',pending.nonce_hash,'expires_at',pending.expires_at,'binding_version',pending.binding_version::text);
end;$$;
revoke all on function public.zelo_google_state_issue(uuid,text,uuid,text,text,text,text,text),
 public.zelo_google_state_consume(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.zelo_google_state_issue(uuid,text,uuid,text,text,text,text,text),
 public.zelo_google_state_consume(uuid,text,text,text) to service_role;
commit;
