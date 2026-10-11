const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function selectCompanyContext<T extends {id:string;isDefault:boolean;archivedAt?:string}>(companies:T[],selected:string|undefined,mode:"personal"|"business"):T {
 const previous=selected?companies.find(c=>c.id===selected):undefined;
 if(selected&&!previous)throw Error("COMPANY_NOT_FOUND");
 const active=companies.filter(c=>!c.archivedAt);
 const company=previous&&!previous.archivedAt?previous:active.find(c=>c.isDefault)??active[0];
 if(company)return company;
 if(mode==="personal"&&companies.length)return companies.find(c=>c.isDefault)??companies[0];
 throw Error("COMPANY_REQUIRED");
}
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
