# Private local partial-mutation replay

SQL19 stores the canonical full desired local payload. WhatsApp can send a partial
edit. Rebuilding its missing fields from a later edited row would falsely conflict
on response-loss replay. SQL22 exposes one readonly backend-only invoker getter
for exact owned scope/event/mutation UUID/original nullable full token. It returns
only original payload/metadata or null, under active-owner and visible-row locks.
Changed original expectation or scope conflicts. A later public edit, cancellation
or worker revision does not change the immutable receipt returned to the server.

Consumers reconstruct the repeated partial patch from this original input, then
SQL19 validates the exact same receipt and acknowledges without rewriting current
local work. No source/owner/provider IDs, credentials/configuration, Google origin
inference or provider authority are returned. This helper changes no row or lease.
Rollback closes its ACL only, preserving every receipt/history byte. Tests use a
disposable PostgreSQL instance with fictitious records and no network/provider.

Verification: RED missing RPC42883; GREEN23 disposable PostgreSQL assertions for
partial replay after later edits/cancellation, original nullable/versioned tokens,
scopes/access/ACLs, no mutation and history-preserving rollback.
