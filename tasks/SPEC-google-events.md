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

The following server adapter receives only an authenticated workspace and the
authorized logical event UUID. It captures immutable inputs before awaits, loads
the exact active binding and configured OAuth client, then submits the original
binding/grant/revision to the private reservation. No metadata refresh/retry after
a conflict. A read is scoped history metadata only; no configured credential lookup
or legacy fallback. Validate all returned UUIDs/scope, exact decimal creation
revision and both v1 retry IDs against the local logical event. Reservation results
must also match the captured binding/grant/calendar/revision. Return frozen DTOs
and fixed errors without raw storage diagnostics. Install no live consumer yet.

### Creation lifecycle

First persist one immutable validated creation payload per origin. Reusing the
logical UUID with different content is a conflict, never an implicit remote update.
Keep payloads private; status/UI serializers expose only allowlisted fields.
Mutable state records queued/running/waiting/succeeded/failed, exact decimal attempt
revision, short database-issued lease, bounded attempts, known remote creation,
ETag, safe failure code and validated Meet link. No tokens or provider diagnostics.

Claim after scoped runtime credentials are ready. Owner/company locks and an exact
attempt revision yield one worker; a60-second lease expires independently of the
worker process. Completion compares lease UUID/revision/lifetime and active exact
binding/grant/client again. A stale worker cannot overwrite a winner or revive a
removed connection. No provider call occurs under a database lock. Provider calls
have fixed timeouts and retry disabled; metadata is checked before every effect.

Before an insert, GET the stable remote ID and verify its signed origin/operation
markers. A409 requires that same verification, never blind acceptance. A known
deleted/foreign event is not recreated. Existing exact marked events are reconciled
without a second insert/invitation. Conference pending uses read-only polling of
the same request ID, without a second patch/conference. A definitive conference
failure requires a separate explicit retry operation, not a regenerated ID during
an ambiguous retry. Updates/deletes later use stored calendar, ownership markers
and conditional ETags to prevent stale writes.

A new creation initially requires the original binding revision. After a binding
change, retries may reconcile an already attempted remote event using the same
active binding/grant; they cannot silently insert a new event. An explicit user
retry can capture the current binding revision while retaining the event's original
calendar/account. It does not modify immutable origin or payload. Preserve a sticky
was-attempted/remote-known flag across retry rounds, so a restart cannot reinterpret
an ambiguous request as an untouched first attempt. Limit automatic attempts per
round; explicit retries retain the same logical IDs and invalidate older leases.

Prepare storage/rollback/fixtures, then private DTO adapters and payload/marker
validation, then actual SDK reconciliation. Transactional public-record linkage and
all consumers follow before activation. No existing row is assigned provenance.

The first lifecycle increment stores one private JSON object (at most32 KiB) per
origin, with an immutable meeting flag and database-derived payload digest. It
does not validate the complete Calendar payload yet; that belongs to the next
server boundary. There is no browser access. Backend UPDATE privileges apply
only to synchronization fields, never the event key, payload or request kind.
The origin FK preserves ownership through the scoped origin join; getters do
not expose the private payload to the UI. Account erasure follows the existing
owner→origin cascade; rollback retains all history and revokes column ACLs too.

Each automatic round permits at most10 leases, including workers lost without
completion. A claim stores attempted=true before leaving the transaction. A
changed binding revision permits only reconciliation of a prior attempted
creation; insert_allowed is false unless the original/explicitly resumed
revision matches and remote_known is false. Completion requires the exact
current lease binding revision. Remote-known uses a sticky OR and preserves its
ETag across transient failures. Pending conferences exhaust into a fixed failure
instead of polling indefinitely. Explicit retry compares the original attempt
revision, refuses an unexpired worker, increments the revision, resets only the
round counter and captures the same active account's current binding revision.
Succeeded, foreign, deleted and definitively failed conference operations cannot
be retried through this creation RPC. A separate future conference operation is
required for a new definitive retry request. These RPCs have no live consumer.

### Canonical payload and provider ownership markers

The next boundary validates a narrow canonical private payload: summary,
description, location, explicit start/end, all-day, existing recurrence modes,
attendees (email/display name only) and meeting flag. Timed values require an
explicit offset and normalize once to UTC; all-day values are validated date-only
strings with an exclusive end. The consumer later converts existing UI inputs
before this boundary. No default/current time, body-supplied owner/account/calendar,
remote ID, conference request, extended property or invitation control is accepted.
Validate controls, lengths, duplicate attendees, at most100 attendees and16KiB
canonical UTF-8 JSON (within the32KiB JSONB storage cap). Copy/freeze every level.
Use conservative ASCII dot-atom emails (local part≤64; DNS labels≤63, no empty
labels or boundary hyphens). The following provider adapter must preserve the
existing application's fixed America/Sao_Paulo recurrence timezone; normalized
UTC instants do not authorize a new timezone or change the expansion of a series.

Server-only provider markers are two domain-separated HMAC-SHA256 values derived
from the existing encryption secret under an independent marker key domain. Do
not change the encryption key or expose it, credentials, owner UUIDs, titles or
emails in markers. Sign the original immutable scoped origin/revision/calendar,
stable event/conference IDs, persisted payload digest and meeting flag. Missing
configuration fails closed with a fixed error. Verify both private properties
with constant-time comparison after reading the exact original event/calendar;
no ID/409/unsigned property alone establishes origin. Marker verification is not
credential selection or authorization; the scoped runtime/activity check remains
mandatory. These helpers install no provider call or live consumer. Google permits
44-character keys and1024-character values; both properties use short keys and
64-character opaque values. Official extended-properties reference checked2026-10-13:
https://developers.google.com/workspace/calendar/api/guides/extended-properties

Official references checked2026-10-13:
https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
https://developers.google.com/workspace/calendar/api/v3/reference/events
