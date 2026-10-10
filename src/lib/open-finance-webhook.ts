import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { polpExternalId, polpObject, polpUuid } from "./polp-production";
import { RESOURCE_FAMILIES, sourceDate, type ResourceFamily } from "./open-finance-normalize";

export type BankJobSpec = { kind: "consent" | "catalog" | "transactions" | "bills" | "reserves"; family: ResourceFamily | "consents"; external_resource_id: string; window: Record<string,string> };
export function verifyBankWebhook(raw: Uint8Array, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256",secret).update(raw).digest();
  return timingSafeEqual(expected,Buffer.from(signature.slice(7),"hex"));
}
function timestamp(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})?$/.test(value)) throw new Error("INVALID_WINDOW");
  sourceDate(value);
  const parsed = Date.parse(/[Z]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
  if (!Number.isFinite(parsed)) throw new Error("INVALID_WINDOW");
  return parsed;
}
export function parseBankWebhook(payload: unknown): BankJobSpec {
  const body = polpObject(payload), event = String(body.event), resource = String(body.resource);
  let kind: BankJobSpec["kind"], family: BankJobSpec["family"];
  if (event === "consents" && resource === "consents") { kind="consent";family="consents"; }
  else if (event === "bills" && resource === "credit-cards") { kind="bills";family="credit-cards"; }
  else {
    const parts = event.split("."), candidate = parts[0].replaceAll("_","-");
    if (!RESOURCE_FAMILIES.includes(candidate as ResourceFamily)) throw new Error("INVALID_EVENT");
    family = candidate as ResourceFamily;
    if (parts.length === 1 && resource === "consents") kind="catalog";
    else if (parts.length === 2 && parts[1] === "transactions" && resource === family && family !== "loans" && family !== "financings") kind="transactions";
    else throw new Error("INVALID_EVENT");
  }
  const external_resource_id = resource === "consents" ? polpUuid(body.resource_id) : polpExternalId(body.resource_id);
  const window: Record<string,string> = {};
  if (body.query_parameters != null) {
    if (typeof body.query_parameters !== "string" || body.query_parameters.length > 1000 || kind === "consent") throw new Error("INVALID_WINDOW");
    for (const [key,value] of new URLSearchParams(body.query_parameters)) {
      if (!/^(from|to)(Created|Updated)At$/.test(key) || key in window) throw new Error("INVALID_WINDOW");
      timestamp(value);window[key]=value;
    }
    for (const axis of ["Created","Updated"]) {
      const from=window[`from${axis}At`], to=window[`to${axis}At`];
      if (from && to && timestamp(from)>timestamp(to)) throw new Error("INVALID_WINDOW");
    }
  }
  return {kind,family,external_resource_id,window};
}
