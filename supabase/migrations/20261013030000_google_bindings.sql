-- Dormant private storage. No live routes, OAuth consent, legacy copy or token revocation.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table google_workspace.grants (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 subject text not null check(length(subject) between 1 and 255 and subject !~ '[[:space:][:cntrl:]]'),
 client_fingerprint text not null check(client_fingerprint ~ '^[a-f0-9]{64}$'),
 access_ciphertext text not null check(length(access_ciphertext) between 44 and 32768 and access_ciphertext ~ '^enc:[A-Za-z0-9+/]+={0,2}$'),
 refresh_ciphertext text not null check(length(refresh_ciphertext) between 44 and 32768 and refresh_ciphertext ~ '^enc:[A-Za-z0-9+/]+={0,2}$'),
 expires_at timestamptz not null check(isfinite(expires_at)),
 version bigint not null default 1 check(version>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(user_id,subject,client_fingerprint),
 unique(id,user_id)
);
create table google_workspace.bindings (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 mode text not null check(mode in ('personal','business')),
 company_id uuid,
 grant_id uuid not null,
 calendar_id text not null default 'primary' check(length(calendar_id) between 1 and 1024 and calendar_id !~ '[[:cntrl:]]'),
 calendar_name text check(length(calendar_name)<=512 and calendar_name !~ '[[:cntrl:]]'),
 version bigint not null default 1 check(version>0),
 unlinked_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 check((mode='personal' and company_id is null) or (mode='business' and company_id is not null)),
 foreign key(company_id,user_id) references public.companies(id,user_id),
 foreign key(grant_id,user_id) references google_workspace.grants(id,user_id),
 unique(id,user_id)
);
create unique index google_binding_personal on google_workspace.bindings(user_id) where mode='personal';
create unique index google_binding_business on google_workspace.bindings(user_id,company_id) where mode='business';
create index google_binding_grant on google_workspace.bindings(grant_id,user_id);
alter table google_workspace.grants enable row level security;
alter table google_workspace.bindings enable row level security;
-- Replace permissive inherited defaults, including ALL for the service role.
revoke all on google_workspace.grants,google_workspace.bindings from public,anon,authenticated,service_role;
grant select,insert,update on google_workspace.grants,google_workspace.bindings to service_role;

-- Same owner -> company lock order as company archival; no new privileged role.
-- Read locks allow concurrent status/credential reads and block archival only
-- for this short database transaction. Provider calls occur outside it.
create function google_workspace.lock_workspace(p_user uuid,p_mode text,p_company uuid,p_write boolean)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if p_user is null or p_mode is null or p_mode not in ('personal','business')
    or not ((p_mode='personal' and p_company is null) or (p_mode='business' and p_company is not null))
    or p_write is null then raise exception 'GOOGLE_WORKSPACE_INVALID';end if;
 if p_write then perform 1 from public.users where id=p_user for update;
 else perform 1 from public.users where id=p_user for share;end if;
 if not found then raise exception 'GOOGLE_WORKSPACE_ACCESS_DENIED';end if;
 if p_mode='business' then
  perform 1 from public.companies where id=p_company and user_id=p_user and archived_at is null for share;
  if not found then raise exception 'GOOGLE_WORKSPACE_ACCESS_DENIED';end if;
 end if;
end;$$;

create function google_workspace.binding_metadata(b google_workspace.bindings)
returns jsonb language sql immutable strict security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('id',b.id,'user_id',b.user_id,'mode',b.mode,'company_id',b.company_id,
  'grant_id',b.grant_id,'calendar_id',b.calendar_id,'calendar_name',b.calendar_name,'version',b.version,'unlinked_at',b.unlinked_at);
$$;

create function google_workspace.validate_identity(p_subject text,p_client text)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if p_subject is null or length(p_subject) not between 1 and 255 or p_subject ~ '[[:space:][:cntrl:]]'
    or p_client is null or p_client !~ '^[a-f0-9]{64}$' then raise exception 'GOOGLE_GRANT_INVALID';end if;
end;$$;

create function google_workspace.validate_tokens(p_access text,p_refresh text,p_expiry timestamptz)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare value text;
begin
 foreach value in array array[p_access,p_refresh] loop
  if value is null or length(value) not between 44 and 32768 or value !~ '^enc:[A-Za-z0-9+/]+={0,2}$'
     then raise exception 'GOOGLE_GRANT_INVALID';end if;
  -- Only accept the existing AES-GCM envelope shape; the server encrypts it.
  -- This shape check is not cryptographic proof of valid ciphertext.
  begin
   if octet_length(decode(substr(value,5),'base64'))<29 then raise exception 'GOOGLE_GRANT_INVALID';end if;
  exception when others then raise exception 'GOOGLE_GRANT_INVALID';end;
 end loop;
 if p_expiry is null or not isfinite(p_expiry) or p_expiry<=clock_timestamp() then raise exception 'GOOGLE_GRANT_INVALID';end if;
end;$$;

create function public.zelo_google_binding_get(p_user_id uuid,p_mode text,p_company_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare b google_workspace.bindings%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 select * into b from google_workspace.bindings where user_id=p_user_id and mode=p_mode and company_id is not distinct from p_company_id;
 if not found then return null;end if;
 return google_workspace.binding_metadata(b);
end;$$;

-- Internal credential lookup ONLY after server-side verification of Google's
-- signed subject/client. It must never become a browser/status API or accept
-- identity claimed by an HTTP/LLM payload. No consumer is installed here.
create function public.zelo_google_grant_for_identity(p_user_id uuid,p_mode text,p_company_id uuid,p_subject text,p_client_fingerprint text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare g google_workspace.grants%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 perform google_workspace.validate_identity(p_subject,p_client_fingerprint);
 select * into g from google_workspace.grants where user_id=p_user_id and subject=p_subject and client_fingerprint=p_client_fingerprint;
 if not found then return null;end if;
 return jsonb_build_object('id',g.id,'user_id',g.user_id,'subject',g.subject,'client_fingerprint',g.client_fingerprint,
  'access_ciphertext',g.access_ciphertext,'refresh_ciphertext',g.refresh_ciphertext,'expires_at',g.expires_at,'version',g.version);
end;$$;

-- Save a VERIFIED OAuth result against both pre-operation snapshots. Existing
-- bindings, including tombstones, keep their ID/version so late callbacks fail.
create function public.zelo_google_binding_save(
 p_user_id uuid,p_mode text,p_company_id uuid,p_subject text,p_client_fingerprint text,
 p_access_ciphertext text,p_refresh_ciphertext text,p_expires_at timestamptz,p_grant_version bigint,p_binding_version bigint
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare g google_workspace.grants%rowtype;b google_workspace.bindings%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 perform google_workspace.validate_identity(p_subject,p_client_fingerprint);
 perform google_workspace.validate_tokens(p_access_ciphertext,p_refresh_ciphertext,p_expires_at);
 if p_grant_version is null or p_grant_version<0 or p_binding_version is null or p_binding_version<0 then raise exception 'GOOGLE_GRANT_INVALID';end if;
 select * into b from google_workspace.bindings where user_id=p_user_id and mode=p_mode and company_id is not distinct from p_company_id;
 select * into g from google_workspace.grants where user_id=p_user_id and subject=p_subject and client_fingerprint=p_client_fingerprint;
 if coalesce(b.version,0)<>p_binding_version or coalesce(g.version,0)<>p_grant_version then raise exception 'GOOGLE_BINDING_CONFLICT';end if;
 if g.id is null then
  insert into google_workspace.grants(user_id,subject,client_fingerprint,access_ciphertext,refresh_ciphertext,expires_at)
  values(p_user_id,p_subject,p_client_fingerprint,p_access_ciphertext,p_refresh_ciphertext,p_expires_at) returning * into g;
 else
  update google_workspace.grants set access_ciphertext=p_access_ciphertext,refresh_ciphertext=p_refresh_ciphertext,
   expires_at=p_expires_at,version=version+1,updated_at=clock_timestamp() where id=g.id returning * into g;
 end if;
 if b.id is null then
  insert into google_workspace.bindings(user_id,mode,company_id,grant_id) values(p_user_id,p_mode,p_company_id,g.id) returning * into b;
 else
  update google_workspace.bindings set grant_id=g.id,
   calendar_id=case when grant_id=g.id then calendar_id else 'primary' end,
   calendar_name=case when grant_id=g.id then calendar_name else null end,
   unlinked_at=null,version=version+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 end if;
 return google_workspace.binding_metadata(b);
end;$$;

create function public.zelo_google_binding_select_calendar(
 p_user_id uuid,p_mode text,p_company_id uuid,p_binding_version bigint,p_calendar_id text,p_calendar_name text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare b google_workspace.bindings%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if p_binding_version is null or p_binding_version<=0 or p_calendar_id is null or length(btrim(p_calendar_id))=0
    or length(p_calendar_id)>1024 or p_calendar_id ~ '[[:cntrl:]]'
    or length(p_calendar_name)>512 or p_calendar_name ~ '[[:cntrl:]]' then raise exception 'GOOGLE_BINDING_INVALID';end if;
 update google_workspace.bindings set calendar_id=p_calendar_id,calendar_name=p_calendar_name,version=version+1,updated_at=clock_timestamp()
 where user_id=p_user_id and mode=p_mode and company_id is not distinct from p_company_id and version=p_binding_version and unlinked_at is null returning * into b;
 if not found then raise exception 'GOOGLE_BINDING_CONFLICT';end if;
 return google_workspace.binding_metadata(b);
end;$$;

create function public.zelo_google_binding_unlink(p_user_id uuid,p_mode text,p_company_id uuid,p_binding_version bigint)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare b google_workspace.bindings%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if p_binding_version is null or p_binding_version<=0 then raise exception 'GOOGLE_BINDING_INVALID';end if;
 update google_workspace.bindings set unlinked_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
 where user_id=p_user_id and mode=p_mode and company_id is not distinct from p_company_id and version=p_binding_version and unlinked_at is null returning * into b;
 if not found then raise exception 'GOOGLE_BINDING_CONFLICT';end if;
 return google_workspace.binding_metadata(b);
end;$$;

create function public.zelo_google_grant_refresh(
 p_user_id uuid,p_mode text,p_company_id uuid,p_grant_id uuid,p_client_fingerprint text,p_grant_version bigint,
 p_access_ciphertext text,p_refresh_ciphertext text,p_expires_at timestamptz
) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 if p_grant_id is null or p_grant_version is null or p_grant_version<=0 or p_client_fingerprint is null
    or p_client_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'GOOGLE_GRANT_INVALID';end if;
 perform google_workspace.validate_tokens(p_access_ciphertext,p_refresh_ciphertext,p_expires_at);
 if not exists(select 1 from google_workspace.bindings where user_id=p_user_id and mode=p_mode
   and company_id is not distinct from p_company_id and grant_id=p_grant_id and unlinked_at is null) then return false;end if;
 update google_workspace.grants set access_ciphertext=p_access_ciphertext,refresh_ciphertext=p_refresh_ciphertext,
  expires_at=p_expires_at,version=version+1,updated_at=clock_timestamp()
 where id=p_grant_id and user_id=p_user_id and client_fingerprint=p_client_fingerprint and version=p_grant_version;
 return found;
end;$$;

revoke all on function google_workspace.lock_workspace(uuid,text,uuid,boolean),
 google_workspace.binding_metadata(google_workspace.bindings),google_workspace.validate_identity(text,text),
 google_workspace.validate_tokens(text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function google_workspace.lock_workspace(uuid,text,uuid,boolean),
 google_workspace.binding_metadata(google_workspace.bindings),google_workspace.validate_identity(text,text),
 google_workspace.validate_tokens(text,text,timestamptz) to service_role;
revoke all on function public.zelo_google_binding_get(uuid,text,uuid),
 public.zelo_google_grant_for_identity(uuid,text,uuid,text,text),
 public.zelo_google_binding_save(uuid,text,uuid,text,text,text,text,timestamptz,bigint,bigint),
 public.zelo_google_binding_select_calendar(uuid,text,uuid,bigint,text,text),
 public.zelo_google_binding_unlink(uuid,text,uuid,bigint),
 public.zelo_google_grant_refresh(uuid,text,uuid,uuid,text,bigint,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.zelo_google_binding_get(uuid,text,uuid),
 public.zelo_google_grant_for_identity(uuid,text,uuid,text,text),
 public.zelo_google_binding_save(uuid,text,uuid,text,text,text,text,timestamptz,bigint,bigint),
 public.zelo_google_binding_select_calendar(uuid,text,uuid,bigint,text,text),
 public.zelo_google_binding_unlink(uuid,text,uuid,bigint),
 public.zelo_google_grant_refresh(uuid,text,uuid,uuid,text,bigint,text,text,timestamptz) to service_role;
commit;
