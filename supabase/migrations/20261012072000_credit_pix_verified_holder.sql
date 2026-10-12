-- A self-editable family relation cannot authorize private bank reconciliation.
-- Keep existing verified links and financial facts; only the registered owner may answer.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Managed migrators need temporary inheritance to replace scoped-owned RPCs.
do $$begin execute format('grant zelo_of_workspace to %I',current_user);end;$$;
grant create on schema public,open_finance to zelo_of_workspace;
create function open_finance.credit_pix_registered_phone(p_registered text,p_linked text) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare registered text:=regexp_replace(coalesce(p_registered,''),'[^0-9]','','g');linked text:=regexp_replace(coalesce(p_linked,''),'[^0-9]','','g');local text;aliases text[];
begin
 if registered!~'^[0-9]{8,20}$' or linked!~'^[0-9]{8,20}$' then return false;end if;
 if registered=linked then return true;end if;
 -- Expand aliases only for an explicitly Brazilian registered number. A foreign
 -- or ambiguous local-only registration stays exact, rather than inventing a country.
 if registered!~'^55[1-9][0-9][0-9]{8,9}$' then return false;end if;
 local:=substr(registered,3);aliases:=array[registered,local];
 if length(local)=11 and substr(local,3,1)='9' then
  local:=substr(local,1,2)||substr(local,4);aliases:=aliases||array['55'||local,local];
 elsif length(local)=10 and local~'^[1-9]{2}[6-9]' then
  local:=substr(local,1,2)||'9'||substr(local,3);aliases:=aliases||array['55'||local,local];
 end if;
 return linked=any(aliases);
end;$$;
revoke all on function open_finance.credit_pix_registered_phone(text,text) from public,anon,authenticated,service_role;
grant execute on function open_finance.credit_pix_registered_phone(text,text) to zelo_of_workspace;
create or replace function public.zelo_of_claim_credit_pix_question(p_user uuid,p_mode text,p_question uuid,p_phone text) returns uuid
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare q open_finance.credit_pix_questions;t uuid:=gen_random_uuid();
begin
 perform open_finance.require_access(p_user,p_mode);
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,1));
 select * into q from open_finance.credit_pix_questions where id=p_question and user_id=p_user and mode=p_mode for update;
 if not found then return null;end if;
 if q.status='sending' and q.lease_until<=now() then update open_finance.credit_pix_questions set status='uncertain' where id=q.id;return null;end if;
 if q.status not in('pending','claimed') or(q.status='claimed' and q.lease_until>now()) then return null;end if;
 if not open_finance.credit_pix_question_valid(q.id) then update open_finance.credit_pix_questions set status='stale' where id=q.id;return null;end if;
 if not exists(select 1 from public.wpp_phone_links p join public.users u on u.id=p.user_id where p.phone=p_phone and p.user_id=p_user and open_finance.credit_pix_registered_phone(u.phone,p.phone) and p.access in(p_mode,'both') and coalesce(p.active_workspace_mode,u.active_mode)=p_mode and(p_mode='personal' or p.active_company_id=q.company_id)) then return null;end if;
 if open_finance.credit_pix_holder_busy(p_user,q.id) then return null;end if;
 update open_finance.credit_pix_questions set status='claimed',token=t,phone=p_phone,lease_until=now()+interval '1 minute' where id=q.id;return t;
end;$$;

