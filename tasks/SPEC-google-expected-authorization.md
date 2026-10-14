# Confirmed settings revision at Google consent initiation

The authenticated server workspace and confirmed binding revision must match in
the transaction that issues persistent OAuth state. A preliminary service read is
not enough: another request may unlink/select/reconnect between that read and the
issuer. This backend-only invoker wrapper checks the expected revision under the
existing owner/company locks, then invokes the established random hashed-state
issuer in the same transaction. A stale expectation stores no state. Starting
consent never activates an owner or changes legacy credentials. Callback's original
scope/session/client/revision/nonce checks remain unchanged; no legacy fallback.

Server adapters and connect/legacy/callback routes follow in reviewed slices.
Use exact decimal revisions; body workspace keys remain stale-view checks and do
not select owner/company. Preserve states/credentials through rollback, close only
the new issuer. Real disposable PostgreSQL checks cover ACLs, strict expectations,
original snapshots and concurrent save/issue. No production migration or Google
consent is performed during these tests.
