# Explicit confirmation of a changed Google event

An ETag conflict stops all writes. Only a human confirmation with the original full synchronization revision can apply an update or cancellation over a freshly verified Google event. The service reads the original calendar/event, verifies private ownership markers and binding before/after the read, then submits the fresh ETag to the final atomic compare-and-set. Browser inputs contain no provider identifiers, ETag or credentials.

SQL21 stores immutable consent and resets the SAME operation, command identity and payload. It never changes the original expected_etag column. Private command metadata uses the latest acknowledged ETag effective from its reset attempt onward; subsequent SDK PATCH/DELETE still uses If-Match. Another external edit requires another human confirmation. Conference commands are excluded and retain their original request identity.

The same confirmation UUID and original revision replay after worker progress or connection removal with no provider call or round reset. Wrong owner/company/revision, inactive owners, archived companies, foreign provider events and replacement bindings fail closed. No transaction spans a network call. SQL rollback disables new confirmation endpoints but retains history and effective confirmed ETags for already acknowledged work.

Validation: disposable PostgreSQL with fictitious accounts; metadata/credential preservation, ACL/RLS, frozen input, rollback, update/delete, exact replay, scoped denial, malformed ETag and atomic failure. No live calendar operation.
