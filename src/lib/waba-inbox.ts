import "server-only";
import { getSupabase } from "./supabase";

export type StoredWabaMessage = { id?: string; from?: string; type?: string; [key: string]: unknown };
export type ClaimedWabaMessage = {
  messageId: string; message: StoredWabaMessage; contactName?: string;
  receivedAt: number; leaseToken: string;
};

/** Persist verified input before acknowledging the provider. Conflicts are
 * expected on delivery retries and never overwrite the original payload. */
export async function enqueueWabaMessages(messages: StoredWabaMessage[], contactName: string | undefined, receivedAt: number): Promise<void> {
  if (!messages.length || messages.length > 50 || messages.some(message =>
    typeof message.id !== "string" || message.id.length < 1 || message.id.length > 512 || /[\s\p{Cc}]/u.test(message.id)
    || typeof message.from !== "string" || !/^\d{8,20}$/.test(message.from.replace(/\D/g, "")))) {
    throw Error("WABA_INBOX_INVALID");
  }
  const rows = messages.map((message, index) => ({
    message_id: message.id!,
    phone: message.from!.replace(/\D/g, ""),
    payload: message,
    contact_name: contactName?.slice(0, 200) ?? null,
    received_at: new Date(receivedAt + index).toISOString(),
    state: "queued",
    processed_at: null,
  }));
  const { error } = await getSupabase().from("webhook_message_ids")
    .upsert(rows, { onConflict: "message_id", ignoreDuplicates: true });
  if (error) throw Error("WABA_INBOX_UNAVAILABLE");
}

export async function claimWabaMessage(): Promise<ClaimedWabaMessage | null> {
  const { data, error } = await getSupabase().rpc("zelo_waba_claim");
  if (error || !Array.isArray(data) || data.length > 1) throw Error("WABA_INBOX_UNAVAILABLE");
  if (!data.length) return null;
  const row = data[0] as Record<string, unknown>;
  const receivedAt = Date.parse(String(row.received_at));
  if (typeof row.message_id !== "string" || !row.payload || typeof row.payload !== "object"
    || typeof row.lease_token !== "string" || !Number.isFinite(receivedAt)) throw Error("WABA_INBOX_INVALID");
  return {
    messageId: row.message_id,
    message: row.payload as StoredWabaMessage,
    contactName: typeof row.contact_name === "string" ? row.contact_name : undefined,
    receivedAt,
    leaseToken: row.lease_token,
  };
}

async function transition(name: string, messageId: string, leaseToken: string, outcome?: string): Promise<void> {
  const { data, error } = await getSupabase().rpc(name, {
    p_message_id: messageId, p_lease_token: leaseToken, ...(outcome ? { p_outcome: outcome } : {}),
  });
  if (error || data !== true) throw Error("WABA_INBOX_UNAVAILABLE");
}

export async function beginWabaDispatch(messageId: string, leaseToken: string): Promise<void> {
  await transition("zelo_waba_begin_dispatch", messageId, leaseToken);
}

export async function finishWabaMessage(messageId: string, leaseToken: string, outcome: "succeeded" | "retry" | "failed"): Promise<void> {
  await transition("zelo_waba_finish", messageId, leaseToken, outcome);
}

export async function wabaInboxAttentionCount(): Promise<number> {
  const { data, error } = await getSupabase().rpc("zelo_waba_inbox_attention_count");
  if (error || typeof data !== "number" || !Number.isSafeInteger(data) || data < 0) throw Error("WABA_INBOX_UNAVAILABLE");
  return data;
}

export async function cleanupWabaInbox(): Promise<void> {
  const { error } = await getSupabase().rpc("zelo_waba_cleanup");
  if (error) throw Error("WABA_INBOX_UNAVAILABLE");
}
