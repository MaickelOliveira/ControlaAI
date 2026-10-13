# Google workspace isolation

## Capability map and build order

| Module | Responsibility | Depends on |
| --- | --- | --- |
| google-authorization | Authenticated workspace policy; private grants/bindings; persistent OAuth state; verified provider identity; safe refresh and unassigned legacy credentials. | — |
| google-events | Event/Meet provenance, authorization before provider calls, retry identity, synchronization failures and local metadata updates without Calendar calls. | google-authorization |
| google-settings | Scoped API/UI, explicit legacy assignment, selected calendar, local unlinking and protection from stale responses after workspace changes. | google-authorization, google-events |

Build order: google-authorization → google-events → google-settings. Do not enable a partial integration while any consumer can still select the owner's global Google credential. Existing credentials and history must be preserved.

## Objective and first increment

Each personal workspace and each company uses its own Google binding. Tenant and company UUIDs define identity; equal or renamed company names never influence selection. First implement and independently test a pure workspace policy before private persistence or OAuth changes. This initial helper is not wired into production yet.

`GoogleWorkspace` contains `userId`, `mode` and `companyId`. Personal always uses a null company, regardless of the remembered company in the verified context. Business requires an active company UUID, matching owner and allowed business access. Missing/trusted global context, invalid identities/mode/permissions and owner mismatch fail closed. Valid UUIDs are canonicalized; objects are not mutated.

Provider callers must obtain this policy input from an authenticated request/WhatsApp context or the authorized event record, never from model output or arbitrary request body. `googleWorkspaceFromContext` returns the validated tuple, `googleWorkspaceKey` creates a stable key including the owner, and `assertGoogleWorkspaceMatch` rejects a stored reference from another owner, mode or company. These are boundary helpers, not authorization for arbitrary user-supplied contexts.

## Subsequent authorization contract

Private storage separates a stable Google grant from each workspace's binding/calendar choice. Composite ownership checks and RLS/ACL protect every reference. Verify the provider's stable `sub`, rather than identifying the account by email. OAuth state binds a single-use expiring nonce to the authenticated session and immutable target workspace; another process can consume it atomically. Switching mode during authorization does not change its target. Keep existing scopes.

Refresh only grant token fields under concurrency/version control; never restore an old calendar choice or removed binding. Local unlinking must not revoke Google tokens used by other workspaces. Google's documented project-level revocation can invalidate other access/refresh tokens. Legacy encrypted bytes remain preserved and unassigned until explicit selection; the remembered/default company does not prove their original workspace. Event provenance is a separate module and is not assigned implicitly along with a credential.

## Persistent OAuth state increment

Prepare `google_workspace.oauth_states` and server-only invoker RPCs `zelo_google_state_issue` and `zelo_google_state_consume`; do not change the live OAuth routes yet. The row stores SHA-256 hashes of a random state, OpenID nonce, authenticated session identifier and OAuth client ID. No session cookie, OAuth code, token or client secret is stored. It captures the validated owner/mode/company and locale; expiry is fixed by the database at ten minutes. At most twenty unexpired starts per owner are accepted under a transaction lock. Expired cleanup is bounded.

Issue rejects an invalid tuple, another owner's company or an archived company. Consume atomically removes exactly one state only when its owner, session hash and client fingerprint match. A mismatched browser/client cannot consume it. Expired states are removed without returning authorization. An archived/deleted target returns no authorization; another company or current UI mode is never substituted. Concurrent callbacks in different processes yield at most one result. Locale and nonce hash are returned with the captured tuple. Personal has no company. Names, active-mode changes and renames cannot alter the target.

RLS is enabled with no browser policy; schema, table and function ACLs deny PUBLIC, anon and authenticated. Only the existing trusted backend service principal receives explicit access. RPCs use an explicit `pg_catalog` search path and invoker rights; they create no new privileged role or membership. The rollback refuses to discard unexpired states and leaves legacy Google ciphertext and other tables untouched. Disposable PostgreSQL tests verify behavior and ACLs using fictitious data, including cross-process consumption and rollback preservation.

## Commands, structure and style

Next/TypeScript, Vitest, PostgreSQL and the existing Google libraries; no additional dependencies. Pure policy and adjacent `*.test.ts` live in `src/lib`; later private migrations/rollback and disposable fixtures live under `supabase/`. Validate unknown runtime input explicitly, use named tuple types and return fresh immutable data. API errors use fixed codes and never include tokens, OAuth codes or raw provider payloads.

Commands: `npx vitest run src/lib/google-workspace-policy.test.ts`; `npm test -- --run`; `npm run build`; `npm run lint`; `node scripts/check-secrets.mjs`. Review each increment independently before merging. Provider transports and IDs in tests are fictitious; no real invitation, credential revocation or customer data is used as a fixture.

## Private grant/binding storage increment

