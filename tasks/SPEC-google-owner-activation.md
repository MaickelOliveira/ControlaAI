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

The application legacy boundary now checks before credential load/save, OAuth
start/exchange/refresh, each Calendar effect and legacy identity/list/revoke calls.
Only strict false permits compatibility; unavailable metadata fails closed with
fixed errors. Issued old SDK clients contain no refresh token/handler and cannot
renew later outside the guard. A dedicated legacy transport interceptor rechecks
activation and overrides SDK OAuth retry defaults with retryfalse/retry0/timeout15s;
it never modifies the scoped OAuth clients. A real SDK/fake transport503 test proves
one request for exchange, refresh and revoke even if activation occurs during it.
Calendar writes and list calls have timeout15s/retryfalse. Deploy
these callers only after the reviewed activation RPC exists. New settings/consumers
must route activated owners exclusively through scoped storage/runtime.
