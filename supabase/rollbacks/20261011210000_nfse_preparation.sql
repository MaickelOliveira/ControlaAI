-- Disable fiscal storage access if the application increment is rolled back.
-- Preserve all profiles, encrypted certificates, services and draft history.
begin;
revoke all on public.nfse_profiles, public.nfse_services, public.nfse_drafts from service_role;
commit;
-- Re-enable only when the reviewed fiscal application is restored:
-- grant select,insert,update,delete on public.nfse_profiles,public.nfse_services,public.nfse_drafts to service_role;
