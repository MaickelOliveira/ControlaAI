import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), state: vi.fn(), exchange: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/google-oauth", () => ({ resolveState: mocks.state, exchangeCode: mocks.exchange }));
import { GET } from "./route";

const callback = () => new NextRequest("https://zelo.example/api/auth/google/callback?code=fixture-code&state=fixture-nonce");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ sub: "fixture-owner", role: "client" });
  mocks.state.mockReturnValue({ userId: "fixture-owner", locale: "pt-BR" });
  mocks.exchange.mockResolvedValue(undefined);
});

describe("Google callback owner boundary", () => {
  it.each([
    ["without an active session", null],
    ["with another client's session", { sub: "fixture-other-owner", role: "client" }],
    ["with an administrator session", { sub: "fixture-owner", role: "admin" }],
  ])("rejects a callback %s without exchanging or storing Google tokens", async (_label, session) => {
    // getSession also returns null after expiry, deactivation or password reset.
    mocks.session.mockResolvedValue(session);
    const response = await GET(callback());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://zelogestaointeligente.com.br/dashboard/configuracoes");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it.each([
    ["pt-BR", "/dashboard/configuracoes"],
    ["pt-PT", "/pt/dashboard/configuracoes"],
    ["es", "/es/dashboard/configuracoes"],
  ])("connects only the authenticated owner and preserves the %s return route", async (locale, path) => {
    mocks.state.mockReturnValue({ userId: "fixture-owner", locale });
    const response = await GET(callback());
    expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith("fixture-code", "fixture-owner");
    expect(response.headers.get("location")).toBe(`https://zelogestaointeligente.com.br${path}`);
  });

  it("rejects an absent, expired or replayed nonce before token exchange", async () => {
    mocks.state.mockReturnValue(null);
    expect((await GET(callback())).status).toBe(307);
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it("does not expose a provider error containing credentials in diagnostic output", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.exchange.mockRejectedValue(new Error("fixture-sensitive-token-do-not-log"));
      const response = await GET(callback());
      expect(response.status).toBe(307);
      const diagnostic = log.mock.calls.flat().map(value => value instanceof Error ? value.message : String(value)).join(" ");
      expect(diagnostic).not.toContain("fixture-sensitive-token-do-not-log");
    } finally { log.mockRestore(); }
  });
});
