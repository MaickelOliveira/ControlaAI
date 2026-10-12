-- Complete confirmation prompts without changing bank facts or financial annotations.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
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
  cross join lateral(select p.phone from public.wpp_phone_links p where p.user_id=q.user_id and lower(coalesce(p.relation,'')) in('titular','eu','eu mesmo','próprio','proprio','dono') and p.access in(q.mode,'both') and coalesce(p.active_workspace_mode,u.active_mode)=q.mode and(q.mode='personal' or p.active_company_id=q.company_id) order by p.linked_at,p.phone limit 1) p
  where(q.status='pending' or q.status='claimed' and q.lease_until<=now()) and u.status='active' and a.enabled and a.country_code='BR'
  and(q.mode='personal' or u.plan='business') and not open_finance.credit_pix_holder_busy(q.user_id,q.id)
  and(q.company_id is null or exists(select 1 from public.companies c where c.id=q.company_id and c.user_id=q.user_id and c.archived_at is null))
  order by q.last_considered_at nulls first,q.created_at,q.id limit 20
 ), touched as(update open_finance.credit_pix_questions q set last_considered_at=now() from picked p where q.id=p.id returning q.id)
 select coalesce(jsonb_agg(p),'[]'::jsonb) into result from picked p join touched t on t.id=p.id;
 return result;
end;$$;
commit;
