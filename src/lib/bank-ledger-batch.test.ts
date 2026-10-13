import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenFinanceScope } from "./open-finance-access";
import type { BankOverview } from "./open-finance-display";
import type { BankMovement, BankReport } from "./open-finance-report";

vi.mock("server-only", () => ({}));
const boundary = vi.hoisted(() => ({rpc: vi.fn(), requestScope: vi.fn(), fetch: vi.fn()}));
vi.mock("./open-finance-http", () => ({
  openFinanceRpc: boundary.rpc, openFinanceRequestScope: boundary.requestScope,
  OF_HEADERS: {"Cache-Control": "private, no-store"},
}));

import { readBankLedger } from "./finance-ledger-storage";
import { GET as paginatedReport } from "../app/api/open-finance/report/route";

const period = {from: "2026-10-01", to: "2026-10-31"};
const scope: OpenFinanceScope = {
  userId: "fictional-owner", mode: "business", environment: "production",
  companyId: "fictional-company", companyName: "Empresa fictícia",
};
const overview: BankOverview = {
  connections: [{
    id: "fictional-connection", institution_name: "Banco fictício", status: "active", provider_status: "AUTHORIZED",
    scopes: ["ACCOUNT", "CREDIT_CARD_ACCOUNT"], consent_expires_at: "2027-10-01T00:00:00.000Z", revoked_at: null,
    last_successful_sync_at: "2026-10-12T12:00:00.000Z", created_at: "2026-10-01T12:00:00.000Z",
    sync_notes: ["Aviso de importação fictício"], archived_at: null, has_imported_data: true,
  }],
  resources: [], limits: [], bills: [], credit: [],
  sync: [{status: "queued", last_successful_sync_at: "2026-10-12T12:00:00.000Z", covered_from: period.from, covered_to: period.to}],
  truncated: false,
};

function movement(index: number): BankMovement {
  const base: BankMovement = {
    id: `10000000-0000-4000-8000-${String(999999 - index).padStart(12, "0")}`,
    resource_id: "fictional-account", resource_name: "Conta fictícia", institution_id: "fictional-institution",
    institution_name: "Banco fictício", resource_type: "account", date: "2026-10-11", description: `Movimento fictício ${index}`,
    amount: "127.43000000", currency: "BRL", direction: "debit", classification: "purchase", kind: "account_debits",
    source_type: "PAYMENT", source_category: "GENERAL_MERCHANDISE_OTHER", user_category: null,
    credit_reconciliation: null, bill_month: null, installment_number: null, installment_count: null,
  };
  switch (index % 6) {
    case 0:
      return {...base, amount: null, currency: null, direction: "unknown", classification: "unknown", kind: "other", source_category: null};
    case 1:
      return {...base, resource_type: "card", kind: "card_purchases", bill_month: "2026-10", installment_number: 2, installment_count: 6};
    case 2:
      return {...base, resource_type: "card", direction: "credit", kind: "credits", classification: "refund", amount: "9.50000000", bill_month: "2026-10"};
    case 3:
      return {...base, kind: "excluded", classification: "transfer", user_category: "Delivery"};
    case 4:
      return {...base, amount: "650.00", credit_reconciliation: {
        id: `fictional-reconciliation-${index}`, status: "active", role: "payment",
        gross_amount: "650.00", payment_amount: "650.00", charges_amount: "6.25",
      }};
    default:
      return {...base, currency: "USD", user_category: "Projeto fictício", amount: "9999999999999999.12000000"};
  }
}

function report(size: number): BankReport {
  return {
    ...period, history_complete: false, movements: Array.from({length: size}, (_, index) => movement(index)), next: null,
    totals: [
      {kind: "account_debits", currency: "BRL", amount: "1234567890123456.12000000", count: size, missing_amounts: 0},
      {kind: "card_purchases", currency: "BRL", amount: "127.43000000", count: size ? 1 : 0, missing_amounts: 0},
      {kind: "credits", currency: "BRL", amount: "9.50000000", count: size ? 1 : 0, missing_amounts: 0},
      {kind: "excluded", currency: "BRL", amount: "127.43000000", count: size ? 1 : 0, missing_amounts: 0},
      {kind: "other", currency: null, amount: null, count: size ? 1 : 0, missing_amounts: size ? 1 : 0},
    ],
    missing_dates: 4, sync_pending: true, last_successful_sync_at: "2026-10-12T12:00:00.000Z",
  };
}

