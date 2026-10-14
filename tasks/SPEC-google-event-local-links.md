# Google events: atomic local records

Module: google-events; depends on the published immutable origin/creation contracts
in `SPEC-google-events.md`. This increment has no live consumer or real database
activation. Existing users, credentials, appointments and Meets remain unchanged.

## Objective and trust boundary

The old Meet flow calls Google before separately saving Meet and agenda rows.
A process failure can leave a remote event without its local counterpart. A new
server-only transaction must reserve the original scoped intent/payload, create
one appointment and (for a Meet) one meeting, and record their private linkage
before any Google call. The server supplies the authenticated owner/space and a
new authorized logical UUID; a HTTP body or model cannot select these identities.

## Storage contract

- Append-only private `google_workspace.event_links` maps an origin/owner to its
  appointment and optional Meet. All local IDs equal the logical UUID. Composite
  owner FKs and unique references reject borrowed records. Browser access is denied;
  backend SELECT/INSERT only. Local-row deletion is restricted while linked:
  later consumers must preserve cancellation/history instead of physically deleting.
- New public rows explicitly set company_id and workspace_legacy=false. The getter
  verifies the origin and every mapped row have exactly that owner/space. Missing or
  unverified legacy records return no link; no historical record is adopted/backfilled.
- Immutable input metadata contains source (web/whatsapp) and local Meet attendees
  (name/phone/email, bounded). Only the separately canonicalized provider attendees
  from `google-event-payload.ts` may reach Google. No credentials enter either input.
- RPC `zelo_google_event_local_create` locks owner then company, captures the exact
  active binding/grant/client/revision and inserts all records in one transaction.
  Kind is appointment/meet; Meet requires withMeet=true, timed, non-recurring data.
  Provider fields start empty, and the Meet agenda title retains the existing 🎥 prefix.
  All-day exclusive dates are stored as Sao_Paulo midnight; timed canonical UTC
  instants stay unchanged. An error in either public insert rolls back everything.
- Identical repeated logical input returns the original link even after unlink or
  calendar change, without fetching credentials or overwriting edited local data.
  Different scope/kind/payload/source/local attendees conflicts. Existing unmapped
  origin or local UUID collisions are rejected, never converted to verified history.
- The getter/return is a private linkage DTO, not a provider authorization or a UI
  response. Later worker preflight must recheck active rows and the exact binding;
  completion must atomically publish only provider fields under the existing lease CAS.
  Both reject cancelled as well as missing/foreign local records before any effect;
  the private history getter itself may continue to read cancelled history.
- Rollback closes the new table/RPC access, preserving rows, keys, constraints,
  credentials and history. No SQL is applied to the customer's database in this slice.

## Verification and boundaries

Existing stack: PostgreSQL disposable Unix-socket fixture, Next/TypeScript/Vitest.
Commands: `python3 supabase/tests/run-google-event-local-links.py --baseline` must
fail for the missing RPC; then `python3 supabase/tests/run-google-event-local-links.py`
must pass with fictitious records, concurrent retries/collisions/unlink/archive,
partial-insert rollback, exact owner/space, all-day timezone, bigint revisions,
restrictive ACL/RLS, unchanged historical bytes and preserving rollback. Run
`npm test`, `npm run build`, `npx tsc --noEmit`, `npm run lint`,
`npm run security:secrets`, and the native lockfile audit before reviewed publication.
Style follows the adjacent invoker-only SQL with search_path=pg_catalog and fixed
error codes. No new dependency, invitation, account revocation or legacy inference.

## Following slices

1. Canonical server local-input/DAL adapter with captured context and strict DTOs.
2. Worker local preflight and atomic completion; conditional update/delete journal
   and explicit new conference retry only after an authorized user action.
3. Migrate web/WhatsApp/jobs and settings together; explicit per-owner activation
   preserves the legacy choice. Activated owners never fall back to global tokens.
   Account selection/Google consent belongs to the human in settings.
