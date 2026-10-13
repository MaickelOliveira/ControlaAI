-- Dormant explicit legacy assignment. Original google_tokens bytes are never changed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table google_workspace.legacy_assignments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references public.users(id) on delete cascade,
 mode text not null check(mode in ('personal','business')),
 company_id uuid,
 binding_id uuid not null,
 grant_id uuid not null,
 source_fingerprint text not null check(source_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 check((mode='personal' and company_id is null) or (mode='business' and company_id is not null)),
 foreign key(company_id,user_id) references public.companies(id,user_id),
 foreign key(binding_id,user_id) references google_workspace.bindings(id,user_id),
 foreign key(grant_id,user_id) references google_workspace.grants(id,user_id)
);
alter table google_workspace.legacy_assignments enable row level security;
revoke all on google_workspace.legacy_assignments from public,anon,authenticated,service_role;
grant select,insert on google_workspace.legacy_assignments to service_role;

create function google_workspace.legacy_fingerprint(l public.google_tokens)
returns text language sql immutable strict security invoker set search_path=pg_catalog as $$
 select encode(sha256(convert_to(jsonb_build_array(l.user_id,l.access_token,l.refresh_token,extract(epoch from l.expires_at)::text)::text,'UTF8')),'hex');
$$;

create function public.zelo_google_legacy_status(p_user_id uuid,p_mode text,p_company_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 return jsonb_build_object('exists',exists(select 1 from public.google_tokens where user_id=p_user_id),
  'assigned',exists(select 1 from google_workspace.legacy_assignments where user_id=p_user_id),
  'assignedHere',exists(select 1 from google_workspace.legacy_assignments where user_id=p_user_id and mode=p_mode and company_id is not distinct from p_company_id));
end;$$;

-- Private server snapshot only. Never serialize this result to a browser/LLM.
create function public.zelo_google_legacy_snapshot(p_user_id uuid,p_mode text,p_company_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare l public.google_tokens%rowtype;b google_workspace.bindings%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,false);
 if exists(select 1 from google_workspace.legacy_assignments where user_id=p_user_id) then raise exception 'GOOGLE_LEGACY_ALREADY_ASSIGNED';end if;
 select * into b from google_workspace.bindings where user_id=p_user_id and mode=p_mode and company_id is not distinct from p_company_id;
 if b.id is not null and b.unlinked_at is null then raise exception 'GOOGLE_LEGACY_TARGET_CONNECTED';end if;
 select * into l from public.google_tokens where user_id=p_user_id for share;
 if not found then return null;end if;
 return jsonb_build_object('user_id',l.user_id,'source_fingerprint',google_workspace.legacy_fingerprint(l),
  'access_ciphertext',l.access_token,'refresh_ciphertext',l.refresh_token,'expires_at',l.expires_at,
  'binding',case when b.id is null then null else google_workspace.binding_metadata(b)||jsonb_build_object('version',b.version::text) end);
end;$$;

-- Subject/calendar must come from the trusted server's Google verification.
create function public.zelo_google_legacy_assign(
 p_user_id uuid,p_mode text,p_company_id uuid,p_source_fingerprint text,p_subject text,p_client_fingerprint text,
 p_binding_version bigint,p_grant_version bigint,p_access_ciphertext text,p_refresh_ciphertext text,p_expires_at timestamptz,
 p_calendar_id text,p_calendar_name text
) returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare l public.google_tokens%rowtype;b google_workspace.bindings%rowtype;g google_workspace.grants%rowtype;
begin
 perform google_workspace.lock_workspace(p_user_id,p_mode,p_company_id,true);
 perform google_workspace.validate_identity(p_subject,p_client_fingerprint);
 perform google_workspace.validate_tokens(p_access_ciphertext,p_refresh_ciphertext,p_expires_at);
 if p_source_fingerprint is null or p_source_fingerprint !~ '^[a-f0-9]{64}$'
  or p_binding_version is null or p_binding_version<0 or p_grant_version is null or p_grant_version<0
  or p_calendar_id is null or length(btrim(p_calendar_id))=0 or length(p_calendar_id)>1024 or p_calendar_id ~ '[[:cntrl:]]'
  or length(p_calendar_name)>512 or p_calendar_name ~ '[[:cntrl:]]' then raise exception 'GOOGLE_LEGACY_INVALID';end if;
 if exists(select 1 from google_workspace.legacy_assignments where user_id=p_user_id) then raise exception 'GOOGLE_LEGACY_ALREADY_ASSIGNED';end if;
 select * into l from public.google_tokens where user_id=p_user_id for update;
 if not found then raise exception 'GOOGLE_LEGACY_MISSING';end if;
 if google_workspace.legacy_fingerprint(l)<>p_source_fingerprint then raise exception 'GOOGLE_LEGACY_CONFLICT';end if;
 select * into b from google_workspace.bindings where user_id=p_user_id and mode=p_mode and company_id is not distinct from p_company_id;
 select * into g from google_workspace.grants where user_id=p_user_id and subject=p_subject and client_fingerprint=p_client_fingerprint;
 if coalesce(b.version,0)<>p_binding_version or coalesce(g.version,0)<>p_grant_version then raise exception 'GOOGLE_LEGACY_CONFLICT';end if;
 if b.id is not null and b.unlinked_at is null then raise exception 'GOOGLE_LEGACY_TARGET_CONNECTED';end if;
 -- Reuse an existing verified identity without overwriting newer grant bytes.
 if g.id is null then
  insert into google_workspace.grants(user_id,subject,client_fingerprint,access_ciphertext,refresh_ciphertext,expires_at)
  values(p_user_id,p_subject,p_client_fingerprint,p_access_ciphertext,p_refresh_ciphertext,p_expires_at) returning * into g;
 end if;
 if b.id is null then
  insert into google_workspace.bindings(user_id,mode,company_id,grant_id,calendar_id,calendar_name)
  values(p_user_id,p_mode,p_company_id,g.id,p_calendar_id,p_calendar_name) returning * into b;
 else
  update google_workspace.bindings set grant_id=g.id,calendar_id=p_calendar_id,calendar_name=p_calendar_name,
   unlinked_at=null,version=version+1,updated_at=clock_timestamp() where id=b.id returning * into b;
 end if;
 insert into google_workspace.legacy_assignments(user_id,mode,company_id,binding_id,grant_id,source_fingerprint)
 values(p_user_id,p_mode,p_company_id,b.id,g.id,p_source_fingerprint);
 return google_workspace.binding_metadata(b)||jsonb_build_object('version',b.version::text);
end;$$;

revoke all on function google_workspace.legacy_fingerprint(public.google_tokens),
 public.zelo_google_legacy_status(uuid,text,uuid),public.zelo_google_legacy_snapshot(uuid,text,uuid),
 public.zelo_google_legacy_assign(uuid,text,uuid,text,text,text,bigint,bigint,text,text,timestamptz,text,text) from public,anon,authenticated,service_role;
grant execute on function google_workspace.legacy_fingerprint(public.google_tokens),
 public.zelo_google_legacy_status(uuid,text,uuid),public.zelo_google_legacy_snapshot(uuid,text,uuid),
 public.zelo_google_legacy_assign(uuid,text,uuid,text,text,text,bigint,bigint,text,text,timestamptz,text,text) to service_role;
commit;
