-- This boundary must survive rollback: removing it would resume global account
-- credentials for already separated owners. Use a recovery application release
-- that still checks zelo_google_owner_activated; never restore an older global
-- consumer for an activated owner. Keep all rows, functions, triggers and ACLs.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
commit;
