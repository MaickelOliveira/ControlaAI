import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), state: vi.fn(), exchange: vi.fn(), finish:vi.fn(), cookies:vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.session }));
vi.mock("@/lib/google-oauth", () => ({ resolveState: mocks.state, exchangeCode: mocks.exchange }));
vi.mock("@/lib/google-workspace-oauth",()=>({finishGoogleWorkspaceAuthorization:mocks.finish}));
vi.mock("next/headers",()=>({cookies:mocks.cookies}));
import { GET } from "./route";

const callback = () => new NextRequest("https://zelogestaointeligente.com.br/api/auth/google/callback?code=fixture-code&state=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1");
const scopedState="a".repeat(43);
const scopedCallback=(query=`state=${scopedState}&code=fixture-code`)=>new NextRequest(`https://zelogestaointeligente.com.br/api/auth/google/callback?${query}`);
const technicalCallback=(query=`state=${scopedState}&code=fixture-code`)=>new NextRequest(`https://lp-controlaai.ztcjzs.easypanel.host/api/auth/google/callback?${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ sub: "fixture-owner", role: "client" });
  mocks.state.mockReturnValue({ userId: "fixture-owner", locale: "pt-BR" });
  mocks.exchange.mockResolvedValue(undefined);
  mocks.cookies.mockResolvedValue({get:()=>({value:"fictitious-private-session"})});
  mocks.finish.mockResolvedValue({locale:"es",cancelled:false,workspace:{userId:"fixture-owner",mode:"business",companyId:"fictitious-original-company"},binding:{}});
});

describe("Persistent scoped callback",()=>{
 it("returns a technical-host callback to the public host before reading its host-only session",async()=>{
  const response=await GET(technicalCallback());
  expect(response.headers.get("location")).toBe(`https://zelogestaointeligente.com.br/api/auth/google/callback?state=${scopedState}&code=fixture-code&_zelo_public=1`);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(mocks.session).not.toHaveBeenCalled();expect(mocks.finish).not.toHaveBeenCalled();
  const returned=await GET(new NextRequest(response.headers.get("location")!));
  expect(mocks.finish).toHaveBeenCalledExactlyOnceWith("fixture-owner","fictitious-private-session",scopedState,"fixture-code");
  expect(returned.headers.get("location")).toBe("https://zelogestaointeligente.com.br/es/dashboard/configuracoes");
 });
 it("forwards only the state and refusal, never provider details or a stray code",async()=>{
  const response=await GET(technicalCallback(`state=${scopedState}&error=access_denied&code=ignored&error_description=private-detail`));
  expect(response.headers.get("location")).toBe(`https://zelogestaointeligente.com.br/api/auth/google/callback?state=${scopedState}&error=access_denied&_zelo_public=1`);
  expect(mocks.session).not.toHaveBeenCalled();expect(mocks.finish).not.toHaveBeenCalled();
 });
 it("does not relay an invalid state from a technical host",async()=>{
  const response=await GET(technicalCallback("state=invalid&code=private-code"));
  expect(response.headers.get("location")).toBe("https://zelogestaointeligente.com.br/dashboard/configuracoes?google=failed");
  expect(response.headers.get("location")).not.toContain("private-code");
 });
 it("does not relay a malformed provider code",async()=>{
  const response=await GET(technicalCallback(`state=${scopedState}&code=private%0Acode`));
  expect(response.headers.get("location")).toBe("https://zelogestaointeligente.com.br/dashboard/configuracoes?google=failed");
  expect(mocks.finish).not.toHaveBeenCalled();
 });
 it("finishes solely with the authenticated owner/session and original persistent state",async()=>{
  const response=await GET(scopedCallback());expect(mocks.finish).toHaveBeenCalledExactlyOnceWith("fixture-owner","fictitious-private-session",scopedState,"fixture-code");
  expect(response.headers.get("location")).toBe("https://zelogestaointeligente.com.br/es/dashboard/configuracoes");expect(mocks.state).not.toHaveBeenCalled();expect(mocks.exchange).not.toHaveBeenCalled();expect(response.headers.get("cache-control")).toBe("private, no-store");
 });
 it.each([null,{sub:"fixture-owner",role:"admin"}])("requires an active client session before consuming state %#",async session=>{
  mocks.session.mockResolvedValue(session);await GET(scopedCallback());expect(mocks.finish).not.toHaveBeenCalled();expect(mocks.state).not.toHaveBeenCalled();expect(mocks.exchange).not.toHaveBeenCalled();
 });
 it("requires the authenticated browser cookie without disclosing it",async()=>{
  mocks.cookies.mockResolvedValue({get:()=>undefined});const response=await GET(scopedCallback());expect(mocks.finish).not.toHaveBeenCalled();expect(await response.text()).not.toContain("private-session");
 });
 it("consumes a declined authorization once without code exchange",async()=>{
  mocks.finish.mockResolvedValue({locale:"pt-PT",cancelled:true,binding:null});const response=await GET(scopedCallback(`state=${scopedState}&error=access_denied&code=ignored&error_description=fictitious-sensitive`));
  expect(mocks.finish).toHaveBeenCalledExactlyOnceWith("fixture-owner","fictitious-private-session",scopedState,null);expect(response.headers.get("location")).toBe("https://zelogestaointeligente.com.br/pt/dashboard/configuracoes?google=cancelled");expect(mocks.exchange).not.toHaveBeenCalled();
 });
 it("consumes a missing-code cancellation through the persistent finisher",async()=>{
  await GET(scopedCallback(`state=${scopedState}`));expect(mocks.finish).toHaveBeenCalledWith("fixture-owner","fictitious-private-session",scopedState,null);
 });
 it("never falls back to legacy after an expired, replayed or foreign persistent state",async()=>{
  mocks.finish.mockRejectedValue(Error("fictitious-private-provider-error"));const response=await GET(scopedCallback());expect(response.headers.get("location")).toBe("https://zelogestaointeligente.com.br/dashboard/configuracoes?google=failed");expect(mocks.state).not.toHaveBeenCalled();expect(mocks.exchange).not.toHaveBeenCalled();
 });
 it.each([`state=${scopedState}&state=${scopedState}&code=fixture`, `state=${scopedState}&code=one&code=two`, `state=${scopedState}&error=one&error=two`, "state=malformed&code=fixture", "code=fixture"])("rejects ambiguous or malformed callback identity before either broker %#",async query=>{
  await GET(scopedCallback(query));expect(mocks.finish).not.toHaveBeenCalled();expect(mocks.state).not.toHaveBeenCalled();expect(mocks.exchange).not.toHaveBeenCalled();
 });
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
