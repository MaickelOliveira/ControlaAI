# Financial read recovery

A stalled fetch held the live reader in its running state indefinitely. Reads now abort after 30 seconds, enter the existing error backoff, and retry with a new controller. Late expired results cannot replace a fresh result. Cleanup aborts the current request and clears both timers; no sensitive snapshot is persisted or logged.

Dashboard history uses the same scoped reader and retries temporary failures. It stops after its first complete successful result, avoiding a new background history polling stream. Mode changes clear data and errors by loader identity; the current period starts before the history read.

Bank category lookup checks the small saved override set before resolving an installment family. A linked transaction list is built once rather than re-searching schedules for every card movement. Concurrent partial indexes support saved category lookups. Explicit overrides, positive bank identity, ambiguous independent purchases, RLS, owners, ACLs and financial facts keep their existing behavior.

Apply 20261103141000 indexes as standalone concurrent statements (no transaction wrapper), then 20261103142000. The performance rollback restores old helpers while retaining stored choices and useful indexes. Do not roll back the earlier category feature or delete category overrides.

Fictitious PostgreSQL proof includes 20 unrelated twelve-installment series on a card with saved categories. New anchor read: 0.142 seconds; the old helper exceeded a five-second statement limit in the same fixture. Tests also cover new imports, replacement patterns, resets, recurring history, independent/ambiguous purchases, company/owner/personal isolation and rollback. These are local fixture measurements, not a claim about all production latency. Production read-only checks confirmed the current month, overview, installment anchors and six-month report can respond; the actual history HTTP request recovered during diagnosis. That does not remove the need for bounded reads and retries on transient failures.
