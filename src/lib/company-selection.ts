const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function companyCookieValue(userId: string, companyId: string): string {
  if (!UUID.test(userId) || !UUID.test(companyId)) throw Error("COMPANY_INVALID");
  return `${userId}:${companyId}`;
}
/** A previous login's selection must never be carried into another account. */
export function selectedCompanyId(userId: string, cookie?: string): string | undefined {
  if (!cookie) return undefined;
  const [owner, id, extra] = cookie.split(":");
  if (owner !== userId) return undefined;
  if (extra !== undefined || !UUID.test(id ?? "")) throw Error("COMPANY_INVALID");
  return id;
}
