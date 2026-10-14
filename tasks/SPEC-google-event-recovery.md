# Google events: bounded recovery

Module `google-events`, following immutable origins, linked local rows, exact
leases, conditional commands and sticky owner activation. Recovery resumes an
existing persisted intent; it never creates provenance, a new event/conference,
or a new invitation identity. No global credentials, owner/default-mode inference,
WhatsApp send, external automation or real-service fixture belongs to this slice.

## Plan and contract

1. Add `zelo_google_event_pending(p_limit)` with limit1–20, preserving rollback
   and disposable PostgreSQL tests. One snapshot selects original stored scopes
   and five references only: user_id, mode, company_id, event_id, operation_id
   (null for creation). Require `users.status='active'` (the actual `hasAccess`
   rule), sticky owner activation, nonarchived owned company and exact original
   active binding/grant/scope. No payload, ETag, provider ID, client or credential.
2. Add a server pump and fake-worker tests. Its private getter validates and
   freezes the entire batch before effects, with exact UUID/mode/company shape,
   no extra/trusted fields or duplicates. At most20 jobs, max3 concurrent workers.
   Feed only these references to existing creation/command SDK workers, which
   recheck current local/head/binding/lease immediately before provider requests.
3. Parent integrates a30-second application scheduler with overlap protection
   only after complete cutover. This module creates no scheduler/notification.

Creation is selected only without a current command, with queued/waiting or an
expired running lease, fewer than10 attempts, and both linked rows scheduled.
Commands require exact current head/revision and nondeleted head; queued/waiting
or expired running lease, fewer than10 attempts; delete requires both rows still
canceled, update/conference requires scheduled. Legacy/missing/moved rows cannot
authorize recovery. Skip unlinked or changed original account rather than filling
the batch with intents that cannot use their original connection. SQL selection
does not claim a lease or perform a provider effect; SDK claim/preflight still wins
races and completes only with its exact persisted identity.

`pumpGoogleWorkspaceEvents()` returns frozen `{selected,completed,deferred}`.
Only succeeded workers count as completed; queued/waiting/running/failed or refused
workers count as deferred. Unexpected worker errors never emit diagnostics or
entity logs. A failed/malformed database batch rejects with a fixed error before
any worker; no fallback or partial accepted batch.

## Verification and boundaries

SQL fixture uses a disposable Unix-socket-only PostgreSQL with fictitious owners,
companies, activation, local rows and event states. Cover scope/status/activation,
archive/unlink/cancel/current-head filters, expired leases/attempt bounds, strict
private ACLs, metadata-free references, deterministic limits and preserving rollback.
Server tests mock only private RPC/SDK workers and prove batch shape, max concurrency,
immutable capture, fixed error/counts and no partial dispatch.

Commands: `python3 supabase/tests/run-google-event-recovery.py`,
`npx vitest run src/lib/google-event-recovery.test.ts`,
`npx eslint src/lib/google-event-recovery.ts src/lib/google-event-recovery.test.ts`.
Each slice has at most five files and focused checks before commit. Parent owns
full tests/build/types and independent review. Do not apply real DDL/credentials,
publish/deploy, add dependencies or notifications from this isolated worktree.

Storage verification:126 disposable PostgreSQL assertions pass, including original
active binding/activation/access filters, queued/waiting/expired creation and
current commands, both local state checks, supersession/deletion, attempt bounds,
safe all-owner references/limit, exact personal/company IDs and preserving rollback.
The fixture accepts an optional activation-migration path only for this isolated
branch; integrated repository runs use its standard migration12 dependency.
Untouched queued intents also require their authorized binding revision still
match the active connection. Previously attempted intents retain reconciliation
eligibility. Twenty old denied claims cannot monopolize a batch of twenty and
prevent a newer authorized event from being processed.

Server pump verification:16 fake-selector/worker tests pass, including maximum
concurrency3 across20 jobs, full-batch validation before effects, immutable scope
capture, no diagnostics, safe failures and fixed counts. Both actual SDK transport
suites also deny all HTTP when the last SQL preflight refuses a deactivated owner;
the focused pump/creation/command run passes77 tests without real Google access.
