-- Disable queue operations without deleting acknowledged work or financial history.
begin;
set local lock_timeout='5s';
drop function public.zelo_of_enqueue(uuid,text,uuid,jsonb);
drop function public.zelo_of_webhook_target(uuid,text,text,text);
drop function public.zelo_of_claim(uuid,text);
drop function public.zelo_of_commit_page(uuid,text,uuid,uuid,jsonb,text,jsonb);
drop function public.zelo_of_fail_job(uuid,text,uuid,uuid,text);
drop function public.zelo_of_retry_failed(uuid,text,uuid);
drop function public.zelo_of_capabilities(uuid,text);
drop function open_finance.pick(jsonb,text[]);
revoke all on open_finance.sync_jobs from public,anon,authenticated,service_role;
commit;
