# Visible page bank updates

Visible pages originally read the saved bank data every 10 seconds even when nothing changed. Equal JSON responses now lengthen the next interval from 10 to 20, 40 and finally 60 seconds. A changed response resets it to 10 seconds. Returning to the page still reads immediately, hidden pages make no reads, and only one request runs at a time.

Pending authorizations and revocations remain at 10 seconds. The ledger also stays fast while its report flags an import, including unresolved failures, because committed overview watermarks can predate newly queued jobs. Overview-only reads stay fast when a pending/running watermark is present. This change does not promise to detect an unreported queue state immediately. The response snapshot is scoped to the mounted page and is never written to browser storage, logs or telemetry. Provider synchronization, reminder schedules, authentication and financial calculations are unchanged.

Regression tests use fictitious time and data to prove equal JSON, nested changes in the same object, wake events, pending states, errors, cleanup and no overlap. The new cadence tests failed against the original implementation before the production change.
