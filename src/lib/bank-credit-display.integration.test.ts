import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DashboardCredit from "@/components/DashboardCredit";
import BankDashboard from "@/components/BankDashboard";
import OpenFinanceResources from "@/components/OpenFinanceResources";
import { formatBankQuestion } from "./bank-question-answer";
import type { BankOverview, BankLimit } from "./open-finance-display";
import type { BankReport } from "./open-finance-report";

const names = ["Compras fictícias", "Saque nacional fictício", "Saque exterior fictício"];
function fixture(): BankOverview {
  const limits: BankLimit[] = names.flatMap((line_name, index) => [0, 1].map(copy => ({
    id: `source-${index}-${copy}`, resource_id: "fictional-card", line_name,
    consolidation_type: "COMPARTILHADO", currency: "BRL", available_amount: "731.25",
    used_amount: "268.75", total_amount: "1000", is_flexible: false,
  })));
  return {
    connections: [{ id: "fictional-connection", institution_name: "Banco fictício", status: "active",
      provider_status: "AUTHORISED", scopes: [], consent_expires_at: null, revoked_at: null,
      last_successful_sync_at: null, created_at: "2026-10-12" }],
    resources: [{ id: "fictional-card", connection_id: "fictional-connection", resource_type: "card",
      name: "Cartão fictício", subtype: "credit-cards", card_network: null, identification_last4: "1234",
      currency: "BRL", available_amount: null, gross_amount: null, net_amount: null,
      valuation_date: null, synced_at: "2026-10-12" }],
    limits, bills: [], credit: [], sync: [],
  };
}
const report: BankReport = { from: "2026-10-01", to: "2026-10-31", history_complete: false,
  totals: [], movements: [], next: null, missing_dates: 0, sync_pending: false, last_successful_sync_at: null };
const question = { kind: "limits" as const, from: "2026-10-01", to: "2026-10-31" };
const renderers: Array<[string, (data: BankOverview) => string]> = [
  ["DashboardCredit", data => {
    const html = renderToStaticMarkup(React.createElement(DashboardCredit, { overview: data }));
    return html.match(/<section\b[^>]*aria-label="Limites e faturas"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? "";
  }],
  ["BankDashboard", overview => renderToStaticMarkup(React.createElement(BankDashboard, { data: { overview, report }, entries: [] }))],
  ["OpenFinanceResources", data => renderToStaticMarkup(React.createElement(OpenFinanceResources, { data, mode: "personal" })).replace(/<summary\b[^>]*>[\s\S]*?<\/summary>/g, "")],
];

describe("credit-line grouping at the display boundaries", () => {
  it.each(renderers)("%s turns six duplicate records into three named lines with transparent source counts", (_name, render) => {
    const data = fixture();
    const before = JSON.stringify(data);
    const html = render(data).replace(/\s/g, " ");
    for (const name of names) expect(html.split(name)).toHaveLength(2);
    expect(html.match(/2 registros iguais do banco/g)).toHaveLength(3);
    expect(html).toContain("731,25");
    expect(html).not.toContain("1.462,50");
    expect(html).not.toContain("4.387,50");
    expect(JSON.stringify(data)).toBe(before);
    expect(data.limits).toHaveLength(6);
  });

  it("WhatsApp lists each named shared line once without changing the stored overview or adding credit", () => {
    const data = fixture();
    const before = JSON.stringify(data);
    const text = formatBankQuestion(data, question, "Empresa fictícia");
    for (const name of names) expect(text.split(name)).toHaveLength(2);
    expect(text.match(/Disponível:/g)).toHaveLength(3);
    expect(text.match(/731,25/g)).toHaveLength(3);
    expect(text).toContain("Empresa fictícia");
    expect(text).toContain("não são somados");
    expect(text).not.toContain("1.462,50");
    expect(text).not.toContain("4.387,50");
    expect(JSON.stringify(data)).toBe(before);
  });

  it("WhatsApp preserves unknown amounts and separate cards even when the line labels match", () => {
    const data = fixture();
    data.resources.push({ ...data.resources[0], id: "second-card", name: "Segundo cartão fictício", identification_last4: "5678" });
    data.limits = [
      { ...data.limits[0], available_amount: null },
      { ...data.limits[1], available_amount: null },
      { ...data.limits[0], id: "second-source", resource_id: "second-card", available_amount: "0" },
    ];
    const text = formatBankQuestion(data, question, "Pessoal").replace(/\s/g, " ");
    expect(text.match(/Disponível:/g)).toHaveLength(2);
    expect(text).toContain("Disponível: Não informado");
    expect(text).toContain("Disponível: R$ 0,00");
    expect(text).toContain("final 1234");
    expect(text).toContain("final 5678");
  });
});
