# Spec: google-settings

Module `google-settings` depends on scoped authorization and immutable event
provenance. This increment is dormant server code; no route/UI, provider consent,
real migration, legacy assignment, revocation, or integration cutover is installed.

## Server contract

`GoogleWorkspace` is supplied only by verified request/participant context. Its
owner/mode/company UUID tuple is captured before any await. Reject extra workspace
fields, malformed tuples, trusted scan contexts, arbitrary request/model identity,
and any cross-workspace expectation. The workspace digest is a SHA-256 correlation
key including the authenticated owner; it is not authentication or a credential.

`WorkspaceView` contains `{mode, companyId, workspaceKey}`.
`ExpectedSettings` contains only `{workspaceKey, expectedBindingVersion}`. Revisions
are canonical decimal strings bounded by signed bigint; absent binding uses `"0"`.
`GoogleSettings` contains `{workspace, activated, connected, bindingVersion,
selectedCalendar: {id,name}|null, legacy:{exists,assigned,assignedHere}}`.
All DTOs and nested entries/arrays are freshly allowlisted and frozen. Calendar
IDs are necessary public selector values; binding/grant IDs, provider subject,
credentials, client fingerprints, SDK instances and diagnostics are never DTOs.

- `googleSettingsWorkspaceView(scope)` creates the opaque correlation view.
- `loadGoogleSettings(scope)` reads private binding/legacy metadata and the sticky
  owner activation flag without provider/configuration/credential lookup. It
  rereads binding identity/revision/tombstone before returning. `connected` means
  an active local binding, not a guarantee that Google will accept its token.
  A binding/legacy assignment without activation is inconsistent private storage.
- `assertGoogleSettingsExpected(scope, input)` is a private authorization-start /
  explicit-legacy boundary guard. Its returned binding must never be serialized.
  A zero expectation is valid only for an absent binding. Final OAuth/legacy CAS
  still independently checks the captured revision and verified provider identity.
- `listGoogleSettingsCalendars(scope, expected)` returns `{workspace,
  bindingVersion, selectedCalendarId, calendars:[{id,name,primary}]}` through the
  existing scoped credential runtime. It never consults a global credential.
- `selectGoogleSettingsCalendar(scope, {workspaceKey,expectedBindingVersion,
  calendarId})` verifies the exact calendar with the provider, then commits the
  existing private binding-selection CAS. `primary` requires the provider's true
  primary flag and is stored as its resolved stable ID. Return confirmed settings.
- `unlinkGoogleSettings(scope, expected)` uses only the binding tombstone CAS and
  returns confirmed disconnected settings. It makes no provider call, revokes no
  authorization, removes no grant/legacy bytes/history, and preserves calendar
  metadata, identity and the exact incremented revision.

Lists request writer access, validate every provider entry, discard deleted or
read-only entries, and reject malformed fields, duplicate IDs/primary calendars,
looping page tokens or oversized pages. Bound pagination to twenty 250-item pages,
tokens to 2048 characters, IDs to 1024, and names to 512. No partial list is returned
on failure/exhaustion. Every provider request has a 15-second timeout and disabled
HTTP retry. Recheck the exact original active binding before each provider request
and after listing/selection; no database transaction spans Google I/O. Local CAS
closes the selection/unlink race. Validate mutation response owner/identity,
unchanged grant, exact next revision, calendar/tombstone state, and final status.

Errors are fixed `GOOGLE_SETTINGS_*` input/workspace/conflict/not-connected/storage/
provider codes, with no cause or raw diagnostics. Preserve safe callback failures
even when the credential runtime sanitizes callback exceptions. Future routes must
map these codes and set `Cache-Control: private, no-store`.

## Sticky activation dependency

`loadGoogleOwnerActivation(authenticatedOwnerId)` calls private backend RPC
`zelo_google_owner_activated` with a captured canonical owner UUID. Accept only a
strict boolean. Storage/transport failure is `GOOGLE_ACTIVATION_STORAGE_UNAVAILABLE`;
malformed owner/response is `GOOGLE_ACTIVATION_STORAGE_INVALID`. Missing/unavailable
storage is never interpreted as `false` or permission for legacy fallback.

