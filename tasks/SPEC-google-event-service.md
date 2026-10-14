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
