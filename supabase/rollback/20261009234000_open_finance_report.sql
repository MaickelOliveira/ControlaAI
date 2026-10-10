-- Removing the new reader preserves bank history and the safer explicit overview.
begin;
drop function public.zelo_of_report(uuid,text,date,date,uuid);
commit;