The separate activation migration must atomically and permanently activate an
owner on the first successful scoped binding save/explicit legacy assignment,
deny browser access and preserve activation through rollback. Starting/cancelling
OAuth alone does not activate. All live consumers and old credential writes must
honor the no-legacy-fallback boundary before a cutover is enabled. This server
increment does not activate anyone or change legacy behavior.

## Verification and remaining boundaries

Tests use the real Calendar SDK with only transport replaced and mocked private
DAL/runtime boundaries; all identities/provider data are fictitious. Cover owner/
personal/company separation, exact bigint revisions, stale reads/requests, immutable
input snapshots, bounded/malformed provider pages, primary alias verification,
read-only/deleted calendars, selection/unlink races, shared-grant preservation,
corrupted mutation results, provider-free status/unlink, and safe errors.

RED: focused tests failed for missing activation/service modules. A later RED
regression exposed same-revision selected-calendar drift between mutation result
and status; final status now checks the committed calendar as well.

Focused: `env -i PATH="$PATH" TMPDIR=/private/tmp node_modules/.bin/vitest run
src/lib/google-owner-activation.test.ts src/lib/google-settings-service.test.ts`.
Lint these four files. Parent integration runs type/build/full checks and independent
review before publication. No dependencies change.

Next increments install explicit legacy destination/OAuth expected-revision guards,
scoped authenticated/CSRF-protected routes and stale-response-safe UI, then migrate
every web/WhatsApp/job consumer before reviewed migrations and full activation.
## Confirmed connect and legacy actions

Connect requires the displayed workspace digest, exact decimal binding revision,
and one supported locale. The persistent issuer atomically rechecks the revision;
no stale request can silently replace a newer connection. Only the HTTP boundary
supplies the validated client session.

Legacy assignment additionally requires `confirmTarget: true`. Its adapter compares
the confirmed target revision before decrypting or verifying an old credential,
then retains the original source/grant/binding compare-and-swap. It returns fresh
public settings only if the committed connection and selected calendar still match.
Neither action accepts owner, mode, company, provider subject or grant identifiers
from the submitted body. Errors use an exact fixed allowlist and carry no cause.

## Client controller and UI

The settings UI requires a server-confirmed `{mode,companyId,workspaceKey,label}`
target delivered through a narrow client context. An absent target disables all
Google actions without disrupting other settings. Company names are display-only;
the owner-inclusive digest and UUID tuple correlate status with the open space.
No email or account identity is invented. The existing logo, privacy links and
Portuguese/Brazil, Portuguese/Portugal and Spanish wording remain available.

The pure controller resets synchronously on target change/logout, aborts previous
requests and assigns a generation to every load/action. All success, failure and
finally handlers check the generation, abort signal and exact target. Wrong-space
responses never supply calendars or a connected UI. An expired session clears all
confirmed connection state; page exit and component cleanup abort pending work.
Single-flight actions block rapid selections. The selector stays at its confirmed
value until an exact next-revision response confirms the requested calendar.
Failures retain confirmed state; a 409 reloads authoritative status/calendar data.
All response DTOs are validated and copied; raw server/provider diagnostics are
never put into client state or notifications.

Connect/reconnect uses POST with scoped expected revision and locale, then only
navigates to HTTPS `accounts.google.com/o/oauth2/v2/auth`, without userinfo, custom
port or fragment. Legacy assignment requires a separate human confirmation naming
the currently displayed space; its captured key must still match at submission.
No default personal/company assignment occurs. Local disconnect changes UI only
after a confirmed response. Client tests use fake fetch and delayed promises,
covering workspace changes, logout, rapid selection, failures, stale conflicts,
legacy confirmation and rejected authorization destinations. These UI changes are
not deployed until server targets and the complete consumer cutover are ready.
