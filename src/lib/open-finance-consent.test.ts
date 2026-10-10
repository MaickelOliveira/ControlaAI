import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ rpc: vi.fn(), request: vi.fn() }));
vi.mock("./open-finance-http", () => ({ openFinanceRpc: m.rpc }));
vi.mock("./polp-production", async original => ({ ...await original<typeof import("./polp-production")>(), polpProductionRequest: m.request }));
import { refreshProductionConsent } from "./open-finance-consent";
const id = "550e8400-e29b-41d4-a716-446655440000";
const scope = { userId: id, mode: "personal" as const, environment: "production" as const };
beforeEach(() => { vi.resetAllMocks(); m.rpc.mockResolvedValue({ status: "pending", external_consent_id: id, institution_id: id }); m.request.mockResolvedValue({ data: { id, institution_id: id, cliente_user_id: id, status: "AUTHORISED" } }); });
it("does not query a cancelled or foreign connection", async () => {
  m.rpc.mockRejectedValueOnce(new Error("OF_CONNECTION_NOT_FOUND"));
  await expect(refreshProductionConsent(scope,id)).rejects.toThrow();
  m.rpc.mockResolvedValueOnce({ status: "revoking" });
  await expect(refreshProductionConsent(scope,id)).rejects.toThrow("CONSENT_CANCELLED");
  expect(m.request).not.toHaveBeenCalled();
});
it("rejects a different provider client before changing status", async () => {
  m.request.mockResolvedValue({ data: { id, institution_id: id, cliente_user_id: "other", status: "AUTHORISED" } });
  await expect(refreshProductionConsent(scope,id)).rejects.toThrow("CONSENT_IDENTITY_MISMATCH");
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
it("returns the current revoked status when cancellation races with refresh", async () => {
  m.rpc.mockResolvedValueOnce({ status: "pending", external_consent_id: id, institution_id: id }).mockResolvedValueOnce(null).mockResolvedValueOnce({status:"revoked"});
  expect(await refreshProductionConsent(scope,id)).toEqual({id,status:"revoked"});
  expect(m.rpc).toHaveBeenCalledWith(scope,"zelo_of_set_status",{p_id:id,p_status:"active",p_provider_status:"AUTHORISED"});
});
