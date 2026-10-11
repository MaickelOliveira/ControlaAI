import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ from: mock.from }) }));
import { renameCompany } from "./companies";
it("renames by owner and company ID even when both owners use the same name", async () => {
 const rows = [
  { id: "a", user_id: "owner-a", name: "Empresa", document: "123", is_default: true, created_at: "2026-10-11", bank_id: "bank-a" },
  { id: "b", user_id: "owner-b", name: "Empresa", document: "456", is_default: true, created_at: "2026-10-11", bank_id: "bank-b" },
 ];
 mock.from.mockImplementation(() => {
  let targets = rows; let patch: Record<string, unknown> = {};
  const query = {
   update: (value: Record<string, unknown>) => { patch = value; return query; },
   eq: (key: string, value: string) => { targets = targets.filter(row => row[key as keyof typeof row] === value); return query; },
   is: (key:string,value:null)=>{targets=targets.filter(row=>(row[key as keyof typeof row]??null)===value);return query;},
   select: () => query,
   maybeSingle: async () => { for (const row of targets) Object.assign(row, patch); return { data: targets[0] ?? null, error: null }; },
  };
  return query;
 });
 await expect(renameCompany("owner-a", "b", "Invasão")).rejects.toThrow("COMPANY_NOT_FOUND");
 expect((await renameCompany("owner-a", "a", "  Minha empresa  ")).name).toBe("Minha empresa");
 expect(rows[0]).toMatchObject({ id: "a", user_id: "owner-a", name: "Minha empresa", document: "123", bank_id: "bank-a" });
 expect(rows[1]).toMatchObject({ name: "Empresa", bank_id: "bank-b" });
 await expect(renameCompany("owner-a", "a", " ")).rejects.toThrow("COMPANY_INVALID");
});
