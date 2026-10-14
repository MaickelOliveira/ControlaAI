# Google agenda web consumer

This client increment is prepared for the complete server cutover only. No server
record ownership is accepted from client DTOs or mutation UUIDs. Scope comes from
the authenticated request; the SSR workspace target is only UI correlation.

The public appointment snapshot contains nullable `googleSyncVersion`, exact
`v1:<creationAttempt>:<headVersion>:<commandAttempt>` decimal strings for linked
events, `googleSyncState`, fixed nullable failure code, `googleMeetPending` and
`googleCancellationPending`. Local/legacy versions are null and acquire no Google
provenance. Cancelled rows are visible only while Google cancellation remains
pending/failed. Meet URLs must be valid Google Meet HTTPS URLs before becoming links.

Each form/action owns an immutable in-memory intent. POST creation keeps the same
UUID/payload until a valid 201 confirmation; edits/deletion/retry use stable request
UUIDs and the captured exact Google version. Changed attempted payloads require a
new explicit form intent. Lost responses retain the original intent. Confirmed rows
are upserted by ID to avoid duplicates after reload/retry. Ordinary edits never
send `withMeet:false` as a conference removal; completion is local metadata only.
All PATCH/DELETE/retry bodies carry `clientMutationId` and the captured snapshot as
`expectedGoogleSyncVersion`, including explicit null for local/legacy records.
Completion carries the same required expectation/identity while its service action
remains local metadata; lost acknowledgements reuse the original UUID and payload.
Conflict 409 reloads confirmed records and retains the form/intent rather than
upgrading its version or overwriting another change. Expired sessions and SSR
target changes clear local state, abort pending requests and invalidate all success,
failure/finally handlers. UI actions are single-flight. No raw diagnostics enter
client state.

All controller requests include `X-Zelo-Workspace-Key` captured from the SSR target,
including metadata-only operations and Google connection status. Successful
responses must echo that exact key before their body is decoded/accepted. The
server compares this correlation hint with authenticated scope; it cannot select
another workspace. A changed key or denied scope clears visible records and blocks
mutations without adopting the response key or rebasing an attempted intent.
Recovery reload uses the original target/key; a real target change requires a new
SSR snapshot and invalidates the old controller generation.

`googleEventsHttp` resolves only a client session's authenticated company context,
rejects absent/trusted/denied contexts and passes a frozen workspace to the public
DTO service. All writes, including metadata-only completion, require matching
correlation and the configured public same-origin check in production. Legacy
GET consumers may omit correlation; a provided key must match. Successful responses
echo the server key with `Cache-Control: private, no-store`. Settings HTTP also
accepts optional matching correlation and echoes it; settings writes retain their
mandatory body workspace/binding expectations. No header or body can pick a scope.

Routes use `googleEventsQuery` with their exact key list (default empty) and
`googleEventsBody` with allowlisted keys and an independently declared required
subset. Bodies are limited to 32 KiB of actual streamed bytes, decoded with strict
UTF-8, projected to only present keys and frozen. Field-value validation belongs to
the scoped service. Errors normalize an exact code allowlist to fixed public
messages/statuses; unknown diagnostics and internal causes are never returned.

Retry is explicit POST `/api/agenda/[id]/retry` with version/request UUID.
DELETE accepts a current appointment snapshot or an acknowledged `{ok:true}` then
reloads pending cancellation snapshots. The UI must preserve cancelled pending
records in a separate recovery list; no empty Meet link is opened.

Controller tests use fake fetch, fictitious UUIDs and delayed responses. A separate
integration test dispatches browser requests into the actual Agenda/status route
handlers and HTTP guards, mocking only authenticated scope and private service
calls. It proves creation, editing, completion, cancellation, retry, lost responses,
exact big integer/null versions, stale workspace denial and conflict reload without
rebasing. Parent integration validates types/build and reviews before deploy.
