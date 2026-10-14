# Google events: one scoped read snapshot

Module `google-events`, following the immutable origin, creation, local-link and
conditional command contracts. Existing authenticated workspace context remains
the authority. This increment reads history; it grants no provider effect and
loads no configuration, credential or legacy token.

## Contract

`zelo_google_appointment_rows` and `zelo_google_meet_rows` accept owner UUID,
personal/business mode, exact company UUID or personal null, optional local event
UUID, and limit1–1000. Each uses one SELECT snapshot for public rows and private
origin/link/creation/current-command joins. Explicit public columns and five
allowlisted metadata fields leave SQL; no private payload, ETag, binding/grant,
client, remote configuration or credential is added.

Preserve existing visibility: business rows have the chosen company UUID; personal
rows have company null or `workspace_legacy=true`. Exclude a legacy row mapped to
an archived company. Reject invalid/foreign/archived selected business context.
Private joins require matching owner, mode/company and nonlegacy local linkage.
Visible historical rows cannot acquire Google authority from a matching UUID.

The metadata fields are:

- `google_sync_version`: null for local/legacy, otherwise exact
  `v1:<creationAttempt>:<headVersion>:<commandAttempt>` from the same snapshot.
- `google_sync_state`: queued/running/waiting/succeeded/failed/local/legacy;
  current command supersedes creation state.
- `google_sync_failure_code`: existing fixed enum or null, never diagnostics.
- `google_meet_pending`: a nonterminal creation requesting Meet or current
  nonterminal conference command; no newly generated request is implied.
- `google_cancellation_pending`: canceled local row with current delete command
  queued/running/waiting/failed, retaining a visible unresolved cancellation.

List excludes canceled history except unresolved cancellation. Specific-event GET
retains canceled linked/local/legacy history under ordinary workspace visibility.
Rows order by start time/local UUID. Local and legacy states have null revision,
failure and both pending flags false. Existing public calendar fields are preserved
for the parent server converters; no private provider IDs are introduced.

## Server boundary and verification

`loadGoogleAppointmentRows(scope,{eventId?,limit?})` and
`loadGoogleMeetRows(scope,{eventId?,limit?})` each make one RPC, capture inputs before
await, validate/freeze an explicit row allowlist, owner/workspace/UUID/time/type,
fixed state/error, revision and pending invariants, and reject mismatched/malformed
storage without exposing diagnostics. Parent maps these server rows to the current
Appointment/Meet DTOs, keeping data and expected revision from one snapshot.

Use adjacent Vitest tests with fictitious rows and no services, then an additive
`20261013150000_google_event_readmodel.sql`, preserving rollback and disposable
Unix-socket PostgreSQL fixture. Include personal/business/legacy/archive/foreign,
creation/command versions, cancellation retry visibility, bounded limits, ACLs,
immutable history and snapshot-consistency races. No new dependencies or N queries.

Focused: `npx vitest run src/lib/google-event-readmodel.test.ts`; lint:
`npx eslint src/lib/google-event-readmodel.ts src/lib/google-event-readmodel.test.ts`.
Parent performs full test/build/type/security checks and independent review before
live integration. Never apply fixture DDL to production or infer legacy provenance.
