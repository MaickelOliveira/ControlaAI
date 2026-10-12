-- Short-lived activity leases coordinate questions with real message processing.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table open_finance.whatsapp_activity(
 phone_key text not null check(phone_key ~ '^[0-9]{8,20}$'),
 token uuid not null,
 kind text not null check(kind in ('inbound','notice','question')),
 expires_at timestamptz not null,
 primary key(phone_key,token)
);
create index whatsapp_activity_expiry on open_finance.whatsapp_activity(expires_at);
alter table open_finance.whatsapp_activity enable row level security;
alter table open_finance.whatsapp_activity force row level security;
revoke all on open_finance.whatsapp_activity from public,anon,authenticated,service_role;
comment on table open_finance.whatsapp_activity is 'Transient processing/reservation nonces. No message content or finances. Removed when finished; expired crash leases cleaned in bounded batches.';

create table open_finance.whatsapp_recent_activity(phone_key text primary key, last_activity timestamptz not null);
alter table open_finance.whatsapp_recent_activity enable row level security;
alter table open_finance.whatsapp_recent_activity force row level security;
revoke all on open_finance.whatsapp_recent_activity from public,anon,authenticated,service_role;

create function open_finance.whatsapp_quiet(p_variants text[]) returns boolean
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare r record;message jsonb;seen boolean:=false;last_inbound bigint:=0;activity bigint:=0;stamp bigint;now_ms bigint:=floor(extract(epoch from now())*1000);
begin
 if exists(select 1 from public.pending_actions where phone=any(p_variants) and
  case when data->>'expiresAt' ~ '^\d{4}-\d{2}-\d{2}T' then (data->>'expiresAt')::timestamptz>now() else true end) then return false;end if;
 for r in select data from public.conversations where phone=any(p_variants) loop
  seen:=true;
  if coalesce(r.data->>'aiPaused','false')<>'false' or jsonb_typeof(r.data->'lastActivity') is distinct from 'number'
   or coalesce(r.data->>'lastActivity','') !~ '^[0-9]{1,16}$' or jsonb_typeof(r.data->'messages') is distinct from 'array' then return false;end if;
  stamp:=(r.data->>'lastActivity')::bigint;
  if stamp<=0 or stamp>now_ms then return false;end if;
  activity:=greatest(activity,stamp);
  for message in select value from jsonb_array_elements(r.data->'messages') loop
   if jsonb_typeof(message->'ts') is distinct from 'number' or coalesce(message->>'ts','') !~ '^[0-9]{1,16}$' then return false;end if;
   stamp:=(message->>'ts')::bigint;
   if stamp<=0 or stamp>now_ms then return false;end if;
   activity:=greatest(activity,stamp);
   if message->>'role'='user' and message->>'channel'='waba' then last_inbound:=greatest(last_inbound,stamp);end if;
  end loop;
 end loop;
 select greatest(activity,coalesce(max(floor(extract(epoch from last_activity)*1000)::bigint),0)) into activity from open_finance.whatsapp_recent_activity where phone_key=(select min(v) from unnest(p_variants) v);
 return seen and last_inbound>0 and now_ms-last_inbound<86400000 and now_ms-activity>=120000;
end;$$;
revoke all on function open_finance.whatsapp_quiet(text[]) from public,anon,authenticated,service_role;

create function public.zelo_wpp_activity_begin(p_phone text,p_token uuid,p_kind text,p_variants text[]) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare k text;
begin
 if p_phone is null or p_phone !~ '^[0-9]{8,20}$' or p_token is null or p_kind is null or p_kind not in ('inbound','notice') or p_variants is null or cardinality(p_variants) not between 1 and 8 or not(p_phone=any(p_variants)) or exists(select 1 from unnest(p_variants) v where v is null or v !~ '^[0-9]{8,20}$') then return false;end if;
 select min(v) into k from unnest(p_variants) v;
 perform pg_advisory_xact_lock(hashtextextended(k,0));
 if exists(select 1 from open_finance.whatsapp_activity where phone_key=k and token=p_token and kind<>p_kind) then return false;end if;
 insert into open_finance.whatsapp_recent_activity values(k,now()) on conflict(phone_key) do update set last_activity=excluded.last_activity;
 -- Incoming work has priority. Once invalidated, an old send reservation stays invalid.
 update open_finance.whatsapp_activity set expires_at=least(expires_at,now()) where phone_key=k and kind='question';
 insert into open_finance.whatsapp_activity(phone_key,token,kind,expires_at) values(k,p_token,p_kind,now()+interval '10 minutes')
 on conflict(phone_key,token) do update set expires_at=excluded.expires_at;
 return true;
