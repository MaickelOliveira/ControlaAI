# Workspace event consumer service

New Agenda and Meets consumers use authenticated exact GoogleWorkspace only.
A stable caller UUID is mandatory for each creation intention. No new flow calls
the old global Google helper, before or after activation. A plain appointment with
no scoped binding saves one local receipt. Conferences/Meets require an explicitly
selected scoped connection. An unowned local/legacy event never infers a provider
origin when adding a conference.

Read/create slice: server-only service maps one SQL15 snapshot per list/get to an
allowlisted public DTO with five required camelCase synchronization fields. The
base Appointment/Meet types carry optional fields for existing local metadata
consumers; no private credentials/origin/lease/ETag/journal data is exposed.
Historical calendar references are display data only. Brazil all-day dates retain
exclusive ends; omitted timed ends default to one hour; recurrence stays canonical.
All scope/input/source/UUID values are captured before asynchronous work.

An existing linked creation is replay-validated against its original input without
configuration/provider effects. An existing local receipt stays local after later
connection and preserves edits/cancellation. New scoped intent is saved atomically
before the bounded worker; inability to finish leaves the persisted pending state
visible for recovery. Meet+Appointment share the same logical UUID through SQL10.
Phone metadata is kept locally for Meets and never appears among provider guests.

Next independent slice: update/cancel/add conference/explicit retry use expected
snapshot version and mutation UUID; local minutes/status/reminders make no Google
request. Controlled updates preserve untouched guests/conference. Current scoped
commands retain original provenance and conditional ETag guards.

Read/create verification: RED missing service module; GREEN25 focused tests and
lint. Full build/types and browser/runtime integration belong to parent cutover.

Mutation slice implements update/cancel/add conference/retry with stable UUID and
original full revision. Replay lookup comes before stale-current conflict; partial
controlled replay uses original journal/receipt payload, never rebases to latest
fields. New controlled edits use exact SQL20 private snapshot and SQL19 atomic
comparison. Guests/conference/local Meet phones are preserved. Local/legacy
controlled/cancel work remains local and private origins never fall back locally.
Minutes/reminders/done use strict local metadata only; combined metadata and
controlled patches are rejected to keep each intention atomic. Internal metadata
calls may omit expectation and receive a new local-only UUID; Web/Wpp controls
provide the original confirmed UUID/revision. Definitive CONFERENCE_FAILED alone
reserves new conference; ambiguous failures resume original operation/round.
Parent handles separately confirmed external-ETag conflict reconciliation.

Verification: RED missing mutation methods/private replay getter and all-day
legacy regression, GREEN76 service/user DAL tests plus lint; native SQL19/20/22
cover durable repeated intention, scope, full-token races and original values.

Web read/create/edit/cancel slice uses reviewed googleEventsHttp for authenticated
client scope, mutation same-origin and workspace correlation. Strict body/query
allowlists reject owner/provider/source authority and omitted UUID/expectation.
Agenda/Meets POST use clientMutationId as logical UUID and force source web; Meets
uses ISO startAt/endAt. PATCH is flattened patch plus original UUID/version.
DELETE returns cancellation DTO so pending/failed remote cancellation stays visible.
GET by ID retains scoped history. No route uses old global create/update/delete.
RED old routes/global helper trap; GREEN13 HTTP/route tests plus lint.
