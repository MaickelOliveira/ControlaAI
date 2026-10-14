# Private controlled event snapshot

An appointment public row does not contain provider guests. Creation guests can be
outdated after a later update; the current conference command has no ordinary
payload. A subsequent title/time edit must preserve the latest desired guests.

SQL20 adds one backend-only invoker readonly RPC taking authenticated scope,
logical event UUID and the original full v1 token. The owner write lock and SQL19
snapshot helper verify exact current revision/local visibility. Private linkage
must match original nonlegacy scope; canceled/finished local rows cannot authorize
controlled editing. Latest update payload is bounded to the captured head revision,
never a newly adopted head. Public current controlled values plus those guests
form a canonical payload. Linked Meet local attendee names/phones are returned
separately, matching current desired provider guests. No immutable creation input
is changed. No credentials, provider IDs, configuration or effect authority leave
this private server read; consumers still use SQL19 prepare_expected and SDK guards.

The RPC does not claim leases, mutate local/journal state or adopt legacy origins.
Rollback closes only this readonly helper and preserves all history. Tests use
fictitious local records on disposable PostgreSQL, including attendee update then
conference, same-head attempt changes, scopes, inactive/archive checks and ACLs.

Verification: RED missing RPC42883; GREEN35 disposable PostgreSQL assertions for
guest updates followed by conference, Meet phone separation, full-token conflicts,
readonly byte preservation, scopes/access/ACLs and preserving rollback.
