-- Possible pairs remain questions until the account holder explicitly confirms.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create table open_finance.credit_pix_questions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users(id) on delete cascade,
 environment text not null default 'production' check(environment='production'),mode text not null check(mode in('personal','business')),company_id uuid,
 credit_movement uuid not null unique,payment_movement uuid not null,
 gross_amount numeric(24,8) not null,payment_amount numeric(24,8) not null,charges_amount numeric(24,8) not null,
 credit_date date not null,payment_date date not null,
 status text not null default 'pending' check(status in('pending','claimed','sending','asked','confirmed','rejected','uncertain','stale')),
 token uuid,phone text,lease_until timestamptz,attempted_at timestamptz,last_considered_at timestamptz,created_at timestamptz not null default now(),
 check(gross_amount>0 and payment_amount>0 and charges_amount>=0 and gross_amount=payment_amount+charges_amount and gross_amount=round(gross_amount,2) and payment_amount=round(payment_amount,2)),
 check((mode='personal' and company_id is null) or(mode='business' and company_id is not null)),
 foreign key(company_id,user_id) references public.companies(id,user_id),
 foreign key(credit_movement,user_id,environment,mode) references open_finance.movements(id,user_id,environment,mode) on delete cascade,
 foreign key(payment_movement,user_id,environment,mode) references open_finance.movements(id,user_id,environment,mode) on delete cascade
);
create index credit_pix_questions_pending on open_finance.credit_pix_questions(status,last_considered_at,created_at);
create index credit_pix_questions_daily on open_finance.credit_pix_questions(user_id,attempted_at);
alter table open_finance.credit_pix_questions enable row level security;
alter table open_finance.credit_pix_questions force row level security;
revoke all on open_finance.credit_pix_questions from public,anon,authenticated,service_role;
create policy zelo_workspace on open_finance.credit_pix_questions for all to zelo_of_workspace using(open_finance.company_visible(user_id,mode,company_id)) with check(open_finance.company_visible(user_id,mode,company_id));
grant select,insert,update on open_finance.credit_pix_questions to zelo_of_workspace;
comment on table open_finance.credit_pix_questions is 'Private durable confirmation queue. Similarity is only a prompt, never an automatic accounting change. Ambiguous sends are not retried.';
create function open_finance.credit_pix_recipient(p_name text) returns text
language sql immutable set search_path=pg_catalog as $$
 select regexp_replace(translate(lower(regexp_replace(case when strpos(p_name,'|')>0 then split_part(p_name,'|',-1) else p_name end,'^(transferência enviada|transferencia enviada|pix enviado para|pix enviado)[: ]*','','i')),'áàâãéêíóôõúüç','aaaaeeiooouuc'),'[^a-z0-9]','','g');
$$;
create function open_finance.credit_pix_question_valid(p_question uuid) returns boolean
language sql stable security definer set search_path=pg_catalog set row_security=on as $$
 select coalesce((select a.amount=q.gross_amount and b.amount=q.payment_amount and a.transaction_date=q.credit_date and b.transaction_date=q.payment_date
  and a.resource_type='card' and a.direction='debit' and a.source_type='OPERACOES_CREDITO_CONTRATADAS_CARTAO' and b.resource_type='account' and b.direction='debit' and b.source_type='PIX'
  and a.currency='BRL' and b.currency='BRL' and a.classification not in('bill_payment','transfer','investment') and b.classification not in('bill_payment','transfer','investment')
  and a.company_id is not distinct from q.company_id and b.company_id is not distinct from q.company_id
  and ca.status='active' and cb.status='active' and ca.institution_id=cb.institution_id
  and open_finance.credit_pix_recipient(a.description)=open_finance.credit_pix_recipient(b.description) and abs(a.transaction_date-b.transaction_date)<=2
  and not exists(select 1 from open_finance.credit_pix_links l where l.voided_at is null and(l.credit_movement=a.id or l.payment_movement=b.id))
  and (select count(*) from open_finance.movements m join open_finance.resources r on r.id=m.resource_id join open_finance.connections c on c.id=r.connection_id
    where m.user_id=q.user_id and m.environment=q.environment and m.mode=q.mode and m.company_id is not distinct from q.company_id and c.status='active' and c.institution_id=ca.institution_id
     and m.resource_type='account' and m.direction='debit' and m.source_type='PIX' and m.currency='BRL' and m.amount>0 and m.amount=round(m.amount,2) and m.amount<=a.amount and m.classification not in('bill_payment','transfer','investment')
     and abs(m.transaction_date-a.transaction_date)<=2 and open_finance.credit_pix_recipient(m.description)=open_finance.credit_pix_recipient(a.description))=1
  from open_finance.credit_pix_questions q join open_finance.movements a on a.id=q.credit_movement join open_finance.movements b on b.id=q.payment_movement
  join open_finance.resources ra on ra.id=a.resource_id join open_finance.resources rb on rb.id=b.resource_id join open_finance.connections ca on ca.id=ra.connection_id join open_finance.connections cb on cb.id=rb.connection_id where q.id=p_question),false);
