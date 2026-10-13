# Bank schedule lookup index

The bank agenda checks whether a newer completed synchronization supersedes each observed schedule. It also checks completed replacements for pending/failed jobs. Existing queue indexes cover pending/running jobs, not the completed lookup by connection, kind, external resource and update time. Investigate this repeated search independently from browser latency and payload volume.

Add only `open_finance.sync_jobs_complete_lookup_idx` on `(connection_id,kind,external_resource_id,updated_at desc)` where `status='complete'`. Do not change functions, RLS, roles, grants, imported records or synchronization frequency. Build/drop the index concurrently in single-statement migration/rollback files; no explicit transaction around either operation. Verify `indisvalid` and `indisready` after applying. A failed concurrent build must be inspected before retrying.

Acceptance: disposable real PostgreSQL reproduces the missing completed-job index on the existing schema. Seed multiple owners, Personal and companies with identical names, several cards, stale and current completed jobs, recurring/installment schedules and pending/failed replacements. Agenda and overview JSON must remain exactly identical before/after the index, including order and incomplete flags; cross-company/owner rejection, ACL/RLS metadata and job/schedule counts remain unchanged. Confirm the completed lookup plan can use the new index without forcing planner settings. Record local execution timing as evidence, not a machine-dependent pass threshold. Rollback removes only the index and leaves data unchanged.

All fixture records are fictitious, PostgreSQL listens only on a disposable Unix socket, and no external provider is called. Measure actual authorized reads before/after separately; do not equate database timings with complete page load or infer Egress/log changes from isolated samples.

Primary operational reference: [Supabase index management](https://supabase.com/docs/guides/database/postgres/indexes), including concurrent creation through the SQL Editor to keep table writes available.
