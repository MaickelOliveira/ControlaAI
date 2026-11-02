-- Roll back app entry points, preserving stored manual plans and payment history.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
drop function public.zelo_of_credit_data(uuid,text,date,date);
drop function public.zelo_of_set_credit_plan(uuid,text,uuid,jsonb);
-- The additive nullable columns and their validation stay in place. Legacy
-- workers ignore them and cannot erase the saved plan/history on conflict.
commit;
