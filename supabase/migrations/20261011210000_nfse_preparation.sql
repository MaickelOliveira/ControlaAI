-- Private, company-owned fiscal preparation. No invoice is emitted by this migration.
begin;
set local lock_timeout='5s';
create table public.nfse_profiles (
 company_id uuid primary key, user_id uuid not null,
 profile jsonb not null, certificate_encrypted text, certificate_expires_at timestamptz,
 readiness text not null default 'configuration' check(readiness in ('configuration','certificate','homologation','ready')),
 updated_at timestamptz not null default now(),
 foreign key(company_id,user_id) references public.companies(id,user_id), unique(company_id,user_id)
);
create table public.nfse_services (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, company_id uuid not null,
 service jsonb not null, archived boolean not null default false, created_at timestamptz not null default now(),
 foreign key(company_id,user_id) references public.companies(id,user_id), unique(id,company_id,user_id)
);
create table public.nfse_drafts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null, company_id uuid not null,
 draft jsonb not null, review_hash text not null check(review_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in ('draft','processing','uncertain','rejected','issued','cancelled','archived')),
 source text not null check(source in ('web','whatsapp')), requested_by text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(company_id,user_id) references public.companies(id,user_id), unique(id,company_id,user_id)
);
create index nfse_services_scope_idx on public.nfse_services(user_id,company_id,created_at);
create index nfse_drafts_scope_idx on public.nfse_drafts(user_id,company_id,created_at);
-- Defense in depth on writes; APIs also qualify every read by owner/company IDs.
create function public.zelo_nfse_scope_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare h jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
begin
 if tg_op='UPDATE' and (new.user_id<>old.user_id or new.company_id<>old.company_id) then raise exception 'NFSE_REASSIGNMENT_DENIED';end if;
 if h->>'x-zelo-owner' is not null and h->>'x-zelo-owner'<>new.user_id::text then raise exception 'NFSE_OWNER_MISMATCH';end if;
 if h->>'x-zelo-company' is not null and h->>'x-zelo-company'<>new.company_id::text then raise exception 'NFSE_COMPANY_MISMATCH';end if;
 if h->>'x-zelo-business-access'='false' then raise exception 'NFSE_ACCESS_DENIED';end if;
 return new;
end;$$;
revoke all on function public.zelo_nfse_scope_guard() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['nfse_profiles','nfse_services','nfse_drafts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
  execute format('create trigger nfse_scope_guard before insert or update on public.%I for each row execute function public.zelo_nfse_scope_guard()',t);
 end loop;
end;$$;
commit;
