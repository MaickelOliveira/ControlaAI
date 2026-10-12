# Concurrent bank overview reads

The Dashboard requests multiple ledger periods at once. Each request previously loaded the same bank overview independently. Share only an overview promise that is still running, keyed by the already authorized owner, mode, environment and company. Completed or failed promises are immediately removed; later reads reach storage again. Each consumer receives a separate cloned response.

The registry is shared across server module copies and holds at most 128 pending keys. Excess reads still run normally. Missing company scope is rejected before a promise can be shared. The GET and unified-finance callers retain their preceding access checks; no provider calls, credential changes, financial-calculation changes or persistent result cache are introduced.

Tests reproduced two overview calls for simultaneous periods before the change and one after it, while retaining separate period reports. They cover tenant/company/mode isolation, fresh reads after completion, separate consumer objects, failure/recovery and missing company scope. Independent review also verified duplicate module copies and the bounded registry. All 1,652 application tests and the production build/type check passed; 15 existing optional tests remain skipped.
