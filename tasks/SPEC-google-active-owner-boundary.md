# Google: active-owner boundary

Private workspace and old global transport guards must recheck the actual platform
access rule, `users.status='active'`. An owner selected by a background snapshot can
be deactivated before its worker reaches Google. The earlier shared workspace lock
checked owner existence/company activity only, so selection was insufficient.

Add migration17 replacing the same two invoker-only functions and signatures:
`google_workspace.lock_workspace` filters the locked owner row to active;
`zelo_google_owner_activated` delegates to that owner lock before reading activation.
Keep owner→company lock order, exact scope, existing fixed errors/search path/ACLs.
Do not require sticky activation in the shared core: an active owner's first OAuth
must still be possible. Event consumers and recovery separately require cutover.

The change preserves every credential, activation, event, lease and public row.
Inactive/trial/unknown owners are denied before credential/provider work through
existing scoped getters, local activity and leased preflight; the old global
activation getter also denies, never returning a false fallback on inactive access.
An already authorized in-flight request can precede deactivation, but its later
completion/next request cannot pass the new boundary. Reactivation retains history.

Rollback retains this access boundary to avoid restoring an inactive owner's old
Google access. It does not close prior functions, erase rows or broaden permissions.
Use disposable PostgreSQL/fictitious statuses only; no actual user mutation.

Files: migration17, preserving rollback, adjacent disposable fixture and this spec.
Test with `python3 supabase/tests/run-google-active-owner-boundary.py`; baseline must
demonstrate the prior gap, then prove shared/global/scoped/creation/command activity,
claim/preflight/finish denial after batch selection, ACLs, active first consent,
unchanged bytes/reactivation and security-preserving rollback. Parent validates
actual SDK mock-preflight refusal (zero HTTP), full checks and independent review.

Verification: baseline proves the earlier inactive-owner preflight succeeds;
the replacement passes60 disposable PostgreSQL assertions for all three denied
statuses, both selected worker kinds, original/global/scoped/local gates, original
leases after reactivation, active first consent and security-preserving rollback.
