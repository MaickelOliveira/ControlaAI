-- Dormant preparation: existing Google routes and encrypted grants are unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create schema if not exists google_workspace;
revoke all on schema google_workspace from public,anon,authenticated;
grant usage on schema google_workspace to service_role;
create table google_workspace.oauth_states (
 state_hash text primary key check(state_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid not null references public.users(id) on delete cascade,
 mode text not null check(mode in ('personal','business')),
 company_id uuid,
 session_hash text not null check(session_hash ~ '^[a-f0-9]{64}$'),
 client_fingerprint text not null check(client_fingerprint ~ '^[a-f0-9]{64}$'),
 nonce_hash text not null check(nonce_hash ~ '^[a-f0-9]{64}$'),
 locale text not null check(locale in ('pt-BR','pt-PT','es')),
 created_at timestamptz not null,
 expires_at timestamptz not null,
 check((mode='personal' and company_id is null) or (mode='business' and company_id is not null)),
 check(expires_at>created_at and expires_at<=created_at+interval '10 minutes'),
 foreign key(company_id,user_id) references public.companies(id,user_id) on delete cascade
);
create index google_oauth_state_owner_expiry_idx on google_workspace.oauth_states(user_id,expires_at);
alter table google_workspace.oauth_states enable row level security;
-- Defaults may already grant ALL to the trusted service principal. Replace
-- that inherited ACL explicitly; callbacks never update/truncate state rows.
revoke all on table google_workspace.oauth_states from public,anon,authenticated,service_role;
grant select,insert,delete on table google_workspace.oauth_states to service_role;

-- This RPC is an invoker: only the existing backend service principal has the
-- required table rights. No owner role, global credential or company default.
create function public.zelo_google_state_issue(
 p_user_id uuid,p_mode text,p_company_id uuid,p_state_hash text,p_session_hash text,
 p_client_fingerprint text,p_nonce_hash text,p_locale text
) returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare hash_value text;created timestamptz;
begin
 if p_user_id is null or p_mode is null or p_mode not in ('personal','business')
    or not ((p_mode='personal' and p_company_id is null) or (p_mode='business' and p_company_id is not null))
    or p_locale is null or p_locale not in ('pt-BR','pt-PT','es') then raise exception 'GOOGLE_STATE_INVALID';end if;
 foreach hash_value in array array[p_state_hash,p_session_hash,p_client_fingerprint,p_nonce_hash] loop
  if hash_value is null or hash_value !~ '^[a-f0-9]{64}$' then raise exception 'GOOGLE_STATE_INVALID';end if;
 end loop;
 if not exists(select 1 from public.users where id=p_user_id)
    or (p_mode='business' and not exists(select 1 from public.companies where id=p_company_id and user_id=p_user_id and archived_at is null))
    then raise exception 'GOOGLE_WORKSPACE_ACCESS_DENIED';end if;
 perform pg_advisory_xact_lock(hashtextextended('google-oauth-state:'||p_user_id::text,0));
 created:=clock_timestamp();
 delete from google_workspace.oauth_states where state_hash in (
  select state_hash from google_workspace.oauth_states where user_id=p_user_id and expires_at<=created order by expires_at,state_hash limit 100
 );
 if (select count(*) from google_workspace.oauth_states where user_id=p_user_id and expires_at>created)>=20 then raise exception 'GOOGLE_STATE_LIMIT';end if;
 insert into google_workspace.oauth_states(state_hash,user_id,mode,company_id,session_hash,client_fingerprint,nonce_hash,locale,created_at,expires_at)
 values(p_state_hash,p_user_id,p_mode,p_company_id,p_session_hash,p_client_fingerprint,p_nonce_hash,p_locale,created,created+interval '10 minutes');
end;$$;

create function public.zelo_google_state_consume(
 p_user_id uuid,p_state_hash text,p_session_hash text,p_client_fingerprint text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare pending google_workspace.oauth_states%rowtype;hash_value text;
begin
 if p_user_id is null then raise exception 'GOOGLE_STATE_INVALID';end if;
 foreach hash_value in array array[p_state_hash,p_session_hash,p_client_fingerprint] loop
  if hash_value is null or hash_value !~ '^[a-f0-9]{64}$' then raise exception 'GOOGLE_STATE_INVALID';end if;
 end loop;
 -- Concurrent DELETEs serialize on the one row: only one callback receives it.
 delete from google_workspace.oauth_states
 where state_hash=p_state_hash and user_id=p_user_id and session_hash=p_session_hash and client_fingerprint=p_client_fingerprint
 returning * into pending;
 if not found then return null;end if;
 if pending.expires_at<=clock_timestamp() or not exists(select 1 from public.users where id=pending.user_id)
    or (pending.mode='business' and not exists(select 1 from public.companies where id=pending.company_id and user_id=pending.user_id and archived_at is null))
    then return null;end if;
 return jsonb_build_object('user_id',pending.user_id,'mode',pending.mode,'company_id',pending.company_id,
  'locale',pending.locale,'nonce_hash',pending.nonce_hash,'expires_at',pending.expires_at);
end;$$;
revoke all on function public.zelo_google_state_issue(uuid,text,uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.zelo_google_state_consume(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.zelo_google_state_issue(uuid,text,uuid,text,text,text,text,text) to service_role;
grant execute on function public.zelo_google_state_consume(uuid,text,text,text) to service_role;
commit;
