import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const userId = "10000000-0000-4000-8000-000000000001";
const companyId = "20000000-0000-4000-8000-000000000001";
const m = vi.hoisted(() => ({ links: vi.fn(), pending: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => { throw Error("outside fixture request"); } }));
vi.mock("./auth", () => ({ getAdminSession: vi.fn(), getSessionWithUser: vi.fn() }));
vi.mock("./users", () => ({ getUserById: async (id: string) => ({ id, activeMode: "business", locale: "pt-BR" }), hasAccess: () => true }));
vi.mock("./companies", () => ({ multiCompanyEnabled: () => true, getCompanies: async () => [{ id: "20000000-0000-4000-8000-000000000001", name: "Fixture company", isDefault: true }] }));
vi.mock("./wpp-phone-links", () => ({ getUserIdByPhone: async () => "10000000-0000-4000-8000-000000000001", getPhonesForUser: m.links, setPhoneWorkspace: vi.fn() }));
vi.mock("./conversations", () => ({ addMessage: vi.fn(), getAiPaused: async () => false, phoneVariants: (phone: string) => [phone] }));
vi.mock("./pending-actions", () => ({ getPendingAction: m.pending, setPendingAction: vi.fn(), clearPendingAction: vi.fn() }));
vi.mock("./whatsapp", () => ({ sendText: vi.fn() }));
import { withWhatsAppCompany } from "./whatsapp-company";
import { resolveCompanyContext } from "./company-context";
import { configureCompanyDatabaseScope, getSupabase } from "./supabase";

type Row = { id: string; user_id: string; company_id: string | null; mode: string; amount: number };
let data: Record<string, Row[]>;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("MULTI_COMPANY_ENABLED", "true");
  vi.stubEnv("SUPABASE_URL", "https://fixture-project.supabase.test"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-test-key");
  configureCompanyDatabaseScope(resolveCompanyContext);
  m.links.mockResolvedValue([{ userId, phone: "5511", access: "business", activeCompanyId: companyId, activeWorkspaceMode: "business" }]);
  m.pending.mockResolvedValue({ type: "finance_select", userId, workspaceMode: "business", companyId });
  data = Object.fromEntries(["finances", "accounts"].map(table => [table, [
    { id: `${table}-personal`, user_id: userId, mode: "personal", company_id: null, amount: 50 },
    { id: `${table}-business`, user_id: userId, mode: "business", company_id: companyId, amount: 80 },
  ]]));
  // Fictitious PostgREST transport: actual Supabase requests run through the
  // production company boundary; no database or credential is accessed.
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const table = url.pathname.split("/").at(-1)!;
    const predicate = url.searchParams.get("and") ?? "";
    const selected = data[table].filter(row =>
      (!url.searchParams.has("id") || url.searchParams.get("id") === `eq.${row.id}`) &&
      url.searchParams.get("user_id") === `eq.${row.user_id}` &&
      (predicate.includes("mode.eq.personal") || row.mode === "business") &&
      (row.company_id === null || row.company_id === companyId));
    if (init?.method === "PATCH") selected.forEach(row => Object.assign(row, JSON.parse(init.body as string)));
    if (init?.method === "DELETE") data[table] = data[table].filter(row => !selected.includes(row));
    return new Response(JSON.stringify(selected), { status: 200, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("keeps a dedicated business phone's real database queries and stale ID mutations outside personal rows", async () => {
  await withWhatsAppCompany({ from: "5511", text: "confirmar alteração" }, async () => {
    for (const table of ["finances", "accounts"]) {
      const read = await getSupabase().from(table).select("*");
      expect(read.error).toBeNull(); expect(read.data?.map(row => row.id)).toEqual([`${table}-business`]);
      const patch = await getSupabase().from(table).update({ amount: 999 }).eq("id", `${table}-personal`).select("*");
      expect(patch.error).toBeNull(); expect(patch.data).toEqual([]);
      const remove = await getSupabase().from(table).delete().eq("id", `${table}-personal`).select("*");
      expect(remove.error).toBeNull(); expect(remove.data).toEqual([]);
    }
  });
  expect(data.finances.find(row => row.mode === "personal")?.amount).toBe(50);
  expect(data.accounts.find(row => row.mode === "personal")?.amount).toBe(50);
});