Migration `20261013030000_google_bindings.sql` depends on the private schema from
`20261013010000_google_oauth_state.sql`. It adds no production consumer and must
not be applied as a standalone activation. Existing `google_tokens`, event rows,
configuration and OAuth routes are untouched. There is no implicit legacy copy or
assignment. Explicit assignment of an old connection remains a later operation
after identity verification; its original ciphertext must remain preserved.

`google_workspace.grants` stores one stable ID per owner, verified Google subject
and OAuth-client fingerprint. Only encrypted access/refresh envelopes are stored.
`bindings` stores each exact personal/company tuple, selected calendar, a stable
ID, revision and unlink timestamp. Composite foreign keys enforce ownership even
if company names coincide. There are no browser policies or grants. The existing
backend service principal receives select/insert/update and explicit invoker RPC
execution, without delete/truncate or a new privileged role. The disposable test
also applies the migration using a non-superuser with permissive default grants.

Storage RPCs use these rules:

- `binding_get` returns only binding metadata, including the revision/tombstone
  required by a future authorization flow; it returns no Google identity or token.
- `grant_for_identity` is an internal credential lookup **only after** verifying
  Google's signed subject and the OAuth client. Its encrypted response must never
  be serialized to the browser or used as authorization for an event operation.
  Returning an unlinked owner's existing grant allows a later explicit consent
  flow to safely reuse a known refresh token for the same verified identity/client.
- `binding_save` atomically compares the previously captured grant and binding
  versions. Zero means absent. Capture these before the corresponding external
  operation; do not read a newer revision to silently retry a conflicting result.
  A callback cannot restore an unlinked binding using its older revision, and a
  stale authorization cannot overwrite a newer token refresh. A changed identity
  or OAuth client resets the selected calendar to `primary`; the same identity
  retains that workspace's calendar. Other bindings are never updated.
- `binding_select_calendar` and `binding_unlink` compare the binding revision.
  Unlink changes only that row; no remote revocation or credential deletion occurs.
- `grant_refresh` requires an active binding to the exact owner/grant/client and
  compares the grant version. It changes only token fields/expiry/version. A lost
  race returns false; it never changes calendars or recreates a binding. The
  future provider caller must reread/revalidate instead of using an unpersisted
  stale refresh result.

Owner then company locks follow the existing archive lock order. Reads share
locks; mutations serialize per owner for the short storage transaction. No
provider/network call belongs inside this lock. Every RPC checks company activity
again; archiving one company leaves other spaces usable. RPC authorization trusts
only the backend principal; a future server adapter must resolve the authenticated
workspace and verify Google identity, encrypt tokens and hide raw database errors.
The envelope check is structural and does not replace authenticated encryption.

The rollback revokes the new table/function access while preserving every grant,
binding revision/tombstone and calendar, plus legacy rows and live OAuth states.
It deliberately does not drop tables. Disable consumers first; re-enabling after
rollback requires a reviewed forward access migration, not replaying CREATE TABLE.

Runtime verification: `python3 supabase/tests/run-google-bindings.py --bin-dir
<local PostgreSQL bin>` starts a disposable Unix-socket-only cluster with fictitious
data. `--baseline-no-bindings` proves the missing capability before migration.
Tests cover owner/mode/company isolation, same-identity explicit sharing, malformed
results, stale callbacks, identity/client changes, cross-owner FKs, independent
calendars, real multi-process refresh/consent/unlink/archive races, restrictive
ACL/RLS and preservation through rollback. No customer database or Google service
is contacted. This suite is run locally; the existing CI does not yet provision
PostgreSQL for these standalone fixtures.

Still required before functional isolation: server identity verification and
credential adapter; explicit single-target legacy assignment; fixed event/Meet
provenance and idempotence; scoped Settings/APIs/WhatsApp consumers; private
migrations and complete activation review. Keep the legacy integration behavior
until the complete replacement is ready; do not claim this storage increment
already separates the live Google connections.

## First-increment acceptance criteria

- Personal ignores remembered/archived company identity and returns null; denied personal access is rejected.
- Business requires a valid active company and allowed access, with no global/default fallback.
- Another owner, invalid runtime objects/UUIDs/mode/flags and context without an authenticated owner are rejected.
- Keys differ across owners, modes and companies, remain stable for canonical UUIDs, and contain no company names.
- Stored event/binding reference must match every workspace field; invalid personal/business tuples are rejected even when compared with themselves.
- Pure operations do not mutate inputs or invoke network/storage. Production OAuth and connections remain unchanged until all dependent modules pass validation.

## Boundaries and rollout

Always validate workspace before effects, preserve credentials/history and test concurrency/ownership before private storage activation. Never choose a grant by company name, copy legacy bindings implicitly, log secrets, broaden OAuth scopes or revoke a global authorization when unlinking one workspace. Actual Google consent/credential actions belong to the account holder in the UI. Evaluate any production migration/security action under the applicable policy after concrete code and tests are ready.

## Primary references

- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server): state, offline access, refresh and project-level revocation.
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect): verified subject identity and nonce.
- [Calendar event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert): stable event identity for the later events module.
