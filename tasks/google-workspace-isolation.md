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
