import { phoneVariants } from "./conversations";

/** Ownership comes from the account registration and a verified phone binding.
 * Family relations and display names are editable labels, never authorization roles.
 * Callers must separately verify the active phone link belongs to this account. */
export function isRegisteredAccountHolderPhone(registeredPhone: string | undefined, linkedPhone: string): boolean {
  return typeof registeredPhone === "string" && phoneVariants(registeredPhone).includes(linkedPhone.replace(/\D/g,""));
}
