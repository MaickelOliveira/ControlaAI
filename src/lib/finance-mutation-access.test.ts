import { beforeEach, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, readModes: [] as unknown[] }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ from: () => {
  const filters = new Map<string, unknown>();
  let mutation: "delete" | "update" | undefined, patch: Record<string, unknown> = {};
  const execute = () => {
    const matches = storage.rows.filter(row => [...filters].every(([key, value]) => row[key] === value));
    if (mutation === "delete") storage.rows = storage.rows.filter(row => !matches.includes(row));
    if (mutation === "update") for (const row of matches) Object.assign(row, patch);
    if (!mutation) storage.readModes.push(...matches.map(row => row.mode));
    return { data: matches, error: null, count: matches.length };
  };
  const query = {
    eq: (key: string, value: unknown) => { filters.set(key, value); return query; },
    select: () => query,
    delete: () => { mutation = "delete"; return query; },
    update: (value: Record<string, unknown>) => { mutation = "update"; patch = value; return query; },
    maybeSingle: async () => { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
  };
  return query;
} }) }));
import { deleteFinance, findFinanceByDescription, updateFinance } from "./finances";
const row = (mode: "personal" | "business") => ({ id: `fixture-${mode}`, user_id: "fixture-owner", mode, type: "expense", amount: 50, category: "Outros", description: "Fixture payment", date: "2026-10-12", source: "web", pending: false });
beforeEach(() => { storage.rows = [row("personal"), row("business")]; storage.readModes = []; });

it("never deletes a personal record using a stale business selection", async () => {
  expect(await deleteFinance("fixture-personal", "fixture-owner", "business")).toBe(false);
  expect(storage.rows).toHaveLength(2);
});
it("never edits a personal record using a stale business selection", async () => {
  expect(await updateFinance("fixture-personal", "fixture-owner", { amount: 80 }, "business")).toBeNull();
  expect(storage.rows.find(item => item.id === "fixture-personal")?.amount).toBe(50);
});
it("refuses a restricted edit that tries to move its record into the other mode", async () => {
  expect(await updateFinance("fixture-business", "fixture-owner", { mode: "personal" }, "business")).toBeNull();
  expect(storage.rows.find(item => item.id === "fixture-business")?.mode).toBe("business");
});
it("keeps an allowed business write qualified by the owner and mode", async () => {
  expect(await updateFinance("fixture-business", "other-owner", { amount: 80 }, "business")).toBeNull();
  expect((await updateFinance("fixture-business", "fixture-owner", { amount: 80 }, "business"))?.amount).toBe(80);
  expect(await deleteFinance("fixture-business", "fixture-owner", "business")).toBe(true);
  expect(storage.rows.map(item => item.id)).toEqual(["fixture-personal"]);
});
it("reads only the allowed mode when searching instead of loading the other private records", async () => {
  expect((await findFinanceByDescription("fixture-owner", "business", "Fixture")).map(item => item.mode)).toEqual(["business"]);
  expect(storage.readModes).toEqual(["business"]);
});
it("preserves the existing cross-mode operation when there is no phone restriction", async () => {
  expect(await deleteFinance("fixture-personal", "fixture-owner")).toBe(true);
  expect((await updateFinance("fixture-business", "fixture-owner", { mode: "personal" }))?.mode).toBe("personal");
});
