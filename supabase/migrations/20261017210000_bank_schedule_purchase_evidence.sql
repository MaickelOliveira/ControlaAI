-- Expose the purchase date and bank installment numbers for read-only display
-- grouping. Keep every provider schedule and movement unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create or replace view open_finance.agenda_items as
select b.user_id,b.mode,'bill:'||b.id::text as item_key,b.id,b.resource_id,'bill'::text as kind,'Fatura do cartão'::text as description,r.name as resource_name,c.institution_name,b.due_date,b.total_amount as amount,b.currency,b.synced_at,b.payment_evidence,b.payment_amount,null::integer as total_installments,null::integer as observed_installments,null::numeric as regularity_score,null::date as last_observed_month,null::integer as last_observed_installment,
  null::date as purchase_date,null::integer[] as source_ordinals
from open_finance.bills b join open_finance.resources r on r.id=b.resource_id join open_finance.connections c on c.id=r.connection_id
where b.environment='production' and 'CREDIT_CARD_ACCOUNT'=any(c.scopes) and c.status='active' and (c.consent_expires_at is null or c.consent_expires_at>now())
union all
select s.user_id,s.mode,s.kind||':'||s.id::text,s.id,s.resource_id,s.kind,s.description,r.name,c.institution_name,s.due_date,s.amount,s.currency,s.synced_at,false,null,s.total_installments,greatest(evidence.installment_number,s.observed_installments),s.regularity_score,evidence.bill_month,evidence.installment_number,
  purchase_link.purchase_date,purchase_link.source_ordinals
from open_finance.card_schedules s join open_finance.resources r on r.id=s.resource_id join open_finance.connections c on c.id=r.connection_id join open_finance.sync_jobs j on j.id=s.last_job_id
left join lateral (
 select m.bill_month,m.installment_number from open_finance.movements m
 where s.kind='installment' and m.resource_id=s.resource_id and m.user_id=s.user_id and m.environment=s.environment and m.mode=s.mode
   and m.external_id=any(s.observed_transactions) and m.installment_number between 1 and s.total_installments
   and m.installment_count=s.total_installments and m.amount=s.amount and m.bill_month is not null and m.direction='debit'
   and m.bill_month<=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date
 order by m.installment_number desc,m.bill_month desc limit 1
) evidence on true
left join lateral (
 select case when count(m.transaction_date)=count(*) and min(m.transaction_date)=max(m.transaction_date) then min(m.transaction_date) end as purchase_date,
   array_agg(distinct m.installment_number order by m.installment_number) as source_ordinals
 from open_finance.movements m
 where s.kind='installment' and m.resource_id=s.resource_id and m.user_id=s.user_id and m.environment=s.environment and m.mode=s.mode
   and m.external_id=any(s.observed_transactions) and m.installment_number between 1 and s.total_installments
   and m.installment_count=s.total_installments and m.amount=s.amount and m.direction='debit'
) purchase_link on true
where 'CREDIT_CARD_ACCOUNT'=any(c.scopes) and c.status='active' and (c.consent_expires_at is null or c.consent_expires_at>now()) and j.status='complete'
  and not (s.kind='recurring' and lower(s.description) ~ '(^|[^[:alpha:]])z[eé][[:space:]]*delivery([^[:alpha:]]|$)')
  and not exists(select 1 from open_finance.sync_jobs newer where newer.connection_id=j.connection_id and newer.kind=j.kind and newer.external_resource_id=j.external_resource_id and newer.status='complete' and newer.updated_at>j.updated_at);

alter view open_finance.agenda_items set(security_invoker=true);
revoke all on open_finance.agenda_items from public,anon,authenticated,service_role;
grant select on open_finance.agenda_items to zelo_of_workspace;
commit;