create or replace function public.zelo_of_answer_credit_pix_question(p_user uuid,p_mode text,p_question uuid,p_phone text,p_confirmed boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare q open_finance.credit_pix_questions;result jsonb;
begin
 perform open_finance.require_access(p_user,p_mode);
 select * into q from open_finance.credit_pix_questions where id=p_question and user_id=p_user and mode=p_mode for update;
 if not found or q.phone is distinct from p_phone or p_confirmed is null or q.status not in('asked','confirmed','rejected') then raise exception 'OF_QUESTION_UNAVAILABLE';end if;
 if not exists(select 1 from public.wpp_phone_links p join public.users u on u.id=p.user_id where p.phone=p_phone and p.user_id=p_user and open_finance.credit_pix_registered_phone(u.phone,p.phone) and p.access in(p_mode,'both') and coalesce(p.active_workspace_mode,u.active_mode)=p_mode and(p_mode='personal' or p.active_company_id=q.company_id)) then raise exception 'OF_QUESTION_UNAVAILABLE';end if;
 if q.status='confirmed' then
  if exists(select 1 from open_finance.credit_pix_links l join open_finance.movements a on a.id=l.credit_movement join open_finance.movements b on b.id=l.payment_movement
   where l.credit_movement=q.credit_movement and l.payment_movement=q.payment_movement and l.voided_at is null
   and l.gross_amount=q.gross_amount and l.payment_amount=q.payment_amount and l.charges_amount=q.charges_amount and l.credit_date=q.credit_date and l.payment_date=q.payment_date
   and a.amount=q.gross_amount and b.amount=q.payment_amount and a.transaction_date=q.credit_date and b.transaction_date=q.payment_date and a.currency='BRL' and b.currency='BRL'
   and a.resource_type='card' and a.direction='debit' and a.source_type='OPERACOES_CREDITO_CONTRATADAS_CARTAO' and b.resource_type='account' and b.direction='debit' and b.source_type='PIX'
   and a.classification not in('bill_payment','transfer','investment') and b.classification not in('bill_payment','transfer','investment')) then return jsonb_build_object('status','confirmed');end if;
  update open_finance.credit_pix_questions set status='stale' where id=q.id;return jsonb_build_object('status','stale');
 end if;
 if q.status='rejected' then return jsonb_build_object('status','rejected');end if;
 if not p_confirmed then update open_finance.credit_pix_questions set status='rejected' where id=q.id;return jsonb_build_object('status','rejected');end if;
 if not open_finance.credit_pix_question_valid(q.id) then update open_finance.credit_pix_questions set status='stale' where id=q.id;return jsonb_build_object('status','stale');end if;
 result:=public.zelo_of_confirm_credit_pix(p_user,p_mode,q.credit_movement,q.payment_movement,q.gross_amount,q.payment_amount,q.charges_amount,true,q.credit_date,q.payment_date);
 update open_finance.credit_pix_questions set status='confirmed' where id=q.id;
 return jsonb_build_object('status','confirmed','link',result->>'id');
end;$$;

create or replace function public.zelo_of_credit_pix_targets() returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare result jsonb;
begin
 -- A platform confirmation also completes its correlated WhatsApp question.
 with completed as (
  select q.id from open_finance.credit_pix_questions q join open_finance.credit_pix_links l
   on l.credit_movement=q.credit_movement and l.payment_movement=q.payment_movement and l.user_id=q.user_id and l.mode=q.mode and l.environment=q.environment and l.company_id is not distinct from q.company_id
  join open_finance.movements a on a.id=q.credit_movement join open_finance.movements b on b.id=q.payment_movement
  where q.status='asked' and l.voided_at is null and l.gross_amount=q.gross_amount and l.payment_amount=q.payment_amount and l.charges_amount=q.charges_amount and l.credit_date=q.credit_date and l.payment_date=q.payment_date
   and a.amount=q.gross_amount and b.amount=q.payment_amount and a.transaction_date=q.credit_date and b.transaction_date=q.payment_date and a.currency='BRL' and b.currency='BRL'
   and a.resource_type='card' and a.direction='debit' and a.source_type='OPERACOES_CREDITO_CONTRATADAS_CARTAO' and b.resource_type='account' and b.direction='debit' and b.source_type='PIX'
   and a.classification not in('bill_payment','transfer','investment') and b.classification not in('bill_payment','transfer','investment')
  order by q.created_at for update of q skip locked limit 100
 ) update open_finance.credit_pix_questions q set status='confirmed' from completed c where q.id=c.id and q.status='asked';
 -- Only already asked questions expire. Never-sent questions keep waiting for the window.
 with expired_questions as(select id from open_finance.credit_pix_questions where status='asked' and coalesce(attempted_at,created_at)<=now()-interval '7 days' order by attempted_at,created_at for update skip locked limit 100)
 update open_finance.credit_pix_questions q set status='stale' from expired_questions e where q.id=e.id and q.status='asked' and coalesce(q.attempted_at,q.created_at)<=now()-interval '7 days';
 with expired as(select id from open_finance.credit_pix_questions where status='sending' and lease_until<=now() order by lease_until for update skip locked limit 100) update open_finance.credit_pix_questions q set status='uncertain' from expired e where q.id=e.id and q.status='sending' and q.lease_until<=now();
 with picked as(
  select q.id,q.user_id as "userId",q.mode,q.company_id as "companyId",p.phone from open_finance.credit_pix_questions q
  join public.users u on u.id=q.user_id join open_finance.user_access a on a.user_id=q.user_id
  cross join lateral(select p.phone from public.wpp_phone_links p where p.user_id=q.user_id and open_finance.credit_pix_registered_phone(u.phone,p.phone) and p.access in(q.mode,'both') and coalesce(p.active_workspace_mode,u.active_mode)=q.mode and(q.mode='personal' or p.active_company_id=q.company_id) order by p.linked_at,p.phone limit 1) p
  where(q.status='pending' or q.status='claimed' and q.lease_until<=now()) and u.status='active' and a.enabled and a.country_code='BR'
  and(q.mode='personal' or u.plan='business') and not open_finance.credit_pix_holder_busy(q.user_id,q.id)
  and(q.company_id is null or exists(select 1 from public.companies c where c.id=q.company_id and c.user_id=q.user_id and c.archived_at is null))
  order by q.last_considered_at nulls first,q.created_at,q.id limit 20
 ), touched as(update open_finance.credit_pix_questions q set last_considered_at=now() from picked p where q.id=p.id returning q.id)
 select coalesce(jsonb_agg(p),'[]'::jsonb) into result from picked p join touched t on t.id=p.id;
 return result;
end;$$;
revoke create on schema public,open_finance from zelo_of_workspace;
do $$begin execute format('revoke zelo_of_workspace from %I',current_user);end;$$;
commit;
