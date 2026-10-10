import "server-only";
import type { OpenFinanceScope } from "./open-finance-access";
import { openFinanceRpc } from "./open-finance-http";
import { polpObject, polpProductionRequest, polpUuid } from "./polp-production";

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
  return { id, status: String(current.status) };
}
