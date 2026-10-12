import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabase } from "./supabase";
import { phoneVariants } from "./conversations";

export type WhatsAppActivityLease = { finish(): Promise<void> };
export type WhatsAppQuestionLease = WhatsAppActivityLease & { ready(): Promise<boolean> };
const enabled = () => process.env.OPEN_FINANCE_CREDIT_PIX_QUESTIONS_ENABLED === "true";
const unavailable = () => new Error("WPP_ACTIVITY_UNAVAILABLE");

function identity(phone: string) {
  const variants = phoneVariants(phone);
  if (!variants.length || variants.length > 8 || variants.some(value => !/^[0-9]{8,20}$/.test(value))) throw unavailable();
  return { p_phone: variants[0], p_variants: variants, p_token: randomUUID() };
}

async function checkedRpc(operation: string, params: Record<string, unknown>): Promise<boolean> {
  try {
    const { data, error } = await getSupabase().rpc(operation, params);
    if (error) throw unavailable();
    return data === true;
  } catch { throw unavailable(); }
}

/** A distinct nonce protects each overlapping inbound or outgoing notice. */
export async function beginWhatsAppActivity(phone: string, kind: "inbound" | "notice"): Promise<WhatsAppActivityLease> {
  if (!enabled()) return { finish: async () => {} };
  const params = identity(phone);
  const begin = async () => {
    if (!await checkedRpc("zelo_wpp_activity_begin", { ...params, p_kind: kind })) throw unavailable();
  };
  await begin();
  let renewing: Promise<void> | undefined;
  let renewalFailed = false;
  let finishing: Promise<void> | undefined;
  let closed = false;
  const timer = setInterval(() => {
    if (closed || renewing) return;
    // Handle rejection immediately; finish reports failure after releasing the nonce.
    renewing = begin().catch(() => { renewalFailed = true; }).finally(() => { renewing = undefined; });
  }, 60_000);
  timer.unref();
  return {
    finish() {
      if (finishing) return finishing;
      closed = true;
      clearInterval(timer);
      finishing = (async () => {
        // Delete only after any already-dispatched renewal has completed.
        await renewing;
        if (!await checkedRpc("zelo_wpp_activity_finish", params) || renewalFailed) throw unavailable();
      })();
      return finishing;
    },
  };
}

/** The database owns the 30-second expiry. Questions never renew their slot. */
export async function claimWhatsAppQuestion(phone: string): Promise<WhatsAppQuestionLease | null> {
  if (!enabled()) return null;
  const params = identity(phone);
  if (!await checkedRpc("zelo_wpp_question_claim", params)) return null;
  let closed = false;
  let finishing: Promise<void> | undefined;
  return {
    async ready() {
      if (closed || !enabled()) return false;
      return checkedRpc("zelo_wpp_question_ready", params);
    },
    finish() {
      if (finishing) return finishing;
      closed = true;
      finishing = (async () => {
        if (!await checkedRpc("zelo_wpp_activity_finish", params)) throw unavailable();
      })();
      return finishing;
    },
  };
}
