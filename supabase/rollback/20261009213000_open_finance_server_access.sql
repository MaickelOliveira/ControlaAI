-- Removes only this migration's RPCs. Retains all private bank data.
begin;
drop function public.zelo_of_overview(uuid,text,text);
drop function public.zelo_of_access(uuid);
commit;
