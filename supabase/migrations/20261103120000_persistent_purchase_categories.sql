-- Apply category edits to the same purchase across paid/history and future installments.
-- Only category overrides change. Source amounts, dates, balances and payment states do not.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create temporary table zelo_progress_migration_privileges on commit drop as
 select pg_has_role(current_user,'zelo_of_workspace','SET') and pg_has_role(current_user,'zelo_of_workspace','USAGE') as effective,
 (select jsonb_build_object('admin',admin_option,'inherit',inherit_option,'set',set_option) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user) and grantor=(select oid from pg_roles where rolname=current_user)) as own_grant,
 has_schema_privilege('zelo_of_workspace','public','CREATE') as public_create,
 has_schema_privilege('zelo_of_workspace','open_finance','CREATE') as private_create;
do $$declare original jsonb;begin
 if not exists(select 1 from pg_roles where rolname='zelo_of_workspace' and not rolcanlogin and not rolsuper and not rolbypassrls) then raise exception 'OF_WORKSPACE_ROLE_UNSAFE';end if;
 if not(select effective from zelo_progress_migration_privileges) then
  select own_grant into original from zelo_progress_migration_privileges;
  execute format('grant zelo_of_workspace to %I with admin %s,inherit true,set true granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,current_user);
 end if;
end;$$;
do $$begin
 if not(select public_create from zelo_progress_migration_privileges) then grant create on schema public to zelo_of_workspace;end if;
 if not(select private_create from zelo_progress_migration_privileges) then grant create on schema open_finance to zelo_of_workspace;end if;
end;$$;
-- Same purchase: card, bank purchase date, currency, total and numbered sequence.
-- Conflicting ordinals never merge independent same-day purchases.
create or replace function open_finance.category_purchase_name(p_text text) returns text
language sql immutable set search_path=pg_catalog as $$
 select regexp_replace(lower(translate(regexp_replace(p_text,'([[:space:]]+|\()[0-9]+[[:space:]]*(/|de)[[:space:]]*[0-9]+\)?[[:space:]]*$','','i'),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')),'[^a-z0-9]','','g');
$$;
create or replace function open_finance.category_purchase_movements(p_user uuid,p_mode text,p_movement uuid) returns uuid[]
language plpgsql stable set search_path=pg_catalog set row_security=on as $$
declare chosen open_finance.movements%rowtype;pattern open_finance.card_schedules%rowtype;ids uuid[];direct_ids uuid[];ambiguous boolean;matches integer;
begin
 select * into chosen from open_finance.movements where id=p_movement and user_id=p_user and mode=p_mode and environment='production';
 if not found then return array[]::uuid[];end if;
 if chosen.resource_type<>'card' or chosen.direction<>'debit' then return array[chosen.id];end if;
 if chosen.transaction_date is not null and chosen.currency is not null and chosen.amount>0 and chosen.installment_count between 2 and 1000 and chosen.installment_number between 1 and chosen.installment_count then
  select array_agg(distinct m.id) into direct_ids from open_finance.movements m
  where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=chosen.resource_id and m.direction='debit'
   and (m.id=chosen.id or exists(select 1 from open_finance.card_schedules s where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=chosen.resource_id and s.kind='installment' and chosen.external_id=any(s.observed_transactions) and m.external_id=any(s.observed_transactions)));
  with candidates as (
   select m.* from open_finance.movements m where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=chosen.resource_id
    and m.resource_type='card' and m.direction='debit' and m.currency=chosen.currency and m.transaction_date=chosen.transaction_date
    and m.installment_count=chosen.installment_count and m.installment_number between 1 and chosen.installment_count
    and (m.id=any(coalesce(direct_ids,array[]::uuid[])) or abs(m.amount-chosen.amount)<=least(.20,least(m.amount,chosen.amount)*.02))
    and (m.id=any(coalesce(direct_ids,array[]::uuid[])) or length(open_finance.category_purchase_name(chosen.description))>=3 and (open_finance.category_purchase_name(m.description)=open_finance.category_purchase_name(chosen.description)
      or length(least(open_finance.category_purchase_name(m.description),open_finance.category_purchase_name(chosen.description)))>=9
       and (starts_with(open_finance.category_purchase_name(m.description),open_finance.category_purchase_name(chosen.description)) or starts_with(open_finance.category_purchase_name(chosen.description),open_finance.category_purchase_name(m.description)))))
  ) select array_agg(id order by id),count(*)<>count(distinct installment_number) or count(distinct (extract(year from bill_month)::integer*12+extract(month from bill_month)::integer-installment_number))>1 into ids,ambiguous from candidates;
  if ambiguous then return coalesce(direct_ids,array[chosen.id]);end if;
  return array(select distinct id from unnest(coalesce(ids,array[chosen.id])||coalesce(direct_ids,array[]::uuid[])) as members(id) order by id);
 end if;
 -- A recurring bank pattern is required; a merchant name alone never creates one.
 select count(*) into matches from open_finance.card_schedules s where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=chosen.resource_id and s.kind='recurring' and chosen.external_id=any(s.observed_transactions);
 if matches=1 then
  select * into pattern from open_finance.card_schedules s where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=chosen.resource_id and s.kind='recurring' and chosen.external_id=any(s.observed_transactions);
 elsif matches=0 then
  select count(*) into matches from open_finance.card_schedules s where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=chosen.resource_id and s.kind='recurring' and s.currency=chosen.currency and s.amount=chosen.amount and open_finance.category_purchase_name(s.description)=open_finance.category_purchase_name(chosen.description);
  if matches=1 then select * into pattern from open_finance.card_schedules s where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=chosen.resource_id and s.kind='recurring' and s.currency=chosen.currency and s.amount=chosen.amount and open_finance.category_purchase_name(s.description)=open_finance.category_purchase_name(chosen.description);end if;
 end if;
 if pattern.id is null then return array[chosen.id];end if;
 select count(*) into matches from open_finance.card_schedules s where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=chosen.resource_id and s.kind='recurring' and s.currency=pattern.currency and s.amount=pattern.amount and open_finance.category_purchase_name(s.description)=open_finance.category_purchase_name(pattern.description);
 select array_agg(m.id order by m.id) into ids from open_finance.movements m where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=chosen.resource_id and m.direction='debit'
  and (m.id=chosen.id or m.external_id=any(pattern.observed_transactions) or matches=1 and coalesce(m.installment_count,1)<=1 and m.currency=pattern.currency and m.amount=pattern.amount and open_finance.category_purchase_name(m.description)=open_finance.category_purchase_name(pattern.description));
 return coalesce(ids,array[chosen.id]);
end $$;

create or replace function public.zelo_of_set_movement_category(p_user uuid,p_mode text,p_movement uuid,p_category text) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare chosen open_finance.movements%rowtype;ids uuid[];
begin
 perform open_finance.require_access(p_user,p_mode);
 if p_category is not null and (length(btrim(p_category)) not between 1 and 100 or p_category<>btrim(p_category)) then raise exception 'OF_CATEGORY_INVALID';end if;
 select * into chosen from open_finance.movements where id=p_movement and user_id=p_user and mode=p_mode and environment='production';
 if not found then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(chosen.resource_id::text,0));
 ids:=open_finance.category_purchase_movements(p_user,p_mode,p_movement);
 update open_finance.movements set user_category=p_category where id=any(ids) and user_id=p_user and mode=p_mode and environment='production';
 update open_finance.card_schedules s set user_category=p_category where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=chosen.resource_id
  and exists(select 1 from open_finance.movements m where m.id=any(ids) and m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.external_id=any(s.observed_transactions));
 return true;
end $$;

create or replace function public.zelo_of_set_schedule_category(p_user uuid,p_mode text,p_schedule uuid,p_category text) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
declare chosen open_finance.card_schedules%rowtype;seed uuid;ids uuid[];
begin
 perform open_finance.require_access(p_user,p_mode);
 if p_category is not null and (length(btrim(p_category)) not between 1 and 100 or p_category<>btrim(p_category)) then raise exception 'OF_CATEGORY_INVALID';end if;
 select * into chosen from open_finance.card_schedules where id=p_schedule and user_id=p_user and mode=p_mode and environment='production' and kind in ('recurring','installment');
 if not found then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(chosen.resource_id::text,0));
 select m.id into seed from open_finance.movements m where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=chosen.resource_id and m.external_id=any(chosen.observed_transactions) order by m.transaction_date nulls last,m.installment_number nulls last,m.id limit 1;
 ids:=case when seed is null then array[]::uuid[] else open_finance.category_purchase_movements(p_user,p_mode,seed) end;
 update open_finance.movements set user_category=p_category where id=any(ids) and user_id=p_user and mode=p_mode and environment='production';
 update open_finance.card_schedules s set user_category=p_category where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=chosen.resource_id and s.kind=chosen.kind
  and (s.id=chosen.id or exists(select 1 from open_finance.movements m where m.id=any(ids) and m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.external_id=any(s.observed_transactions)));
 return true;
end $$;

-- A user edit updates all known siblings. Newly imported siblings inherit that
-- durable choice from bank-linked history even if the provider replaces a pattern.
create or replace function open_finance.schedule_movement_category(p_user uuid,p_mode text,p_resource uuid,p_external text,p_explicit text) returns text
language sql stable set search_path=pg_catalog set row_security=on as $$
 select coalesce(p_explicit,(select min(s.user_category) from open_finance.card_schedules s
  where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=p_resource and p_external=any(s.observed_transactions) and s.user_category is not null having count(distinct s.user_category)=1),
  (with family as materialized (
   select open_finance.category_purchase_movements(p_user,p_mode,target.id) as ids from open_finance.movements target
    where target.user_id=p_user and target.mode=p_mode and target.environment='production' and target.resource_id=p_resource and target.external_id=p_external
     and target.resource_type='card' and target.direction='debit' and target.installment_count between 2 and 1000
  ) select min(m.user_category) from family join open_finance.movements m on m.id=any(family.ids)
    where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=p_resource and m.user_category is not null having count(distinct m.user_category)=1));
$$;
create or replace function open_finance.effective_schedule_category(p_user uuid,p_mode text,p_schedule uuid) returns text
language sql stable set search_path=pg_catalog set row_security=on as $$
 select coalesce(s.user_category,(select min(open_finance.schedule_movement_category(p_user,p_mode,m.resource_id,m.external_id,m.user_category)) from open_finance.movements m
  where m.user_id=p_user and m.mode=p_mode and m.environment='production' and m.resource_id=s.resource_id and m.external_id=any(s.observed_transactions)
  having count(distinct open_finance.schedule_movement_category(p_user,p_mode,m.resource_id,m.external_id,m.user_category))=1))
 from open_finance.card_schedules s where s.id=p_schedule and s.user_id=p_user and s.mode=p_mode and s.environment='production';
$$;

do $$declare signature text;begin
 foreach signature in array array['open_finance.category_purchase_name(text)','open_finance.category_purchase_movements(uuid,text,uuid)','open_finance.schedule_movement_category(uuid,text,uuid,text,text)','open_finance.effective_schedule_category(uuid,text,uuid)'] loop
  execute format('alter function %s owner to zelo_of_workspace',signature);
  execute format('revoke all on function %s from public,anon,authenticated,service_role',signature);
 end loop;
end $$;
-- Existing public readers/writers retain their owner, ACL and RLS configuration.
do $$declare definition text;columns text;needle text:='(select s.user_category from open_finance.card_schedules s where s.id=v.id and s.user_id=p_user and s.mode=p_mode and s.environment=''production'')';begin
 definition:=pg_get_functiondef('public.zelo_of_installment_anchors(uuid,text)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'OF_PURCHASE_CATEGORY_ANCHOR_BASE_MISMATCH';end if;
 execute replace(definition,needle,'open_finance.effective_schedule_category(p_user,p_mode,v.id)');
 definition:=rtrim(pg_get_viewdef('open_finance.agenda_items'::regclass,true),E';\n ');
 select string_agg(format('a.%I',attname),',' order by attnum) into columns from pg_attribute where attrelid='open_finance.agenda_items'::regclass and attnum>0 and not attisdropped and attname<>'user_category';
 execute 'create or replace view open_finance.agenda_items with(security_invoker=true) as select '||columns||',open_finance.effective_schedule_category(a.user_id,a.mode,a.id) as user_category from ('||definition||') a';
end $$;
do $$declare original jsonb;begin
 if not(select public_create from zelo_progress_migration_privileges) then revoke create on schema public from zelo_of_workspace;end if;
 if not(select private_create from zelo_progress_migration_privileges) then revoke create on schema open_finance from zelo_of_workspace;end if;
 if not(select effective from zelo_progress_migration_privileges) then
  if (select own_grant from zelo_progress_migration_privileges) is null then execute format('revoke zelo_of_workspace from %I granted by %I',current_user,current_user);
  else
   select own_grant into original from zelo_progress_migration_privileges;
   execute format('grant zelo_of_workspace to %I with admin %s,inherit %s,set %s granted by %I',current_user,case when (original->>'admin')::boolean then 'true' else 'false' end,case when (original->>'inherit')::boolean then 'true' else 'false' end,case when (original->>'set')::boolean then 'true' else 'false' end,current_user);
  end if;
 end if;
end;$$;
notify pgrst,'reload schema';
commit;
