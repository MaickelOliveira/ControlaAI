# Bounded saved bank ledger reads

A complete 2,000-row saved bank ledger previously made forty serial 50-row `zelo_of_report` calls, recomputing the same scope, totals and metadata each time. The opt-in reader uses one `zelo_of_ledger_report` call plus overview instead. It does not contact Polp, synchronize banks or cache completed reports. Other scope/authentication/storage reads are not included in this two-call count.

The existing paginated HTTP/report/WhatsApp contract stays at 50 rows with its cursor. Both SQL wrappers use a private shared implementation copied from the current report, with only page-size validation and bounded limits changed. Owners, RLS, company selection, dates, original amounts, reconciliations, exclusions and metadata are unchanged. More than 2,000 rows returns an overflow cursor that the complete reader rejects; it never displays a truncated successful total.

## Verification

Fifteen focused application checks cover 0, 1, 50, 51 and 2,000 rows, overflow responses, storage failure, owner/company/mode pass-through and the unmodified paginated HTTP contract. PostgreSQL fixture checks snapshot the original implementation before migration and compare all 2,000 records, ordering and totals against the batch and forty legacy pages afterwards. They also verify cross-owner/company denial, personal/business separation, direct/client helper denial, NOLOGIN/NOBYPASSRLS ownership, unchanged legacy RPC ACL/configuration, absence of temporary grants, rollback and reapplication. Run `python3 supabase/tests/run-bank-ledger-batch.py --bin-dir <PostgreSQL binaries>`; the cluster uses only a temporary Unix socket and fictitious records.

The fictitious serialized report payload fell from 1,171,052 bytes across forty responses to 1,151,864 bytes in one response (about 1.6%). The main expected benefit is fewer sequential round trips and repeated computations. This fixture does not prove production latency or per-service Supabase egress/log reduction. The operator reported the preceding page-load correction reduced approximately five seconds to three, still unsatisfactory.

## Rollout and recovery

1. Apply `supabase/migrations/20261012090000_bank_ledger_batch.sql` and verify ownership/RLS/ACL before activation. No client records or connections are modified. Temporary migration grants restore their previous state.
2. Deploy the reviewed image. `OPEN_FINANCE_BATCH_REPORT_ENABLED` defaults off.
3. Set `OPEN_FINANCE_BATCH_REPORT_ENABLED=true` in the server runtime and redeploy only after SQL verification. Confirm Dashboard/Finances values and continued bank access; measure production latency/traffic separately.
4. To roll back, disable the flag and redeploy first; then, if needed, apply `supabase/rollback/20261012090000_bank_ledger_batch.sql`. It restores the original report implementation before removing the new functions, preserving data and connections.
