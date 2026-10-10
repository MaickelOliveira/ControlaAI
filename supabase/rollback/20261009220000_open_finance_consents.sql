-- Preserve consent audit columns and revocation states; disable operations only.
begin;
drop function public.zelo_of_set_status(uuid,text,uuid,text,text);
drop function public.zelo_of_connection(uuid,text,uuid);
drop function public.zelo_of_save_consent(uuid,text,jsonb);
drop function open_finance.require_access(uuid,text);
commit;
