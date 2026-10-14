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

The scoped start broker requires a confirmed exact decimal binding revision before
configuration lookup and always uses the expected issuer. Its caller supplies the
authenticated session and target; neither body mode/company nor current callback
page is authority. Only a fixed stale-initiation code survives to the HTTP boundary;
all raw diagnostics remain hidden. Low-level compatibility state tests may still
exercise the original issuer directly; no live scoped start can omit its revision.
