# Security review — 12 October 2026

Scope: authentication/authorization, client/company/linked-phone boundaries, provider secrets and diagnostics, webhooks/media, Supabase ACL/RLS and storage, dependency installation and public assets. No financial operations, real WhatsApp test messages, credential rotation or customer-history deletion.

## Repairs

- Google OAuth callback requires an active matching client owner before code exchange. Provider exception objects never enter diagnostics.
- Administrative sessions carry a keyed, server-only credential-version attestation. Credential changes invalidate old cookies; failed configuration reads/writes fail closed. Validation and signing recheck the version to prevent a password-change race. Old administrative cookies require login again; client/bank sessions are unaffected.
- Linked WhatsApp participants may read/change/delete/confirm financial records only in permitted modes, including pending snapshots, recurring settlements, counts and balance replies. Invitation-code generation requires the registered owner's verified phone, not an editable family label.
- Credit-funded Pix questions require the registered owner's verified link in JavaScript and PostgreSQL. A family relation such as “Titular” is cosmetic. Managed-database migration tests verify temporary permissions are removed and function owners/ACL remain unchanged.
- Billing diagnostics retain a bounded allowlist of mapped scalar fields and redact current/historical reflected secrets. Administrative GET/POST/PATCH responses mask the credential. Diagnostics do not change webhook financial processing.
- Webhooks read bounded streams independently of Content-Length: WABA/billing 1 MiB; Evolution 20 MiB for its existing inline-media format. Malformed WABA HMAC is rejected before body reading. Oversized input performs no billing/chat writes.
- WABA media authenticates only to HTTPS Meta media hosts, disallows URL credentials/custom ports and redirects, validates IDs, and caps metadata/media bytes. Provider errors return fixed codes, never upstream bodies/headers.
- Error/warning diagnostics emit static event labels, never raw exception objects, stack traces, provider messages, filenames or message text. A repository test guards this policy; success diagnostics retain only safe operational information.
- All session API writes require the configured public APP_ORIGIN (or existing Open Finance origin), independent of the container's internal URL. Service webhooks/cron retain their separate authentication. API responses use private no-store caching.
- Migration 73000 makes legacy server-only table ACL/RLS reproducible, closes the publicly callable limiter RPC and denies default browser grants for future internal objects. Existing service/workspace grants and records are preserved.
- sharp and source-map-js updated within existing ranges. npm 11.8.0 pinned; dependency scripts disabled, checkout token not persisted, CI checks credential patterns and unreviewed/expired dependency advisories.
- Align CI and Docker on supported Node.js 24. The real Supabase transport regression failed under the former Node.js 20 CI runtime: the installed Supabase client requires Node.js 22 or newer. Node.js 20 is end-of-life. References: [Supabase Node.js support](https://github.com/supabase/supabase-js/blob/master/packages/core/supabase-js/README.md), [Node.js releases](https://nodejs.org/en/about/previous-releases).

## Evidence and limits

- All 40 public and 17 Open Finance production tables had RLS before changes; the exposed legacy-table possibility was checked and not claimed as an actual direct-data breach.
- Production metadata after migrations: zero publicly executable privileged application functions; no public storage buckets; temporary workspace CREATE permissions removed; helper inaccessible to API roles.
- Production metadata: zero unencrypted legacy Google tokens, billing credentials or configured integration-secret slots; zero latest billing bodies with common secret-named fields. No secret values or customer rows were returned.
- Pattern scan: 806 tracked files at release and 1,457 historical text objects; no high-confidence credential formats found. This does not prove absence of every secret format, nor cover private deployment logs.
- Unsigned requests to protected official APIs were denied; HTTPS security headers and no powered-by header verified. Application tests use fictitious data and mocked providers; SQL contracts use an isolated database, not production traffic.
- Final local validation: 170 test files passed, 1,632 tests passed and 15 existing optional tests skipped; production build and TypeScript check passed; lint has zero errors and two pre-existing warnings. PostgreSQL contracts include 15 credit-Pix groups and the legacy-access regression with an intentionally vulnerable baseline.
- Dependency exceptions remain documented in dependency-audit-followup.md. Eight advisory occurrences remain (six high, two moderate; three root advisories), narrowly scoped to unused affected operations/development tooling and reviewed until 17 October. They are not described as fixed.

## Required operational follow-up

Runtime credential lifecycle and deployment-manager logs are outside the repository credential-pattern check. Any required rotation belongs in a private operational runbook, with service-continuity validation. An encryption-key change requires a coordinated data migration, never a blind replacement.

Easypanel Dockerfile builds pass service environment values as build arguments even when the Dockerfile does not declare/use them. The repository Dockerfile declares no application secrets and the env-file option is off, but failures in the deployment manager may still expose arguments. The reviewed longer-term remedy is to build an image without production secrets outside Easypanel and deploy that immutable image with runtime-only environment. Changing the builder/registry needs a separately verified rollout; it was not silently applied to this running service. References: [Easypanel builders](https://easypanel.io/docs/builders), [Docker build secrets](https://docs.docker.com/build/building/secrets/).

This is a scoped inspection and tested hardening, not a penetration test, host patch/backup restoration audit, provider incident investigation or guarantee against every incident. Existing Google per-company separation remains a separately queued feature.
