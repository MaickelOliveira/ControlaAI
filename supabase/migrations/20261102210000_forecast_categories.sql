-- Editable categories for bank recurring/installment forecasts. No financial facts are changed.
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
-- A user choice belongs to this bank series and survives source refreshes.
alter table open_finance.card_schedules add column if not exists user_category text
 check(user_category is null or (length(btrim(user_category)) between 1 and 100 and user_category=btrim(user_category)));
create or replace function public.zelo_of_set_schedule_category(p_user uuid,p_mode text,p_schedule uuid,p_category text) returns boolean
language plpgsql security definer set search_path=pg_catalog set row_security=on as $$
begin
 perform open_finance.require_access(p_user,p_mode);
 if p_category is not null and (length(btrim(p_category)) not between 1 and 100 or p_category<>btrim(p_category)) then raise exception 'OF_CATEGORY_INVALID';end if;
 update open_finance.card_schedules set user_category=p_category
 where id=p_schedule and user_id=p_user and mode=p_mode and environment='production' and kind in ('recurring','installment');
 return found;
end;$$;
alter function public.zelo_of_set_schedule_category(uuid,text,uuid,text) owner to zelo_of_workspace;
revoke all on function public.zelo_of_set_schedule_category(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.zelo_of_set_schedule_category(uuid,text,uuid,text) to service_role;

-- Only positively linked movements inherit a series choice. A movement's own
-- explicit category wins, and conflicting series categories never become a guess.
create or replace function open_finance.schedule_movement_category(p_user uuid,p_mode text,p_resource uuid,p_external text,p_explicit text) returns text
language sql stable set search_path=pg_catalog set row_security=on as $$
 select coalesce(p_explicit,(select min(s.user_category) from open_finance.card_schedules s
 where s.user_id=p_user and s.mode=p_mode and s.environment='production' and s.resource_id=p_resource
 and p_external=any(s.observed_transactions) and s.user_category is not null having count(distinct s.user_category)=1));
$$;
alter function open_finance.schedule_movement_category(uuid,text,uuid,text,text) owner to zelo_of_workspace;
revoke all on function open_finance.schedule_movement_category(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;

do $$declare definition text;signature text;needle text:='''user_category'',v.user_category';
begin
 foreach signature in array array['public.zelo_of_report(uuid,text,date,date,uuid)','open_finance.report_page(uuid,text,date,date,uuid,integer)'] loop
  if to_regprocedure(signature) is null then continue;end if;
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('schedule_movement_category' in definition)>0 then continue;end if;
  if position(needle in definition)>0 then
   execute replace(definition,needle,'''user_category'',open_finance.schedule_movement_category(v.user_id,v.mode,v.resource_id,v.external_id,v.user_category)');
  elsif position('report_page' in definition)=0 then raise exception 'OF_CATEGORY_REPORT_BASE_MISMATCH';end if;
 end loop;
 if not exists(select 1 from information_schema.columns where table_schema='open_finance' and table_name='agenda_items' and column_name='user_category') then
  definition:=rtrim(pg_get_viewdef('open_finance.agenda_items'::regclass,true),E';\n ');
  execute 'create or replace view open_finance.agenda_items with(security_invoker=true) as select a.*,(select s.user_category from open_finance.card_schedules s where s.id=a.id and s.user_id=a.user_id and s.mode=a.mode and s.environment=''production'' and a.kind<>''bill'') as user_category from ('||definition||') a';
 end if;
 definition:=pg_get_functiondef('public.zelo_of_installment_anchors(uuid,text)'::regprocedure);
 if position('user_category' in definition)=0 then
  if position('to_jsonb(v) order by v.id' in definition)=0 then raise exception 'OF_CATEGORY_ANCHOR_BASE_MISMATCH';end if;
  execute replace(definition,'to_jsonb(v) order by v.id','(to_jsonb(v)||jsonb_build_object(''user_category'',(select s.user_category from open_finance.card_schedules s where s.id=v.id and s.user_id=p_user and s.mode=p_mode and s.environment=''production''))) order by v.id');
 end if;
end;$$;
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
