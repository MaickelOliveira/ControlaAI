-- Preserve active-owner enforcement and every row. Restoring an older function
-- would revive provider access for inactive/trial accounts, so this boundary
-- remains in place during application recovery; prior active owners retain access.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
commit;
