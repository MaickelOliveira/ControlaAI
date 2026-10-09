import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSandboxConsent, getSandboxSnapshot, listPolpInstitutions, listSandboxAccounts,
  listSandboxTransactions, requirePolpUuid,
} from "./polp-sandbox";

const CONSENT = "550e8400-e29b-41d4-a716-446655440000";
const ACCOUNT = "550e8400-e29b-41d4-a716-446655440001";
const fetchMock = vi.fn<typeof fetch>();

describe("Polp sandbox only", () => {
  beforeEach(() => {
    vi.stubEnv("POLP_SANDBOX_CLIENT_ID", "client-test");
    vi.stubEnv("POLP_SANDBOX_CLIENT_SECRET", "secret-test");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("creates a fictitious consent for accounts, cards, credit and investments", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: CONSENT } }), { status: 201 }));
    await createSandboxConsent(CONSENT);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.polp.com.br/api/v2/sandbox/consents");
    expect(options?.method).toBe("POST");
    expect(options?.headers).toMatchObject({ "x-api-client": "client-test", "x-api-secret": "secret-test" });
    expect(JSON.parse(String(options?.body))).toEqual({
      institution_id: CONSENT, cpf: "12345678900", cliente_user_id: "zelo-admin-sandbox",
      products: ["ACCOUNT", "CREDIT_CARD_ACCOUNT", "CREDIT_OPERATIONS", "INVESTMENTS"], avoidDuplicates: true,
    });
  });

  it("reads accounts and transactions only from the sandbox", async () => {
    await listSandboxAccounts(CONSENT);
    await listSandboxTransactions(ACCOUNT);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      `https://api.polp.com.br/api/v2/sandbox/consents/${CONSENT}/accounts`,
      `https://api.polp.com.br/api/v2/sandbox/accounts/${ACCOUNT}/transactions`,
    ]);
  });

  it("uses the public institutions endpoint without credentials", async () => {
    vi.stubEnv("POLP_SANDBOX_CLIENT_ID", "");
    vi.stubEnv("POLP_SANDBOX_CLIENT_SECRET", "");
    await listPolpInstitutions();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.polp.com.br/api/v2/institutions");
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({});
  });

  it("rejects unconfigured secrets and invalid identifiers before networking", async () => {
    expect(() => requirePolpUuid("../consents")).toThrow("Identificador inválido");
    await expect(listSandboxAccounts("../consents")).rejects.toThrow("Identificador inválido");
    vi.stubEnv("POLP_SANDBOX_CLIENT_SECRET", "");
    await expect(createSandboxConsent(CONSENT)).rejects.toThrow("Configure as chaves");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retrieves all pages and investment transactions without leaving sandbox", async () => {
    const INVESTMENT = "550e8400-e29b-41d4-a716-446655440003";
    fetchMock.mockImplementation(async url => {
      const path = String(url);
      if (path.endsWith("/resources")) return new Response(JSON.stringify({ data: [{ type: "ACCOUNT", status: "AVAILABLE" }] }));
      if (path.endsWith("/accounts")) return new Response(JSON.stringify({ data: [{ id: ACCOUNT }], meta: { next_cursor: "next" } }));
      if (path.includes("/accounts?cursor=next")) return new Response(JSON.stringify({ data: [], meta: { next_cursor: null } }));
      if (path.endsWith("/consents/" + CONSENT + "/funds")) return new Response(JSON.stringify({ data: [{ id: INVESTMENT }] }));
      return new Response(JSON.stringify({ data: [] }));
    });
    const snapshot = await getSandboxSnapshot(CONSENT);
    expect(snapshot.accounts).toHaveLength(1);
    expect(snapshot.investments.funds).toHaveLength(1);
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes(`/funds/${INVESTMENT}/transactions`))).toBe(true);
    expect(fetchMock.mock.calls.every(call => String(call[0]).startsWith("https://api.polp.com.br/api/v2/sandbox/"))).toBe(true);
  });
});
