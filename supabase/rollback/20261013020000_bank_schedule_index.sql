-- Single statement outside a transaction; removes no records or permissions.
drop index concurrently open_finance.sync_jobs_complete_lookup_idx;