let storedReport: BankReport;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPEN_FINANCE_BATCH_REPORT_ENABLED", "true");
  vi.stubEnv("MULTI_COMPANY_ENABLED", "true");
  boundary.fetch.mockImplementation(() => { throw new Error("REAL_TRANSPORT_FORBIDDEN"); });
  vi.stubGlobal("fetch", boundary.fetch);
  boundary.requestScope.mockResolvedValue(scope);
  storedReport = report(51);
  // Both contracts are simulated so the pre-fix reader can reproduce its actual 50-row serial pagination.
  boundary.rpc.mockImplementation(async (_scope: OpenFinanceScope, operation: string, params: Record<string, unknown>) => {
    if (operation === "zelo_of_overview") return structuredClone(overview);
    if (operation === "zelo_of_ledger_report") return structuredClone(storedReport);
    if (operation === "zelo_of_report") {
      const offset = params.p_after == null ? 0 : storedReport.movements.findIndex(row => row.id === params.p_after) + 1;
      const rows = storedReport.movements.slice(offset, offset + 50);
      const next = offset + rows.length < storedReport.movements.length ? rows.at(-1)!.id : null;
      return structuredClone({...storedReport, movements: rows, next});
    }
    throw new Error("UNEXPECTED_FICTIONAL_RPC");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("complete saved bank ledger batch reads", () => {
  it.each([0, 1, 50, 51, 2000])("preserves all %i movements and metadata using one report RPC plus overview", async size => {
    storedReport = report(size);
    const before = structuredClone(storedReport);
    const result = await readBankLedger(scope, period);

    expect(result.report).toEqual(before);
    expect(result.report.movements).toHaveLength(size);
    expect(result.report.movements.map(row => row.id)).toEqual(before.movements.map(row => row.id));
    expect(result.overview).toEqual(overview);
    expect(storedReport).toEqual(before);
    expect(boundary.fetch).not.toHaveBeenCalled();
    expect(boundary.rpc).toHaveBeenCalledTimes(2);
    expect(boundary.rpc).toHaveBeenCalledWith(scope, "zelo_of_ledger_report", {p_from: period.from, p_to: period.to});
    expect(boundary.rpc).toHaveBeenCalledWith(scope, "zelo_of_overview", {p_environment: scope.environment});
    expect(boundary.rpc.mock.calls.filter(([, operation]) => operation === "zelo_of_report")).toHaveLength(0);
  });

  it("rejects more than 2000 movements instead of returning a truncated successful ledger", async () => {
    storedReport = report(2001);

    await expect(readBankLedger(scope, period)).rejects.toThrow("OF_LEDGER_LIMIT");
    expect(boundary.fetch).not.toHaveBeenCalled();
    expect(boundary.rpc).toHaveBeenCalledTimes(2);
    expect(boundary.rpc).toHaveBeenCalledWith(scope, "zelo_of_ledger_report", {p_from: period.from, p_to: period.to});
    expect(boundary.rpc.mock.calls.filter(([, operation]) => operation === "zelo_of_report")).toHaveLength(0);
  });

  it("propagates a failed saved report read instead of providing a partial result or contacting the provider", async () => {
    const failure = new Error("FICTIONAL_STORAGE_UNAVAILABLE");
    boundary.rpc.mockImplementation(async (_scope: OpenFinanceScope, operation: string) => {
      if (operation === "zelo_of_overview") return structuredClone(overview);
      throw failure;
    });

    await expect(readBankLedger(scope, period)).rejects.toBe(failure);
    expect(boundary.fetch).not.toHaveBeenCalled();
    expect(boundary.rpc).toHaveBeenCalledWith(scope, "zelo_of_ledger_report", {p_from: period.from, p_to: period.to});
    expect(boundary.rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects the bounded SQL overflow cursor instead of accepting its first 2000 rows", async () => {
    storedReport = {...report(2000), next: movement(1999).id};
    await expect(readBankLedger(scope, period)).rejects.toThrow("OF_LEDGER_LIMIT");
    expect(boundary.rpc).toHaveBeenCalledTimes(2);
    expect(boundary.fetch).not.toHaveBeenCalled();
  });

  it.each([
    {...scope, userId: "fictional-owner-a", companyId: "fictional-company-a", mode: "business"},
    {...scope, userId: "fictional-owner-b", companyId: "fictional-company-a", mode: "business"},
    {...scope, userId: "fictional-owner-a", companyId: "fictional-company-b", mode: "business"},
    {...scope, userId: "fictional-owner-a", companyId: "fictional-company-a", mode: "personal"},
  ] satisfies OpenFinanceScope[])("passes the complete owner/company/mode scope for $userId/$companyId/$mode", async authorizedScope => {
    storedReport = report(1);
    const result = await readBankLedger(authorizedScope, period);

    expect(result.report).toEqual(storedReport);
    expect(boundary.rpc).toHaveBeenCalledWith(authorizedScope, "zelo_of_ledger_report", {p_from: period.from, p_to: period.to});
    expect(boundary.rpc).toHaveBeenCalledWith(authorizedScope, "zelo_of_overview", {p_environment: authorizedScope.environment});
    expect(boundary.rpc.mock.calls.every(([actualScope]) => actualScope === authorizedScope)).toBe(true);
    expect(boundary.rpc).toHaveBeenCalledTimes(2);
    expect(boundary.fetch).not.toHaveBeenCalled();
  });

  it("keeps the existing paginated ledger reader when the batch rollout flag is disabled", async () => {
    vi.stubEnv("OPEN_FINANCE_BATCH_REPORT_ENABLED", "false");
    const result = await readBankLedger(scope, period);

    expect(result.report).toEqual(storedReport);
    expect(boundary.rpc.mock.calls.filter(([, operation]) => operation === "zelo_of_ledger_report")).toHaveLength(0);
    expect(boundary.rpc.mock.calls.filter(([, operation]) => operation === "zelo_of_report")).toHaveLength(2);
    expect(boundary.rpc).toHaveBeenCalledWith(scope, "zelo_of_report", {p_from: period.from, p_to: period.to, p_after: null});
    expect(boundary.rpc).toHaveBeenCalledTimes(3);
    expect(boundary.fetch).not.toHaveBeenCalled();
  });
});

describe("existing paginated report HTTP contract", () => {
  it.each([false, true])("keeps zelo_of_report and its 50-row cursor contract with after=%s, including while batch is enabled", async afterFirstPage => {
    const after = afterFirstPage ? storedReport.movements[49].id : null;
    const request = new Request(`https://zelo.test/api/open-finance/report?mode=business&from=${period.from}&to=${period.to}${after ? `&after=${after}` : ""}`);
    const response = await paginatedReport(request);

    expect(response.status).toBe(200);
    const result = await response.json() as {report: BankReport; overview: BankOverview};
    expect(result.report).toEqual({
      ...storedReport, movements: storedReport.movements.slice(afterFirstPage ? 50 : 0, afterFirstPage ? 51 : 50),
      next: afterFirstPage ? null : storedReport.movements[49].id,
    });
    expect(result.overview).toEqual(overview);
    expect(boundary.rpc).toHaveBeenCalledWith(scope, "zelo_of_report", {p_from: period.from, p_to: period.to, p_after: after});
    expect(boundary.rpc.mock.calls.filter(([, operation]) => operation === "zelo_of_ledger_report")).toHaveLength(0);
    expect(boundary.rpc).toHaveBeenCalledTimes(2);
    expect(boundary.fetch).not.toHaveBeenCalled();
  });
});
