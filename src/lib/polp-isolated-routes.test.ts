import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { COOKIE, issueSession } from "../../sandbox-app/access";
import { GET, POST } from "../../sandbox-app/app/api/admin/polp-sandbox/route";
import { POST as login } from "../../sandbox-app/app/api/session/route";

const api = vi.hoisted(() => ({institutions:vi.fn(),create:vi.fn()}));
vi.mock("@/lib/polp-sandbox", async original => ({
  ...await original<typeof import("./polp-sandbox")>(),
  listPolpInstitutions:api.institutions,
  createSandboxConsent:api.create,
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("POLP_SANDBOX_ENABLED","true");
  vi.stubEnv("POLP_SANDBOX_CLIENT_ID","fake-client");
  vi.stubEnv("POLP_SANDBOX_CLIENT_SECRET","fake-secret");
  vi.stubEnv("SANDBOX_ACCESS_CODE","a".repeat(64));
  vi.stubEnv("SANDBOX_APP_URL","https://sandbox.example.test");
});
afterEach(() => vi.unstubAllEnvs());

describe("private sandbox API", () => {
  it("denies anonymous reads and writes without calling Polp", async () => {
    expect((await GET(new NextRequest("https://sandbox.example.test/api/admin/polp-sandbox?action=institutions"))).status).toBe(401);
    expect((await POST(new NextRequest("https://sandbox.example.test/api/admin/polp-sandbox",{method:"POST"}))).status).toBe(401);
    expect(api.institutions).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
  });
  it("returns sandbox data only with an isolated valid session", async () => {
    api.institutions.mockResolvedValue({data:[{id:"bank",name:"Fictício"}]});
    const request = new NextRequest("https://sandbox.example.test/api/admin/polp-sandbox?action=institutions",{headers:{cookie:`${COOKIE}=${issueSession()}`}});
    expect(await (await GET(request)).json()).toEqual({data:[{id:"bank",name:"Fictício"}]});
    vi.stubEnv("SUPABASE_URL","https://production.example");
    expect((await GET(request)).status).toBe(401);
  });
  it("blocks cross-origin creation even with a valid session", async () => {
    const request = new NextRequest("https://sandbox.example.test/api/admin/polp-sandbox",{method:"POST",headers:{origin:"https://untrusted.example",cookie:`${COOKIE}=${issueSession()}`},body:JSON.stringify({institutionId:"bank"})});
    expect((await POST(request)).status).toBe(403);
    expect(api.create).not.toHaveBeenCalled();
  });
  it("issues a secure sandbox-only cookie without returning the access code", async () => {
    const request = new NextRequest("https://sandbox.example.test/api/session",{method:"POST",headers:{origin:"https://sandbox.example.test"},body:JSON.stringify({code:"a".repeat(64)})});
    const response = await login(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ok:true});
    const cookie = response.headers.get("set-cookie") || "";
    expect(cookie).toContain(COOKIE+"=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).not.toContain("a".repeat(64));
  });
});
