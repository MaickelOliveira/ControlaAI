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

The public five sync fields describe confirmation/pending state. A saved meeting
with a pending conference says **Preparando link** and is available in Agenda.
No empty or unconfirmed Meet link becomes an invitation or a claim of success.
This increment adds no later WhatsApp invitation/notification automation: reliable
future delivery would require its own journal and deduplication contract. Existing
minutes/reminders remain metadata operations and must acquire no Google credentials.

Tests use fictitious participants, contexts, IDs and services only. No WhatsApp,
Google, invitation or customer storage operation is used for verification.
