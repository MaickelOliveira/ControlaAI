# Permanent Google workspace activation

Activation is recorded privately per owner in the same transaction as a successful
scoped binding save or explicit legacy assignment. OAuth initiation, rejected CAS,
consent cancellation and migration never activate an owner. Unlinking/reconnecting
cannot clear or rewrite the activation. Original legacy ciphertext stays intact.

All legacy credential entry points must check the strict activation RPC before
credential reads and before each provider effect. Missing/unavailable storage fails
closed. The database additionally blocks old token writes, including delayed
callbacks/refresh, under owner locks. It cannot retract an already in-flight network
request; its eventual credential write is refused after cutover. Public APIs never
expose the table or provider identity. Account erasure keeps its existing cascade.

Install no live consumer until event services, settings and recovery workers are
complete. Apply reviewed migrations before application cutover. A recovery release
must retain this boundary; returning to a pre-boundary global release after any
activation is unsafe. The preservation rollback deliberately retains the guard.

Disposable PostgreSQL tests cover no inferred backfill, failed/successful save,
owner isolation, old write denial, unlink/reconnect stickiness and rollback; no real
credentials, provider requests or production migration are used in these tests.
