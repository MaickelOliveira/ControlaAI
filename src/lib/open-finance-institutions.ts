import "server-only";
import { polpObject, polpUuid } from "./polp-production";
export type BankInstitution = { id: string; name: string; type: "PERSONAL" | "BUSINESS" | "BOTH"; status: string; is_outage: boolean; organizationName: string; parentOrganizationName: string };
let cached: { until: number; banks: BankInstitution[] } | undefined;
function text(value: unknown, max = 250): string { return typeof value === "string" ? value.slice(0, max) : ""; }
export async function getBankInstitutions(): Promise<BankInstitution[]> {
  if (cached && cached.until > Date.now()) return cached.banks;
  const banks: BankInstitution[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 40; page++) {
    const url = "https://api.polp.com.br/api/v2/institutions" + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("INSTITUTIONS_UNAVAILABLE");
    const body = polpObject(await response.json());
    if (!Array.isArray(body.data) || body.data.length > 1000) throw new Error("INVALID_RESPONSE");
    for (const item of body.data) {
      const bank = polpObject(item);
      if (!["PERSONAL","BUSINESS","BOTH"].includes(String(bank.type))) continue;
      banks.push({ id: polpUuid(bank.id), name: text(bank.name), type: bank.type as BankInstitution["type"], status: text(bank.status), is_outage: bank.is_outage === true, organizationName: text(bank.organizationName), parentOrganizationName: text(bank.parentOrganizationName) });
    }
    const next = body.meta ? polpObject(body.meta).next_cursor : null;
    if (!next) { cached = { until: Date.now() + 60_000, banks }; return banks; }
    if (typeof next !== "string" || next.length > 1000 || seen.has(next)) throw new Error("INVALID_PAGINATION");
    seen.add(next); cursor = next;
  }
  throw new Error("INSTITUTIONS_INCOMPLETE");
}
