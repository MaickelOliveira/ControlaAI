# Google events: conditional commands

Module `google-events`, continuing `SPEC-google-events.md`. The worker is dormant
until every consumer and settings boundary uses verified workspace scope. No real
Google call, invitation, credential or production migration belongs to fixtures.

## Contract

An explicit authorized update, cancellation or new Meet conference receives a new
logical operation UUID. Persist its immutable kind, full canonical controlled
payload, original target, expected ETag and deterministic conference request ID
before an HTTP mutation. Retries reuse that operation. No metadata-only edit
(minutes, reminders, local phone contacts) prepares a command or calls Google.

Private command heads retain exact decimal revision, current operation, latest
verified ETag and deletion state. Immutable command inputs have bounded mutable
attempt/lease/status fields. Preparation compares the caller's captured head
revision and active original account/client. It refuses an unexpired running
worker; a new explicit queued/failed/expired operation invalidates older leases.
Preparation atomically records desired public fields, preserving minutes/reminders
and immutable provenance. Cancellation is logical, retaining both linked rows.

Creation must have succeeded. A conference command may also follow the definitive
creation CONFERENCE_FAILED outcome only with remote-known and verified ETag.
Ambiguous creation cannot become an edit or second conference. Update/conference
requires both linked local rows scheduled; delete can authorize their cancellation.

The SDK reads the original calendar/event, verifies the original signed creation
properties and validates its ETag. An additional opaque `zeloCommand` HMAC binds
original identity, operation UUID/head revision/kind/payload digest/conference ID.
It preserves the original `zeloOrigin` and `zeloCreation`. Reconcile an applied
operation only when its marker and controlled payload match. Ignore Google-enriched
guest display names/responses and normalize email case/explicit time offsets;
never ignore a changed title, time, recurrence, location or guest email set.

PATCH/DELETE requires the persisted expected ETag and `If-Match`. Changed ETag or
HTTP412 is a fixed conflict, never automatic adoption of fresh provider data.
Explicit reconciliation later needs a newly verified snapshot and user action.
Known DELETE404/410 is idempotent success; update/conference missing is terminal.
An explicit conference command alone reserves a new stable request ID. Pending
and ambiguous recovery keep that ID and use GET reconciliation; a definitive
conference failure needs another explicit command. Never blindly retry invitations.

Claim/preflight/finish checks scope, head, operation, exact attempt/lease, active
original binding/grant/client and local state. Preflight needs more than16 seconds
for a15-second HTTP timeout with SDK retries disabled. No lock spans Google.
Only the current worker publishes ETag/Meet result, atomically to both public rows.
Public DTOs contain operation/event UUID, fixed state/error and valid Meet link.

## Slices and verification

1. This spec, pure canonical update/identity/provider comparison and command HMAC.
2. Additive SQL journal/RPCs, preserving rollback and real disposable PG fixture.
3. Private server DTO adapter and validation tests.
4. Actual SDK transport, pending/ambiguous/412/race recovery tests.

Each slice touches at most five files, passes focused Vitest/lint and is committed
before dependent work. Parent runs full tests/build/types and independent review.
Use `npx vitest run src/lib/google-event-command-policy.test.ts
src/lib/google-event-marker.test.ts`, `npx eslint <changed TypeScript files>`,
`npm test -- --run`, `npm run build`, `npx tsc --noEmit` and the existing secret and
dependency checks. No dependencies, global fallbacks or legacy origin inference.

Official references checked2026-10-13:
https://developers.google.com/workspace/calendar/api/guides/version-resources
https://developers.google.com/workspace/calendar/api/v3/reference/events/patch
https://developers.google.com/workspace/calendar/api/v3/reference/events/delete
