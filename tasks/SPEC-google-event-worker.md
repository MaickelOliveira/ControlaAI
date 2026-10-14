# Process Google recovery worker

The private bounded pump already chooses at most20 original persisted jobs and
runs at most3 SDK workers. SQL-selected scope/provenance and current SDK leases
remain the only authority. This slice schedules that pump in the Node server;
it adds no provider identity, global credential fallback, notification or Codex
scheduled automation. Trusted company context clears an inherited HTTP workspace
before each pump, never authorizes arbitrary caller/body jobs.

startGoogleEventWorker is a process Symbol singleton, idempotent across repeated
Node instrumentation registration/module reload. It schedules startup after15s.
One recursive timer starts each pump only after the prior pump has finished. Work
selected means30s until the next poll; empty/failed polls back off60/120/240/300s.
Only a fixed sanitized failure message is logged, never entities or diagnostics.

wakeGoogleEventWorker is a no-op before bootstrap; it immediately schedules a
started idle worker and resets backoff. Repeated wakes do not postpone that urgent
timer. A wake during work sets one follow-up flag, which schedules an immediate
next poll after completion without overlap. Timers are unref'd for shutdown.
Node instrumentation starts recovery after database scope setup; Edge returns
before importing/starting it. No service file is edited in this slice; parent
wires wakes after persisted pending mutations. Database leases still coordinate
multiple processes, while the singleton prevents overlap within one process.

Fake-clock tests use the real company AsyncLocalStorage and mocked private pump,
never a network/real database. Cover startup, process dedup/module reload, no
parallel ticks, pending cadence, idle/failure backoff, wake while idle/inflight,
context clearing, sanitized failures and Node/Edge instrumentation boundaries.

Verification: RED missing worker module, GREEN12 fake-clock tests plus lint. The
context test records observations outside the caught pump callback, proving real
request scope is cleared on every tick without masking assertions as failures.
Instrumentation tests use mocked cron/database boundaries; no live Google/DB or
full build was run. Existing service source was untouched.
