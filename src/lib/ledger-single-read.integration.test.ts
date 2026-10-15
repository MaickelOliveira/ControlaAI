import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Finance, FinanceMode } from "./finances";
import type { FinanceLedgerData } from "./finance-ledger";
import type { BankMovement } from "./open-finance-report";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({
  auth: vi.fn(), access: vi.fn(), records: vi.fn(), bank: vi.fn(), anchors: vi.fn(), phones: vi.fn(), accounts: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({getSessionWithUser: boundary.auth}));
vi.mock("@/lib/open-finance-access", () => ({getOpenFinanceAccess: boundary.access}));
vi.mock("@/lib/finances", async original => ({
  ...await original<typeof import("@/lib/finances")>(), getFinancesInRangeStrict: boundary.records,
}));
vi.mock("@/lib/finance-ledger-storage", () => ({readBankLedger: boundary.bank,readBankInstallmentAnchors: boundary.anchors}));
vi.mock("@/lib/wpp-phone-links", () => ({getPhonesForUser: boundary.phones}));
vi.mock("@/lib/accounts", () => ({getAccountsByUser: boundary.accounts}));

import { GET } from "../app/api/finances/ledger/route";

const owner = {id: "fictional-owner", name: "Titular fictício", activeMode: "business"};
const from = "2026-10-01", to = "2026-10-31";
const url = `https://zelo.test/api/finances/ledger?mode=business&from=${from}&to=${to}`;
const participantPhone = "5511000000011", foreignPhone = "5511000000022";

function recorded(id: string, patch: Partial<Finance> = {}): Finance {
  return {
    id, userId: owner.id, type: "expense", amount: 50, category: "Outros", description: `Lançamento fictício ${id}`,
    date: "2026-10-15", mode: "business", source: "web", status: "posted", registeredBy: owner.id,
    createdAt: "2026-10-12T12:00:00.000Z", ...patch,
  };
}

const history: Finance[] = [
  recorded("older-income", {type: "income", amount: 1000, date: "2026-08-15", category: "Vendas"}),
  recorded("before-period", {amount: 30, date: "2026-09-30"}),
  recorded("first-day", {amount: 40, date: from, category: "Saúde", source: "whatsapp", registeredBy: participantPhone,
    accountId: "fictional-manual-account"}),
  recorded("period-income", {type: "income", amount: 150, category: "Vendas"}),
  recorded("unknown-author", {amount: 5, date: "2026-10-16", source: "whatsapp", registeredBy: foreignPhone}),
  recorded("pending-expense", {amount: 999, date: "2026-10-20", status: "pending", source: "whatsapp", registeredBy: participantPhone}),
  recorded("last-day", {amount: 10, date: to}),
  recorded("after-period", {type: "income", amount: 200, date: "2026-11-01", category: "Vendas"}),
  recorded("future-pending", {type: "income", amount: 5000, date: "2026-11-15", status: "pending"}),
  recorded("other-mode", {amount: 7777, mode: "personal"}),
  recorded("other-owner", {amount: 8888, userId: "fictional-other-owner"}),
];

function bankMovement(id: string, patch: Partial<BankMovement> = {}): BankMovement {
  return {
    id, resource_id: "fictional-bank-account", resource_name: "Conta bancária fictícia", institution_name: "Banco fictício",
    resource_type: "account", date: "2026-10-15", description: "Compra fictícia", amount: "25.00", currency: "BRL",
    direction: "debit", classification: "purchase", kind: "account_debits", bill_month: null,
    installment_number: null, installment_count: null, ...patch,
  };
}

const movements = [
  bankMovement("debit"),
  bankMovement("card-purchase", {resource_type: "card", amount: "60.00", kind: "card_purchases"}),
  bankMovement("card-refund", {resource_type: "card", amount: "15.00", direction: "credit", kind: "credits", date: "2026-10-20"}),
  bankMovement("excluded-transfer", {amount: "1000.00", kind: "excluded", classification: "transfer", date: "2026-10-22"}),
  bankMovement("credit", {amount: "10.00", direction: "credit", kind: "credits", date: "2026-10-18"}),
];

beforeEach(() => {
  vi.resetAllMocks();
  boundary.auth.mockResolvedValue({session: {role: "client"}, user: owner});
  boundary.access.mockResolvedValue(null);
  // This fake reader has the same owner/mode and optional inclusive date boundaries as the real transport.
  boundary.records.mockImplementation(async (userId: string, mode: FinanceMode, start?: string, end?: string) =>
    structuredClone(history.filter(record => record.userId === userId && record.mode === mode
      && (!start || record.date >= start) && (!end || record.date <= end))),
  );
  boundary.bank.mockImplementation(async (_scope, period: {from: string; to: string}) => ({
    overview: {connections: []},
    report: {
      ...period, history_complete: false, totals: [],
      movements: structuredClone(movements.filter(movement => movement.date >= period.from && movement.date <= period.to)),
      next: null, missing_dates: 0, sync_pending: false, last_successful_sync_at: "2026-10-12T12:00:00.000Z",
    },
  }));
  boundary.anchors.mockResolvedValue({items:[],incomplete:false});
  boundary.phones.mockResolvedValue([
    {userId: owner.id, phone: participantPhone, name: "Participante fictícia", relation: "Funcionária"},
    {userId: "fictional-other-owner", phone: foreignPhone, name: "Contato externo fictício"},
  ]);
  boundary.accounts.mockResolvedValue([
    {id: "fictional-manual-account", name: "Carteira fictícia", type: "bank", userId: owner.id, internalField: "fictional-private-value"},
  ]);
});

describe("one complete manual snapshot for the real ledger GET", () => {
  it("preserves the inclusive statement, accumulated balance, pending/excluded entries and authors with one authorized manual read", async () => {
    const scope = {userId: owner.id, mode: "business", environment: "production", companyId: "fictional-authorized-company"};
    boundary.access.mockResolvedValue(scope);

    const response = await GET(new Request(`${url}&userId=fictional-other-owner&companyId=fictional-other-company`));
    expect(response.status).toBe(200);
    const payload = await response.json() as FinanceLedgerData;

    expect(payload.finances.map(entry => entry.id).sort()).toEqual([
      "first-day", "last-day", "period-income", "unknown-author", "pending-expense",
      "bank:debit", "bank:card-purchase", "bank:card-refund", "bank:excluded-transfer", "bank:credit",
    ].sort());
    expect(payload.finances.every(entry => entry.date >= from && entry.date <= to)).toBe(true);
    expect(payload.balance).toEqual({income: 160, expense: 125, balance: 35});
    // Accumulated manual balance includes both older and later posted records, independently of the visible period.
    expect(payload.totalBalance).toEqual({income: 1350, expense: 85, balance: 1265});
    expect(payload.finances.find(entry => entry.id === "pending-expense")).toMatchObject({
      status: "pending", included: false, amount: 999, registeredByName: "Participante fictícia",
    });
    expect(payload.finances.find(entry => entry.id === "bank:excluded-transfer")).toMatchObject({included: false, amount: 1000});
    expect(payload.finances.find(entry => entry.id === "bank:card-refund")).toMatchObject({type: "expense", amount: -15, included: true});
    expect(payload.finances.find(entry => entry.id === "first-day")).toMatchObject({
      source: "whatsapp", registeredByName: "Participante fictícia", accountId: "fictional-manual-account",
    });
    expect(payload.finances.find(entry => entry.id === "last-day")?.registeredByName).toBe("Titular fictício");
    expect(payload.finances.find(entry => entry.id === "unknown-author")?.registeredByName).toBeUndefined();
    expect(payload.finances.filter(entry => entry.source === "bank").every(entry => !entry.registeredByName)).toBe(true);
    expect(payload.accounts).toEqual([{id: "fictional-manual-account", name: "Carteira fictícia", type: "bank"}]);
    expect(payload.installmentAnchors).toEqual({items:[],incomplete:false});
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(participantPhone);
    expect(serialized).not.toContain(foreignPhone);
    expect(serialized).not.toContain("Contato externo fictício");
    expect(serialized).not.toContain("fictional-private-value");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(boundary.access).toHaveBeenCalledExactlyOnceWith(owner, "business", {throwOnStorageError: true});
    expect(boundary.bank).toHaveBeenCalledExactlyOnceWith(scope, {from, to});
    expect(boundary.anchors).toHaveBeenCalledExactlyOnceWith(scope);
    expect(boundary.phones).toHaveBeenCalledExactlyOnceWith(owner.id);
    expect(boundary.accounts).toHaveBeenCalledExactlyOnceWith(owner.id, "business");
    expect(boundary.records).toHaveBeenCalledExactlyOnceWith(owner.id, "business");
  });

  it("returns 503 instead of a partial ledger if the complete manual history read fails", async () => {
    boundary.access.mockResolvedValue({userId: owner.id, mode: "business", environment: "production"});
    boundary.records.mockImplementation(async (_userId: string, _mode: FinanceMode, start?: string) => {
      if (!start) throw new Error("FICTIONAL_INCOMPLETE_HISTORY_PAGE");
      return [];
    });

    const response = await GET(new Request(url));
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload).toEqual({error: expect.any(String)});
    expect(JSON.stringify(payload)).not.toContain("FICTIONAL_INCOMPLETE_HISTORY_PAGE");
    expect(payload).not.toHaveProperty("finances");
    expect(payload).not.toHaveProperty("totalBalance");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(boundary.records).toHaveBeenCalledExactlyOnceWith(owner.id, "business");
  });

  it.each([
    {date: from, id: "first-day", expense: 40},
    {date: to, id: "last-day", expense: 10},
  ])("includes the boundary day $date when both period endpoints equal that day", async ({date, id, expense}) => {
    const response = await GET(new Request(`https://zelo.test/api/finances/ledger?mode=business&from=${date}&to=${date}`));
    expect(response.status).toBe(200);
    const payload = await response.json() as FinanceLedgerData;
    expect(payload.finances.map(entry => entry.id)).toEqual([id]);
    expect(payload.balance).toEqual({income: 0, expense, balance: -expense});
    expect(payload.totalBalance).toEqual({income: 1350, expense: 85, balance: 1265});
    expect(boundary.bank).not.toHaveBeenCalled();
    expect(boundary.records).toHaveBeenCalledExactlyOnceWith(owner.id, "business");
  });

  it("reads only the authenticated manual workspace and no bank when the client has no bank access", async () => {
    const response = await GET(new Request(`${url}&userId=fictional-other-owner`));
    expect(response.status).toBe(200);
    const payload = await response.json() as FinanceLedgerData;
    expect(payload.bank).toBeNull();
    expect(payload.finances.map(entry => entry.id).sort()).toEqual([
      "first-day", "last-day", "period-income", "unknown-author", "pending-expense",
    ].sort());
    expect(payload.balance).toEqual({income: 150, expense: 55, balance: 95});
    expect(payload.totalBalance).toEqual({income: 1350, expense: 85, balance: 1265});
    expect(boundary.bank).not.toHaveBeenCalled();
    expect(boundary.records).toHaveBeenCalledExactlyOnceWith(owner.id, "business");
  });

  it.each([null, {session: {role: "admin"}, user: owner}])("does not read manual or bank data for an unauthorized session: %j", async auth => {
    boundary.auth.mockResolvedValue(auth);
    const response = await GET(new Request(url));
    expect(response.status).toBe(401);
    expect(boundary.access).not.toHaveBeenCalled();
    expect(boundary.records).not.toHaveBeenCalled();
    expect(boundary.bank).not.toHaveBeenCalled();
    expect(boundary.phones).not.toHaveBeenCalled();
    expect(boundary.accounts).not.toHaveBeenCalled();
  });
});