$$;
-- A boolean-only global holder gate sees all companies while scoped RPCs retain RLS.
create function open_finance.credit_pix_holder_busy(p_user uuid,p_question uuid) returns boolean
language sql stable security definer set search_path=pg_catalog set row_security=off as $$
 select exists(select 1 from open_finance.credit_pix_questions where user_id=p_user and
  ((id<>p_question and status in('claimed','sending','asked') and coalesce(lease_until,now()+interval '1 day')>now()) or attempted_at>now()-interval '24 hours'));
$$;
revoke all on function open_finance.credit_pix_holder_busy(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function open_finance.credit_pix_holder_busy(uuid,uuid) to zelo_of_workspace;
create function public.zelo_of_prepare_credit_pix_questions(p_user uuid,p_mode text) returns integer
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare n integer;selected uuid;
begin
 perform open_finance.require_access(p_user,p_mode);selected:=open_finance.selected_company(p_user,p_mode);
 with possible as (
  select a.*,b.id payment_id,b.amount payment_value,b.transaction_date payment_day,count(*) over(partition by a.id) matches
  from open_finance.movements a join open_finance.resources ra on ra.id=a.resource_id join open_finance.connections ca on ca.id=ra.connection_id
  join open_finance.movements b on b.user_id=a.user_id and b.mode=a.mode and b.environment=a.environment and b.company_id is not distinct from a.company_id
  join open_finance.resources rb on rb.id=b.resource_id join open_finance.connections cb on cb.id=rb.connection_id
  where a.user_id=p_user and a.mode=p_mode and a.environment='production' and a.company_id is not distinct from selected and a.transaction_date between current_date-7 and current_date
   and a.resource_type='card' and a.direction='debit' and a.source_type='OPERACOES_CREDITO_CONTRATADAS_CARTAO' and a.currency='BRL' and a.amount>0 and a.amount=round(a.amount,2) and a.classification not in('bill_payment','transfer','investment')
   and b.resource_type='account' and b.direction='debit' and b.source_type='PIX' and b.currency='BRL' and b.amount>0 and b.amount=round(b.amount,2) and b.amount<=a.amount and b.classification not in('bill_payment','transfer','investment')
   and ca.status='active' and cb.status='active' and ca.institution_id=cb.institution_id and abs(a.transaction_date-b.transaction_date)<=2
   and length(open_finance.credit_pix_recipient(a.description))>=4 and open_finance.credit_pix_recipient(a.description)=open_finance.credit_pix_recipient(b.description)
   and not exists(select 1 from open_finance.credit_pix_links l where l.voided_at is null and(l.credit_movement=a.id or l.payment_movement=b.id))
 ) insert into open_finance.credit_pix_questions(user_id,mode,company_id,credit_movement,payment_movement,gross_amount,payment_amount,charges_amount,credit_date,payment_date)
 select user_id,mode,company_id,id,payment_id,amount,payment_value,amount-payment_value,transaction_date,payment_day from possible where matches=1 order by transaction_date,id limit 100 on conflict(credit_movement) do nothing;
 get diagnostics n=row_count;return n;
end;$$;
create function public.zelo_of_get_credit_pix_question(p_user uuid,p_mode text,p_question uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog set row_security=on as $$
begin
 perform open_finance.require_access(p_user,p_mode);
 return (select jsonb_build_object('id',q.id,'status',q.status,'valid',open_finance.credit_pix_question_valid(q.id),'credit',q.credit_movement,'payment',q.payment_movement,'gross',q.gross_amount::text,'paymentAmount',q.payment_amount::text,'charges',q.charges_amount::text,'date',q.credit_date,'paymentDate',q.payment_date,'name',a.description,'paymentName',b.description,'bank',c.institution_name)
  from open_finance.credit_pix_questions q join open_finance.movements a on a.id=q.credit_movement join open_finance.movements b on b.id=q.payment_movement join open_finance.resources r on r.id=a.resource_id join open_finance.connections c on c.id=r.connection_id where q.id=p_question and q.user_id=p_user and q.mode=p_mode and q.company_id is not distinct from open_finance.selected_company(p_user,p_mode));
end;$$;
create function public.zelo_of_claim_credit_pix_question(p_user uuid,p_mode text,p_question uuid,p_phone text) returns uuid
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
 if not exists(select 1 from public.wpp_phone_links p join public.users u on u.id=p.user_id where p.phone=p_phone and p.user_id=p_user and lower(coalesce(p.relation,'')) in('titular','eu','eu mesmo','próprio','proprio','dono') and p.access in(p_mode,'both') and coalesce(p.active_workspace_mode,u.active_mode)=p_mode and(p_mode='personal' or p.active_company_id=q.company_id)) then return null;end if;
 if open_finance.credit_pix_holder_busy(p_user,q.id) then return null;end if;
 update open_finance.credit_pix_questions set status='claimed',token=t,phone=p_phone,lease_until=now()+interval '1 minute' where id=q.id;return t;
end;$$;
create function public.zelo_of_arm_credit_pix_question(p_user uuid,p_mode text,p_question uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
begin
 perform open_finance.require_access(p_user,p_mode);
 update open_finance.credit_pix_questions set status='sending',attempted_at=now(),lease_until=now()+interval '1 minute' where id=p_question and user_id=p_user and mode=p_mode and status='claimed' and token=p_token and lease_until>now() and open_finance.credit_pix_question_valid(id);
 return found;
end;$$;
create function public.zelo_of_finish_credit_pix_question(p_user uuid,p_mode text,p_question uuid,p_token uuid,p_status text) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
begin
 perform open_finance.require_access(p_user,p_mode);
 if p_status is null or p_status not in('pending','asked','uncertain') then return false;end if;
 update open_finance.credit_pix_questions set status=p_status,lease_until=null,attempted_at=case when p_status='pending' then null else attempted_at end
 where id=p_question and user_id=p_user and mode=p_mode and token=p_token and status in('claimed','sending');return found;
end;$$;
create function public.zelo_of_answer_credit_pix_question(p_user uuid,p_mode text,p_question uuid,p_phone text,p_confirmed boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare q open_finance.credit_pix_questions;result jsonb;
begin
 perform open_finance.require_access(p_user,p_mode);
 select * into q from open_finance.credit_pix_questions where id=p_question and user_id=p_user and mode=p_mode for update;
 if not found or q.phone is distinct from p_phone or p_confirmed is null or q.status not in('asked','confirmed','rejected') then raise exception 'OF_QUESTION_UNAVAILABLE';end if;
 if not exists(select 1 from public.wpp_phone_links p join public.users u on u.id=p.user_id where p.phone=p_phone and p.user_id=p_user and lower(coalesce(p.relation,'')) in('titular','eu','eu mesmo','próprio','proprio','dono') and p.access in(p_mode,'both') and coalesce(p.active_workspace_mode,u.active_mode)=p_mode and(p_mode='personal' or p.active_company_id=q.company_id)) then raise exception 'OF_QUESTION_UNAVAILABLE';end if;
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
create function public.zelo_of_credit_pix_targets() returns jsonb
language plpgsql security definer set search_path=pg_catalog set row_security=off as $$
declare result jsonb;
begin
 with expired as(select id from open_finance.credit_pix_questions where status='sending' and lease_until<=now() order by lease_until for update skip locked limit 100) update open_finance.credit_pix_questions q set status='uncertain' from expired e where q.id=e.id and q.status='sending' and q.lease_until<=now();
 with picked as(
  select q.id,q.user_id as "userId",q.mode,q.company_id as "companyId",p.phone from open_finance.credit_pix_questions q
  join public.users u on u.id=q.user_id join open_finance.user_access a on a.user_id=q.user_id
  cross join lateral(select p.phone from public.wpp_phone_links p where p.user_id=q.user_id and lower(coalesce(p.relation,'')) in('titular','eu','eu mesmo','próprio','proprio','dono') and p.access in(q.mode,'both') and coalesce(p.active_workspace_mode,u.active_mode)=q.mode and(q.mode='personal' or p.active_company_id=q.company_id) order by p.linked_at,p.phone limit 1) p
  where(q.status='pending' or q.status='claimed' and q.lease_until<=now()) and u.status='active' and a.enabled and a.country_code='BR'
  and(q.mode='personal' or u.plan='business') and not open_finance.credit_pix_holder_busy(q.user_id,q.id)
  and(q.company_id is null or exists(select 1 from public.companies c where c.id=q.company_id and c.user_id=q.user_id and c.archived_at is null))
  order by q.last_considered_at nulls first,q.created_at,q.id limit 20
 ), touched as(update open_finance.credit_pix_questions q set last_considered_at=now() from picked p where q.id=p.id returning q.id)
 select coalesce(jsonb_agg(p),'[]'::jsonb) into result from picked p join touched t on t.id=p.id;
 return result;
end;$$;
do $$begin execute format('grant zelo_of_workspace to %I',current_user);end;$$;
grant create on schema public,open_finance to zelo_of_workspace;
alter function open_finance.credit_pix_question_valid(uuid) owner to zelo_of_workspace;
revoke all on function open_finance.credit_pix_recipient(text),open_finance.credit_pix_question_valid(uuid) from public,anon,authenticated,service_role;
grant execute on function open_finance.credit_pix_recipient(text) to zelo_of_workspace;
alter function public.zelo_of_prepare_credit_pix_questions(uuid,text) owner to zelo_of_workspace;
revoke all on function public.zelo_of_prepare_credit_pix_questions(uuid,text) from public,anon,authenticated;
grant execute on function public.zelo_of_prepare_credit_pix_questions(uuid,text) to service_role;
alter function public.zelo_of_get_credit_pix_question(uuid,text,uuid) owner to zelo_of_workspace;
revoke all on function public.zelo_of_get_credit_pix_question(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.zelo_of_get_credit_pix_question(uuid,text,uuid) to service_role;
alter function public.zelo_of_claim_credit_pix_question(uuid,text,uuid,text) owner to zelo_of_workspace;
revoke all on function public.zelo_of_claim_credit_pix_question(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.zelo_of_claim_credit_pix_question(uuid,text,uuid,text) to service_role;
alter function public.zelo_of_arm_credit_pix_question(uuid,text,uuid,uuid) owner to zelo_of_workspace;
revoke all on function public.zelo_of_arm_credit_pix_question(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.zelo_of_arm_credit_pix_question(uuid,text,uuid,uuid) to service_role;
alter function public.zelo_of_finish_credit_pix_question(uuid,text,uuid,uuid,text) owner to zelo_of_workspace;
revoke all on function public.zelo_of_finish_credit_pix_question(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.zelo_of_finish_credit_pix_question(uuid,text,uuid,uuid,text) to service_role;
alter function public.zelo_of_answer_credit_pix_question(uuid,text,uuid,text,boolean) owner to zelo_of_workspace;
revoke all on function public.zelo_of_answer_credit_pix_question(uuid,text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.zelo_of_answer_credit_pix_question(uuid,text,uuid,text,boolean) to service_role;
revoke all on function public.zelo_of_credit_pix_targets() from public,anon,authenticated;
grant execute on function public.zelo_of_credit_pix_targets() to service_role;
revoke create on schema public,open_finance from zelo_of_workspace;
do $$begin execute format('revoke zelo_of_workspace from %I',current_user);end;$$;
commit;
