# Spec: google-events

## Objective

Module `google-events` follows `google-authorization` in the approved workspace
capability map. A personal/company event and its Meet use one immutable origin:
owner, mode/company UUID, local event UUID, Google binding/grant, calendar and remote
event ID. Authorize the local record and exact active connection before Google
effects. Company names and current/default UI mode never select credentials.
Changing the selected calendar affects new events; existing events retain theirs.
Changing Google identity, unlinking or archiving denies remote changes and retains
local history. The credential legacy assignment does not establish event origin.

Events without verified provenance remain readable under existing local access
rules. Local reminders/minutes/completion metadata remain editable without Calendar
effects. Remote edits/deletes require verified provenance; never infer it from a
matching ID/title/calendar, remembered company or newly assigned legacy connection.
The eventual UI must explain a blocked synchronization without deleting history.

Creation records local intent and its immutable provider target before Google.
A stable event ID and conference request ID belong to that persisted logical event.
Retries/process restarts reuse them, including ambiguous network failures. A Meet
and its appointment reference the same logical event and provenance, avoiding a
second remote creation. A409 alone does not prove a matching remote event: read and
verify its persisted provenance marker before accepting it. Pending conference
creation is a retryable state, not permission to create a second meeting.

## Stack, commands and structure

Existing Next16.3/TypeScript, Google SDK, Vitest and PostgreSQL; no new dependencies.
Server-only adapters and adjacent tests live in `src/lib/google-*`; migrations,
preservation rollbacks and disposable fixtures in `supabase/`; this contract and
task plan in `tasks/`. Read installed Next guidance before boundary changes.

- Focused tests: `npx vitest run src/lib/google-event-policy.test.ts`
- All tests: `npm test -- --run`
- Types: `npx tsc --noEmit`
- Build: `npm run build`
- Lint: `npx eslint src/lib/google-event-policy.ts src/lib/google-event-policy.test.ts`
- Secret-pattern check: `node scripts/check-secrets.mjs`
- Dependencies: `npm run security:dependencies`

## Style and boundary contract

Validate unknown stored data explicitly and copy it into frozen canonical records.
Pure policy functions are validation, not authentication of caller-supplied input.
Adapters must receive scope and records loaded through verified request/participant
or authorized job context, never model output or arbitrary body references.

```ts
const target = googleEventOperationTarget(authenticatedWorkspace, authorizedEvent.id, storedOrigin, activeBinding);
// Only a server adapter may use target, after storage/activity rechecks.
```

Public responses contain only allowlisted event/synchronization metadata and fixed
errors. Never return credentials, SDK responses or raw diagnostics. Remote Calendar
effects use the scoped runtime and stored origin calendar; no global legacy lookup.

## Test strategy and success criteria

Start with pure provenance guards and deterministic retry identity. Test owner,
mode/company, binding/grant mismatches, unlinked connections, malformed or missing
origin, immutable capture and calendar changes. Equal names do not affect keys.
IDs meet Google's documented constraints, remain stable across retries/canonical
UUID casing and differ across owners/spaces/events. No network or actual secrets.

Then test private persistence and actual SDK transports using fictitious data:
atomic local intent before provider creation, cross-process races, source changes,
idempotent retries, conference pending/failed states,409 without provenance, local
metadata with zero provider calls and no invitation on denied scopes. Database
fixtures use a disposable Unix-socket-only cluster and restrictive ACL/RLS/owner FKs.
Preserve existing rows/ciphertext through migrations and rollback.

## Boundaries

Always validate ownership/activity before effects, retain original event/calendar,
persist retry identity before provider calls, test/review each increment and keep
the replacement dormant until all consumers are migrated. Standing user authority
allows routine reviewed implementation, GitHub integration and deployment.

Require user action for actual new Google consent/account selection and any scope
expansion or destructive history migration outside this approved separation.
Never use real customer rows/credentials as fixtures, send real test invitations,
revoke shared grants, infer legacy provenance, or activate a partial integration.

## Ordered slices

1. Pure provenance/connection guard and stable retry identities; no live caller.
2. Private event intent/provenance and synchronization transitions with owner FKs,
   concurrency control, preserving rollback and real disposable PostgreSQL checks.
3. Scoped SDK effects with fixed IDs and safe retry/reconciliation behavior.
4. Agenda/Meet services share one persisted event; local metadata bypasses Google.
5. Web/WhatsApp/job consumers use authenticated scope and safe DTOs. The subsequent
   `google-settings` module completes UI/API cutover and full activation review.

### First private storage increment

Prepare an immutable private event-origin intent, keyed by the server-authorized
logical event UUID. Capture the exact active binding/grant, configured client,
binding revision and selected calendar under owner → company locks. Derive and
store the v1 event/conference IDs inside the transaction; the database byte sequence
must match the pure policy's domain-separated UTF-8/NUL hashing. Another owner or
workspace cannot borrow an existing UUID; a repeated reservation must match the
original binding/grant/revision and must not move its target. Binding changes
invalidate a stale first-creation reservation. Grant-only refresh leaves it valid.

An authorized scoped getter returns immutable origin metadata for local history,
including its exact decimal creation-binding revision. It is not authorization
for a provider effect: the runtime/consumer rechecks the active connection and
record access. Rows are private with owner/company and grant/binding ownership
foreign keys, no browser policies and backend select/insert only. Preserve all
rows and close access in rollback. Do not modify or infer origins for existing
appointments/Meets. This storage-only slice installs no caller; transactional
local-record linkage, command state/retry reconciliation and provider effects
follow before activation.

Official references checked2026-10-13:
https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
https://developers.google.com/workspace/calendar/api/v3/reference/events
