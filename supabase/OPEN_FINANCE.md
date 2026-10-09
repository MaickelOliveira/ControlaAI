# Open Finance storage preparation

This preparation adds eight empty tables in the private `open_finance` PostgreSQL schema. It does not change existing Zelo tables, import bank data, connect the sandbox preview to the database, enable any user, expose a new API schema, or install a synchronization job.

| Table | Purpose |
| --- | --- |
| user_access | Verified Brazilian eligibility; disabled by default |
| connections | Provider consent, bank, expiry, user, environment and personal/business mode |
| resources | Canonical accounts, cards, investments, loans, financing and reserves |
| card_limits | Separate source lines for total, used, available and customized credit |
| bills | Source bills and due dates |
| movements | Provider transactions, dates, amounts, classifications and bill links |
| credit_details | Loan and financing balances and installments |
| sync_state | Pagination, watermarks, last success and historical coverage |

Every table has enabled and forced RLS with no access policy. Existing default grants are revoked from PUBLIC, anon, authenticated and service_role. The current app uses custom Zelo sessions, so a future authenticated server query layer must check its actual user identity; `auth.uid()` alone would not authorize that identity. This migration grants no new access. Do not expose the schema in the Data API.

Ownership, environment and personal/business mode are enforced through composite foreign keys. Resources retain their internal identity when consent is renewed; upsert by `(user_id, environment, resource_type, external_id)` and update the connection. Transactions deduplicate by resource and external ID. Provider credentials remain in server secrets; no full card number, CVV, PIN, bank password, token or unrestricted provider payload is stored here.

Unknown source values stay null. Preserve source currency and date; never interpret a missing value as zero or combine currencies without explicit conversion. Card limit lines may overlap and must not be summed blindly. Source amounts and timestamps are snapshots, not a promise of real-time bank state.

Spending reports must use the requested transaction date range, distinguish unknown classifications, exclude duplicate transfer/bill-payment effects, and reconcile existing manual, PDF and WhatsApp entries. These source tables do not automatically insert into `public.finances`. Mark a period complete and advance watermarks only after every page commits; absence of transactions is not proof of complete coverage. Report partial coverage and last successful sync alongside any future AI summary.

## Apply and verify

Apply `migrations/20261009193000_open_finance_storage.sql` once to the intended project. It uses a transaction and short lock timeout. An existing schema causes refusal; after an unknown result, verify before retrying. The schema ownership marker is `Zelo Open Finance storage v1 (20261009193000); private; disabled`.

Run the read-only query `verify/open_finance_storage.sql`. Verify eight empty tables, forced RLS on all tables, no policies and no schema/data grants to app roles. Only the DDL migration and read-only catalog verification belong in the live project. Do not run the fixtures or test suite there.

Applied to **Zelo Brasil** on 2026-10-09 through the Supabase SQL editor. The verification returned all eight tables with zero rows and every protection check true. Existing `public.finances` and `public.accounts` remain present. The app, API exposure, credentials, jobs and user enrollment were not changed.

The manual rollback in `rollback/20261009193000_open_finance_storage.sql` checks the marker and locks the eight tables. It sets `row_security = off` so an operator subject to forced RLS gets an error instead of mistaking invisible rows for an empty table. It refuses any stored data or changed structure, and never uses CASCADE. It is outside the migration pipeline and must not be run automatically.

## Disposable database tests

The SQL suite runs against an in-memory PostgreSQL engine using PGlite. Install the pinned test tool outside the product dependency tree, then run from the repository:

```sh
npm install --prefix /tmp/zelo-open-finance-test --ignore-scripts --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.8
node supabase/tests/run-open-finance.mjs /tmp/zelo-open-finance-test/node_modules/@electric-sql/pglite/dist/index.js
```

Tests cover actual anonymous-role denial, RLS denial even with temporary local grants, ownership/environment/mode isolation, type-safe card and bill links, duplicate imports, renewed consents, unknown values, date semantics, sync coverage, repeat-apply refusal and empty-only rollback. All financial fixtures are invented and remain in memory. No production dependency or server connection is added.

Before activation: implement reviewed user-scoped server permissions, owner-only eligibility, provider validation and paginated synchronization, webhook authentication/deduplication, consent revocation and retention, reconciliation, and AI queries over deterministic database totals. Customer rollout remains disabled.
