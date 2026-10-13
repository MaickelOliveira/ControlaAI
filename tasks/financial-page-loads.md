# Financial page reads

The ledger previously read the selected manual period and the complete manual history separately. It now reads the authorized complete history once and derives the inclusive period from that same result. Accumulated balance, pending items, authors and bank adjustments keep their existing rules; incomplete storage reads remain unavailable rather than becoming zero.

Dashboard and Accounts wait for the resolved mode before reading banks. Dashboard starts its current ledger from the identity request shared with the layout, accepts the fresher Dashboard identity over a late identity response, and reads a previous comparison period only for the manual-only view that displays it. Identity calls share only pending work, so a later page checks the current server mode. Bootstrap failures show a retry instead of waiting indefinitely.

Evidence uses fictitious data and the real ledger GET. Seven integration cases initially produced five failures at the duplicate-read assertion; all now pass, preserving statements and balances. Identity revalidation also failed before the fix. A localhost browser reproduction initially made three personal and three business ledger requests in the first ten seconds while opening business Dashboard; a clean opening after the fix made two business requests in its first five seconds (current period and six-month history) and no personal requests. Accounts likewise made a personal request before the fix and only business overview requests afterwards. These are request-count observations, not production latency measurements.

Isolation integration tests exercise real scope/access/storage services with fictitious transport. No completed financial result is cached, no bank synchronization is disabled, and no history, connection, company or credential is changed.

Remaining work: measure production end-to-end latency and per-service egress/log volume; reduce serial 50-row bank report pages and repeated metadata for long chart windows. Egress alone does not identify a latency cause.
