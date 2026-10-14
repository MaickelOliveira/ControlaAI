# Atomic confirmed event mutations

SQL19 adds backend-only invoker wrappers for user-confirmed event mutations. The
same active-owner write lock captures local visibility and the entire SQL15 v1
revision before a new command or explicit creation/command retry. A stale snapshot
never adopts a newer journal head or worker attempt. All Google validation remains
in the existing command/creation functions, including original binding/provenance,
lease and conditional remote ETag guards.

An already stored command UUID replays its identical immutable kind/payload and
original expected head before comparing current revision. Explicit same-operation
retries use an immutable receipt UUID keyed by owner/workspace/event/original v1
revision and selected operation reference. A lost reply can replay the original
UUID/revision after worker advancement, while altered input/scope conflicts. No
new provider ID or conference identity is generated for an ambiguous retry.

Local mutation RPC locks exact visible owned rows, retaining personal legacy
visibility and archive checks. It permits strict metadata fields with a snapshot
comparison and canonical controlled edits/logical cancellation only when the row
has no private sync revision. Linked controlled fields/cancellation cannot fall
back to a public local write. Canceled linked rows cannot be reactivated through
metadata. No source/owner/company/provider fields are mutable. No global Google
connection, credentials or configuration are consulted. No history is deleted.

Receipt table uses RLS, owner composite FKs/cascades and SELECT/INSERT-only backend
privileges. New wrappers have fixed errors/search paths/ACLs. Rollback revokes the
new API and receipt privileges, preserving original journals/history/access.
Verification uses disposable PostgreSQL with fictitious records only.

Three explicit receipts cover distinct immutable intentions without altering the
provider journal: event_user_commands keeps each original full v1 token;
event_user_retries keeps one confirmed round reset and original target;
event_user_local_mutations keeps exact local payload/metadata/token. Receipt
replay never writes over a later local edit and never resets a retry twice.
Controlled local fallback is also denied when an original private origin is hidden
by legacy visibility. Current canceled rows cannot be reactivated through metadata.

Verification: RED missing wrapper42883, GREEN127 disposable PostgreSQL assertions,
including unchanged-head/stale-attempt refusal, original full-token replay,
concurrent retry, failed receipt insert rollback, local replay after newer edit,
ACL/RLS on all three tables and account erasure. No live provider/database used.

Server DAL captures exact scope/UUID/full token and canonical fields before await,
validates strict acknowledgments/allowlisted refs and removes diagnostics. New
confirmed command option uses prepare_expected; accepted operation replay validates
stored journal and original token without configuration/binding reads after unlink.
RED full-version/replay/diagnostic tests; GREEN55 focused DAL tests plus lint.
