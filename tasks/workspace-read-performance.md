# Workspace read requests

Read-only Dashboard, bank overview and financial-ledger requests resolve their authenticated workspace once per HTTP request. The promise belongs to an AsyncLocalStorage request context; it is discarded with that request. Parallel database reads use the same validated owner/company snapshot. Rejected resolutions fail dependent reads closed, and the next request validates again.

No financial result, session or company selection is cached across requests by this change. WhatsApp participant contexts, trusted jobs and explicitly selected worker companies retain their existing validation paths.

Integration tests invoke the real GET, Open Finance access, company selection and Supabase transport boundary with fictitious data. The same tests run against the parent revision reproduce five company reads for a ledger request and two for each Dashboard/bank-overview request; the corrected version performs one for each. Tests also cover concurrent clients/companies, matching company names, archiving, personal-mode selection, read failure/recovery and unauthenticated denial.

Validation: 1,647 application tests passed in 172 files; 15 existing optional tests skipped. Production build/type check passed. Lint has zero errors and two existing warnings. Independent review approved the change. The dependency gate retains the previously reviewed eight advisory occurrences until 17 October 2026; they are not claimed fixed. Production latency and log ingestion require subsequent measurement rather than inferring a measured speedup from synthetic query counts.
