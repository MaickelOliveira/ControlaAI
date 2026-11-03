-- Registered purchases retain a positive series identity. No historical records
-- are guessed or changed during deployment; legacy links are resolved on edits.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
alter table public.finances add column recurring_id uuid references public.recurring_transactions(id) on delete set null;
alter table public.recurring_transactions add column category_override text check(category_override is null or length(btrim(category_override)) between 1 and 100);

create function public.zelo_registered_purchase_name(p_description text) returns text
language sql immutable set search_path=pg_catalog as $$
 select lower(btrim(regexp_replace(regexp_replace(p_description,'[[:space:]]*·[[:space:]]*Parcela[[:space:]]+[0-9]+/[0-9]+([[:space:]]*·[[:space:]]*restantes[[:space:]]+[0-9]+)?','','gi'),'[[:space:]]+\([0-9]+/[0-9]+\)[[:space:]]*$','','g')));
$$;
revoke all on function public.zelo_registered_purchase_name(text) from public,anon,authenticated;
grant execute on function public.zelo_registered_purchase_name(text) to service_role;

create function public.zelo_registered_purchase_guard() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare linked public.recurring_transactions%rowtype;candidate uuid;matches integer;fraction text[];
begin
 if new.recurring_id is null and ((tg_op='UPDATE' and new.category is distinct from old.category) or (tg_op='INSERT' and new.description ~ '(?:[Pp]arcela[[:space:]]+|\()[0-9]+/[0-9]+')) then
  fraction:=regexp_match(new.description,'(?:[Pp]arcela[[:space:]]+|\()([0-9]+)/([0-9]+)');
  select count(*),min(r.id::text)::uuid into matches,candidate from public.recurring_transactions r
   where r.user_id=new.user_id and r.mode=new.mode and r.company_id is not distinct from new.company_id and r.type=new.type
    and public.zelo_registered_purchase_name(r.description)=public.zelo_registered_purchase_name(new.description)
    and new.date>=r.start_date and (r.recurrence_type='recurring' and new.source='whatsapp' and abs(new.amount-r.amount)<=.009
      or r.recurrence_type='installment' and fraction is not null and fraction[2]::integer=r.total_installments and fraction[1]::integer between 1 and r.total_installments and abs(new.amount-r.amount)<=least(.20,least(new.amount,r.amount)*.02));
  if matches=1 then new.recurring_id:=candidate;end if;
 end if;
 if new.recurring_id is null then return new;end if;
 select * into linked from public.recurring_transactions where id=new.recurring_id and user_id=new.user_id and mode=new.mode and type=new.type and company_id is not distinct from new.company_id for share;
 if not found then raise exception 'RECURRING_PURCHASE_SCOPE_MISMATCH';end if;
 if tg_op='INSERT' then new.category:=linked.category;end if;
 return new;
end $$;
revoke all on function public.zelo_registered_purchase_guard() from public,anon,authenticated,service_role;
create trigger zz_zelo_registered_purchase_guard before insert or update of recurring_id,category,user_id,mode,company_id,type on public.finances for each row execute function public.zelo_registered_purchase_guard();

-- Invoice refreshes may update source amounts/dates, but an explicit category
-- remains selected until the holder changes it again.
create function public.zelo_registered_category_override() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 if old.category_override is not null and new.category_override is not distinct from old.category_override then new.category:=old.category_override;end if;
 return new;
end $$;
revoke all on function public.zelo_registered_category_override() from public,anon,authenticated,service_role;
create trigger zz_zelo_registered_category_override before update of category,category_override on public.recurring_transactions for each row execute function public.zelo_registered_category_override();

create function public.zelo_registered_category_history() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 if pg_trigger_depth()>2 or new.category_override is null then return new;end if;
 if pg_trigger_depth()=1 and new.category is not distinct from old.category and new.category_override is not distinct from old.category_override then return new;end if;
 -- Link only a unique registered series with its full description/purchase
 -- marker, owner, workspace, amount and installment total. Never match merchant alone.
 if not exists(select 1 from public.recurring_transactions other where other.id<>new.id and other.user_id=new.user_id and other.mode=new.mode and other.company_id is not distinct from new.company_id and other.type=new.type
    and public.zelo_registered_purchase_name(other.description) in (public.zelo_registered_purchase_name(new.description),public.zelo_registered_purchase_name(old.description)) and (abs(other.amount-new.amount)<=.20 or abs(other.amount-old.amount)<=.20)) then
  update public.finances f set recurring_id=new.id where f.recurring_id is null and f.user_id=new.user_id and f.mode=new.mode and f.company_id is not distinct from new.company_id and f.type=new.type and f.date>=new.start_date
   and public.zelo_registered_purchase_name(f.description) in (public.zelo_registered_purchase_name(new.description),public.zelo_registered_purchase_name(old.description))
   and (new.recurrence_type='recurring' and f.source='whatsapp' and (abs(f.amount-new.amount)<=.009 or abs(f.amount-old.amount)<=.009)
     or new.recurrence_type='installment' and (abs(f.amount-new.amount)<=least(.20,least(f.amount,new.amount)*.02) or abs(f.amount-old.amount)<=least(.20,least(f.amount,old.amount)*.02))
       and (regexp_match(f.description,'(?:[Pp]arcela[[:space:]]+|\()([0-9]+)/([0-9]+)'))[2]::integer in (new.total_installments,old.total_installments)
       and (regexp_match(f.description,'(?:[Pp]arcela[[:space:]]+|\()([0-9]+)/([0-9]+)'))[1]::integer between 1 and greatest(new.total_installments,old.total_installments));
 end if;
 update public.finances set category=new.category where recurring_id=new.id and user_id=new.user_id and mode=new.mode and company_id is not distinct from new.company_id and category is distinct from new.category;
 return new;
end $$;
revoke all on function public.zelo_registered_category_history() from public,anon,authenticated,service_role;
create trigger zelo_registered_category_history after update of category,category_override on public.recurring_transactions for each row execute function public.zelo_registered_category_history();

create function public.zelo_registered_finance_category() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 if pg_trigger_depth()>1 or new.recurring_id is null then return new;end if;
 update public.recurring_transactions set category=new.category,category_override=new.category where id=new.recurring_id and user_id=new.user_id and mode=new.mode and type=new.type and company_id is not distinct from new.company_id;
 return new;
end $$;
revoke all on function public.zelo_registered_finance_category() from public,anon,authenticated,service_role;
create trigger zelo_registered_finance_category after update of category on public.finances for each row when(old.category is distinct from new.category) execute function public.zelo_registered_finance_category();
notify pgrst,'reload schema';
commit;
