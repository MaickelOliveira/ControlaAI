import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), cookieGet: vi.fn(), cookieSet: vi.fn(), list: vi.fn(), create: vi.fn(), require: vi.fn(), enabled: vi.fn(), rename: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionWithUser: mocks.auth }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet }) }));
vi.mock("@/lib/companies", () => ({ COMPANY_COOKIE: "zelo_company", multiCompanyEnabled: mocks.enabled, getCompanies: mocks.list, createCompany: mocks.create, requireCompany: mocks.require, renameCompany: mocks.rename }));
import { GET, PATCH, POST, PUT } from "./route";
const owner = "10000000-0000-4000-8000-000000000001", id = "20000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks(); mocks.enabled.mockReturnValue(true); mocks.auth.mockResolvedValue({ session: { role: "client" }, user: { id: owner } });
  mocks.cookieGet.mockReturnValue(undefined); mocks.list.mockResolvedValue([{ id, name: "Empresa A", isDefault: true }]);
  mocks.create.mockResolvedValue({ id, name: "Empresa nova" }); mocks.require.mockResolvedValue({ id, name: "Empresa A" });
});
const request = (method: string, body: unknown, origin = "https://zelo.test") => new Request("https://zelo.test/api/companies", { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
afterEach(()=>vi.unstubAllEnvs());
it("uses the configured public origin behind a proxy and ignores forged forwarding",async()=>{
 vi.stubEnv("OPEN_FINANCE_APP_ORIGIN","https://zelo.test");
 const proxied=(origin:string)=>new Request("http://localhost:3000/api/companies",{method:"PATCH",headers:{origin,"x-forwarded-host":"attacker.test","content-type":"application/json"},body:JSON.stringify({companyId:id})});
 expect((await PATCH(proxied("https://zelo.test"))).status).toBe(200);
 expect((await PATCH(proxied("https://attacker.test"))).status).toBe(403);
});
it("never exposes companies to a guest or administrator session", async () => {
  for (const auth of [null, { session: { role: "admin" }, user: { id: owner } }]) {
    mocks.auth.mockResolvedValue(auth); expect((await GET()).status).toBe(401);
  }
  expect(mocks.list).not.toHaveBeenCalled();
});
it("hides the selector and blocks mutations until full isolation is enabled", async () => {
  mocks.enabled.mockReturnValue(false);
  expect(await (await GET()).json()).toEqual({ enabled: false, companies: [] });
  expect((await POST(request("POST", { name: "Nova" }))).status).toBe(404);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("creates an empty company for the authenticated owner and stores an owner-bound selection", async () => {
  expect((await POST(request("POST", { name: "Nova", userId: "forged" }))).status).toBe(201);
  expect(mocks.create).toHaveBeenCalledWith(owner, "Nova");
  expect(mocks.cookieSet).toHaveBeenCalledWith("zelo_company", `${owner}:${id}`, expect.objectContaining({ httpOnly: true, sameSite: "lax" }));
});
it("does not switch to a foreign company or allow cross-site creation", async () => {
  mocks.require.mockRejectedValue(Error("COMPANY_NOT_FOUND"));
  expect((await PATCH(request("PATCH", { companyId: "foreign" }))).status).toBe(404);
  expect(mocks.cookieSet).not.toHaveBeenCalled();
  expect((await POST(request("POST", { name: "Nova" }, "https://other.test"))).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("does not leak selection from a different account and fails visibly when storage is unavailable", async () => {
  mocks.cookieGet.mockReturnValue({ value: `10000000-0000-4000-8000-000000000002:${id}` });
  expect((await (await GET()).json()).activeCompanyId).toBe(id);
  mocks.list.mockRejectedValue(Error("private DB detail"));
  const result = await GET(); expect(result.status).toBe(503); expect(await result.text()).not.toContain("private DB detail");
});

it("renames only the requested owner company and preserves the current selection", async () => {
  mocks.rename.mockResolvedValue({ id, name: "Novo nome" });
  const response = await PUT(request("PUT", { companyId: id, name: "Novo nome", userId: "forged" }));
  expect(response.status).toBe(200);
  expect(mocks.rename).toHaveBeenCalledWith(owner, id, "Novo nome");
  expect(mocks.cookieSet).not.toHaveBeenCalled();
});
it("rejects foreign companies, blank names and cross-site rename requests", async () => {
  mocks.rename.mockRejectedValue(Error("COMPANY_NOT_FOUND"));
  expect((await PUT(request("PUT", { companyId: "foreign", name: "Mesmo nome" }))).status).toBe(404);
  expect((await PUT(request("PUT", { companyId: id, name: " " }))).status).toBe(400);
  expect((await PUT(request("PUT", { companyId: id, name: "A".repeat(101) }))).status).toBe(400);
  expect((await PUT(request("PUT", { companyId: id, name: "Nome" }, "https://attacker.test"))).status).toBe(403);
  expect(mocks.rename).toHaveBeenCalledTimes(1);
});
