import "server-only";
import type { OpenFinanceScope } from "./open-finance-access";
import { openFinanceRpc } from "./open-finance-http";
import { parseBankAuthUrl, polpObject, polpProductionRequest, polpUuid, requireAuthUrl, type PolpObject } from "./polp-production";
import type { BankAuthorization } from "./open-finance-display";

/** Withhold every unverified URL, including its tokens, during private initial setup. */
export function getConsentAuthorization(consent: PolpObject): BankAuthorization {
  if (!consent.url_to_authenticate) return { authorizationUrl: null };
  const url = parseBankAuthUrl(consent.url_to_authenticate);
  if (consent.url_to_authenticate_expires_at != null) {
    const expires = typeof consent.url_to_authenticate_expires_at === "string" ? Date.parse(consent.url_to_authenticate_expires_at) : NaN;
    if (!Number.isFinite(expires)) throw new Error("INVALID_AUTH_URL");
    if (expires <= Date.now()) return { authorizationUrl: null, authorizationExpired: true };
  }
  if (process.env.OPEN_FINANCE_PREVIEW_ONLY === "true" && !process.env.OPEN_FINANCE_AUTH_HOSTS?.trim()) {
    return { authorizationUrl: null, authorizationPending: true, authorizationHost: url.hostname };
  }
  return { authorizationUrl: requireAuthUrl(url.href) };
}

/** A browser return proves no authorization. Only the provider can confirm it. */
export async function refreshProductionConsent(scope: OpenFinanceScope, id: string) {
  const connection = polpObject(await openFinanceRpc(scope, "zelo_of_connection", { p_id: polpUuid(id) }));
  if (connection.status === "revoked" || connection.status === "revoking") throw new Error("CONSENT_CANCELLED");
  const consent = polpObject((await polpProductionRequest(`/consents/${polpUuid(connection.external_consent_id)}`)).data);
  if (consent.id !== connection.external_consent_id || consent.cliente_user_id !== scope.userId || consent.institution_id !== connection.institution_id) throw new Error("CONSENT_IDENTITY_MISMATCH");
  const status = { AUTHORISED: "active", AWAITING_AUTHORIZATION: "pending", EXPIRED: "expired", REJECTED: "error" }[String(consent.status)];
  if (!status) throw new Error("INVALID_CONSENT_STATUS");
  await openFinanceRpc(scope, "zelo_of_set_status", { p_id: id, p_status: status, p_provider_status: consent.status });
  // Read after the mutation: a concurrent revocation must win over this response.
  const current = polpObject(await openFinanceRpc(scope, "zelo_of_connection", { p_id: id }));
  return { id, status: String(current.status), ...(current.status === "pending" && status === "pending" ? getConsentAuthorization(consent) : {}) };
}
