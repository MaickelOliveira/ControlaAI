import { createHash } from "crypto";

export type MetaConversionInput = {
  eventName: "CompleteRegistration";
  eventId: string;
  eventSourceUrl: string;
  email: string;
  phone: string;
  name: string;
  externalId: string;
  clientIp?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
  plan?: string;
  billingCycle?: string;
};

type MetaUserData = Record<string, string | string[]>;

export function hashMetaValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashed(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized ? [hashMetaValue(normalized)] : undefined;
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

function splitName(name: string) {
  const parts = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return { firstName: parts[0], lastName: parts.length > 1 ? parts.at(-1) : undefined };
}

export function buildMetaConversionPayload(input: MetaConversionInput, timestamp = Date.now()) {
  const { firstName, lastName } = splitName(input.name);
  const userData: MetaUserData = {
    em: hashed(input.email)!,
    ph: hashed(normalizePhone(input.phone))!,
    external_id: hashed(input.externalId)!,
    fn: hashed(firstName)!,
    country: hashed("br")!,
  };

  const lastNameHash = hashed(lastName);
  if (lastNameHash) userData.ln = lastNameHash;
  if (input.clientIp && input.clientIp !== "unknown") userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;

  return {
    data: [{
      event_name: input.eventName,
      event_time: Math.floor(timestamp / 1000),
      event_id: input.eventId,
      event_source_url: input.eventSourceUrl,
      action_source: "website",
      user_data: userData,
      custom_data: {
        content_name: "Cadastro Zelo",
        plan: input.plan || "personal",
        billing_cycle: input.billingCycle || "monthly",
      },
    }],
  };
}

export async function sendMetaConversion(input: MetaConversionInput) {
  const pixelId = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN;
  if (!pixelId || !accessToken) return { sent: false as const, reason: "not_configured" as const };

  const apiVersion = process.env.META_GRAPH_API_VERSION || "v25.0";
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(pixelId)}/events`);
  url.searchParams.set("access_token", accessToken);

  const payload: Record<string, unknown> = buildMetaConversionPayload(input);
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.error(`[meta-capi] evento rejeitado com status ${response.status}`);
      return { sent: false as const, reason: "rejected" as const };
    }
    return { sent: true as const };
  } catch (error) {
    console.error("[meta-capi] falha ao enviar evento", error instanceof Error ? error.message : "erro desconhecido");
    return { sent: false as const, reason: "network_error" as const };
  }
}
