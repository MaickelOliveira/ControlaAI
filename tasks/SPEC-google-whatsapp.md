# Google WhatsApp consumers

Prepared for the complete Google cutover only. Every new agenda/Meet effect uses
the service's scoped binding. An appointment without a scoped binding remains
local with a stable logical UUID; a requested Meet requires a scoped connection.
No text, model output, global user mode or legacy provider ID chooses a workspace.

The verified participant context established by `withWhatsAppCompany` is the only
scope authority. An intent snapshots its canonical owner/mode/company, server UUID,
operation, record ID, exact nullable Google revision and bounded immutable payload.
Persist that intent before attempting the service. Replay checks the current
participant context again and retains the original UUID/payload/revision after an
ambiguous failure. A changed owner/mode/company or attempted payload requires a new
confirmed request; the stored snapshot never grants authority or gets rebased.
Control intents require an explicit revision snapshot, including null for local
or legacy records; missing metadata never invents historical Google provenance.

Authenticated WABA/Evolution intake carries the original provider message ID for
text, audio and media. Missing/invalid IDs are ignored rather than replaced with
random or model-derived identifiers. The server derives a UUIDv8 from a SHA-256
namespace containing provider, verified owner/workspace, original message ID and
stable item ordinal (0–29), excluding payload/operation/text. Concurrent copies and
payload drift therefore retain the same identity and must meet the service's
idempotence/conflict guard. Company-choice questions preserve the original envelope
metadata; a later selection reply never becomes the original creation identity.

`commitGoogleWhatsAppIntents` persists a bounded batch before any service effect,
then stores only mutation/record IDs after each confirmed result. Replay performs
an authorized service read for acknowledged items and repeats the exact original
operation for unacknowledged items. Both initial-save and acknowledgement-save
failures retain idempotent identities. Participant scope is rechecked after waits
and before every effect; it never rewrites an old intent into a new workspace.
The temporary `google_agenda_commit` pending record expires after 24 hours and
is cleared only after the caller's acknowledgement is sent. This record does not
claim exactly-once notification delivery or replace the service's SQL receipt.

The public five sync fields describe confirmation/pending state. A saved meeting
with a pending conference says **Preparando link** and is available in Agenda.
No empty or unconfirmed Meet link becomes an invitation or a claim of success.
This increment adds no later WhatsApp invitation/notification automation: reliable
future delivery would require its own journal and deduplication contract. Existing
minutes/reminders remain metadata operations and must acquire no Google credentials.

The consumer factory dispatches creation/control only to the approved scoped
service, with the fixed `whatsapp` source, stable UUID and original exact revision.
Confirmed replay uses scoped reads, and list/range/keyword consumers share the same
authorized read contract. Read completion revalidates the participant context.
Confirmation text distinguishes saved Zelo rows from Google work still pending or
failed. Only a valid Meet URL with succeeded sync state and no conference pending
can be offered as a newly confirmed invitation/link.

The actual handler's agenda reads, edits, cancellations, completion and existing
event Meet command use the consumer. Selection prompts retain the originally
shown revision, including while asking for an edit patch. A changed current read
never upgrades that revision. An ambiguous failure leaves its frozen commit;
only an explicit retry repeats it. Explanations/unrecognized replies do not call
Google. Cancelling a retry stops that attempt and does not undo saved records.

Tests use fictitious participants, contexts, IDs and services only. No WhatsApp,
Google, invitation or customer storage operation is used for verification.
