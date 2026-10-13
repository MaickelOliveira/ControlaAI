-- Single statement: PostgreSQL concurrent index builds cannot run in a transaction.
-- Preserve functions, workspace RLS and every imported job/schedule.
create index concurrently sync_jobs_complete_lookup_idx
 on open_finance.sync_jobs(connection_id,kind,external_resource_id,updated_at desc)
 where status='complete';
