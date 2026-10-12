# Bank schedules and credit display

The reported WhatsApp phrase `o que tenho de parcelados` must list registered installments and authorized bank observations. A generic spending classification must not silently impose its default month or turn the query into a payment confirmation. Explicit date filters, mode and company scope remain enforced. Completion forecasts use calculated end dates, including overdue unpaid installments.

Finanças displays bank forecasts outside the posted transaction list, with four initial rows and an expandable remainder. Account IDs, expense/income filters, dates and search apply. Forecasts with no authoritative category stay outside category filters; unknown currency and due dates remain unknown. Forecasts never become posted expenses or payment proof.

Credit rows with identical card resource, named line, consolidation, currency, exact decimal amounts and flexibility are displayed once with a source count. Distinct purposes, cards, currencies and amounts remain separate. No stored records are deleted, no amounts are added and unknown values are never converted to zero. The same grouping serves Contas, both Dashboard widgets and WhatsApp.

The credit wallet uses aligned overlapping faces, native buttons, keyboard focus and touch selection. The selected face expands without hiding other bank names. Financial analysis follows the main Dashboard column independently of the planning rail. Bank credit lists have a bounded scroll region, and account cards keep their content height instead of stretching to a long credit list.

Validation: failing regression tests preceded logic fixes; independent reviews covered recurrence classification, completion forecasts and all four credit display consumers. Full suite: 1,275 tests passed, 15 existing optional tests skipped. Lint: no errors, two pre-existing warnings. Browser fixtures verified 390px width, light/dark themes, mouse/keyboard card selection and unknown-currency display. No real bank connection or WhatsApp message was changed during tests.
