-- Disable the new write operations without deleting purchase or finance history.
begin;
revoke execute on function public.save_grocery_purchase(uuid,uuid,uuid,date,jsonb,numeric,jsonb),public.delete_grocery_purchase(uuid,uuid) from service_role;
-- Keep consistency guards and workspace metadata. Re-enable after repairing the app.
commit;
