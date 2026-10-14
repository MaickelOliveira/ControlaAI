# Idempotent local appointments

New event consumers never infer a Google destination from a historical global
connection. With no scoped binding, a plain appointment is saved locally before
any effect. Meet creation/addition requires an explicitly selected scoped binding;
unowned local/legacy appointments cannot acquire inferred provider provenance.

Migration18 adds one private immutable receipt keyed by logical appointment UUID,
exact authenticated owner/workspace, source and canonical creation input with
withMeet=false. A shared active-owner/workspace write lock serializes retries.
The first request inserts a nonlegacy public appointment and its receipt atomically.
A repeat of the original intent returns the receipt even after local edits or
cancellation; changed input/source/scope and any existing unreceipted public UUID
are conflicts. No binding, grant, provider ID, token, activation, Meet or Google
origin is read, inferred or created. Existing scoped origins also conflict.

Backend-only invoker RPCs local_appointment_get/create use fixed search paths and
strict canonical fields/times/source validation. Getter joins the exact owned
nonlegacy local row and exposes only immutable receipt fields to the server DAL.
RLS plus explicit ACLs deny browsers and forbid backend receipt updates/deletes.
Composite owner foreign keys and cascades support account erasure. Rollback closes
receipt APIs/privileges while preserving receipts and public/history rows.

Disposable PostgreSQL tests prove ACLs, unchanged historical/credential/activation
bytes, local creation without activation or binding, replay after edits/cancellation,
scope/UUID collisions, input rejection, atomic insert failure, concurrent replay,
active owner/company checks and owner cascade. No live DB or provider is used.

Verification: baseline rejects missing RPC (SQLSTATE42883); migration passes64
disposable PostgreSQL assertions with no real user/provider data.

Server DAL captures/freeze-validates exact scope, UUID and canonical input before
awaits; rejects substituted/extra stored fields, conference data and diagnostics.
RED missing module, GREEN23 focused tests plus lint.