end;$$;
create function public.zelo_wpp_activity_finish(p_phone text,p_token uuid,p_variants text[]) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare k text;finished boolean;
begin
 if p_phone is null or p_token is null or p_variants is null or cardinality(p_variants) not between 1 and 8 or not(p_phone=any(p_variants)) or exists(select 1 from unnest(p_variants) v where v is null or v !~ '^[0-9]{8,20}$') then return false;end if;
 select min(v) into k from unnest(p_variants) v;
 perform pg_advisory_xact_lock(hashtextextended(k,0));
 if exists(select 1 from open_finance.whatsapp_activity where phone_key=k and token=p_token and kind<>'question') then
  insert into open_finance.whatsapp_recent_activity values(k,now()) on conflict(phone_key) do update set last_activity=excluded.last_activity;
 end if;
 delete from open_finance.whatsapp_activity where phone_key=k and token=p_token;
 finished:=found;return finished;
end;$$;
create function public.zelo_wpp_question_claim(p_phone text,p_variants text[],p_token uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare k text;
begin
 if p_phone is null or p_phone !~ '^[0-9]{8,20}$' or p_token is null or p_variants is null or cardinality(p_variants) not between 1 and 8
  or not(p_phone=any(p_variants)) or exists(select 1 from unnest(p_variants) v where v is null or v !~ '^[0-9]{8,20}$') then return false;end if;
 select min(v) into k from unnest(p_variants) v;
 perform pg_advisory_xact_lock(hashtextextended(k,0));
 with stale as (select phone_key,token from open_finance.whatsapp_activity where expires_at<=now() order by expires_at for update skip locked limit 100) delete from open_finance.whatsapp_activity a using stale s where a.phone_key=s.phone_key and a.token=s.token and a.expires_at<=now();
 if exists(select 1 from open_finance.whatsapp_activity where phone_key=k and expires_at>now()) or not open_finance.whatsapp_quiet(p_variants) then return false;end if;
 insert into open_finance.whatsapp_activity(phone_key,token,kind,expires_at) values(k,p_token,'question',now()+interval '30 seconds');
 return true;
end;$$;
create function public.zelo_wpp_question_ready(p_phone text,p_variants text[],p_token uuid) returns boolean
language plpgsql stable security definer set search_path=pg_catalog set row_security=off as $$
declare k text;
begin
 if p_phone is null or p_phone !~ '^[0-9]{8,20}$' or p_token is null or p_variants is null or cardinality(p_variants) not between 1 and 8
  or not(p_phone=any(p_variants)) or exists(select 1 from unnest(p_variants) v where v is null or v !~ '^[0-9]{8,20}$') then return false;end if;
 select min(v) into k from unnest(p_variants) v;
 return exists(select 1 from open_finance.whatsapp_activity where phone_key=k and token=p_token and kind='question' and expires_at>now())
  and not exists(select 1 from open_finance.whatsapp_activity where phone_key=k and token<>p_token and expires_at>now())
  and open_finance.whatsapp_quiet(p_variants);
end;$$;
revoke all on function public.zelo_wpp_activity_begin(text,uuid,text,text[]),public.zelo_wpp_activity_finish(text,uuid,text[]),public.zelo_wpp_question_claim(text,text[],uuid),public.zelo_wpp_question_ready(text,text[],uuid) from public,anon,authenticated;
grant execute on function public.zelo_wpp_activity_begin(text,uuid,text,text[]),public.zelo_wpp_activity_finish(text,uuid,text[]),public.zelo_wpp_question_claim(text,text[],uuid),public.zelo_wpp_question_ready(text,text[],uuid) to service_role;
commit;
