-- Zelo uses authenticated server APIs, not direct Supabase browser access.
-- Preserve existing data, service grants and workspace policies; deny direct API roles.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare table_name text;
begin
 foreach table_name in array array[
  'users',
  'wpp_phone_links',
  'accounts',
  'card_invoices',
  'finances',
  'tasks',
  'reminders',
  'goals',
  'vehicles',
  'appointments',
  'recurring_transactions',
  'employees',
  'customers',
  'contacts',
  'grocery',
  'grocery_stores',
  'grocery_products',
  'grocery_purchases',
  'grocery_purchase_items',
  'grocery_shopping_list_items',
  'meets',
  'drive_folders',
  'drive_files',
  'conversations',
  'support_conversations',
  'pending_actions',
  'admin_config',
  'billing_config',
  'whatsapp_config',
  'google_tokens',
  'billing_webhooks',
  'webhook_message_ids',
  'cron_lock',
  'rate_limits'
 ] loop
  if to_regclass(format('public.%I',table_name)) is not null then
   execute format('alter table public.%I enable row level security',table_name);
   execute format('revoke all on table public.%I from public,anon,authenticated',table_name);
  end if;
 end loop;
end;$$;
revoke all on function public.check_rate_limit(text,integer,bigint) from public,anon,authenticated;
grant execute on function public.check_rate_limit(text,integer,bigint) to service_role;
-- Explicit grants in future migrations must name the intended server principal.
alter default privileges in schema public revoke all on tables from public,anon,authenticated;
alter default privileges in schema public revoke all on sequences from public,anon,authenticated;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated;
commit;
