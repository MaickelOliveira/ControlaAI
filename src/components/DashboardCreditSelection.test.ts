import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DashboardCredit from "./DashboardCredit";
import type { BankBill, BankLimit, BankOverview, BankResource } from "@/lib/open-finance-display";

const resource = (id: string, suffix: string): BankResource => ({
  id, connection_id: "fixture-bank", resource_type: "card", name: `Cartão fictício ${suffix}`,
  subtype: "credit-cards", card_network: null, identification_last4: suffix,
  currency: null, available_amount: null, gross_amount: null, net_amount: null,
  valuation_date: null, synced_at: "2026-10-11",
});
const line = (id: string, resource_id: string, amount: string | null): BankLimit => ({
  id, resource_id, line_name: `Linha ${id}`, consolidation_type: "COMPARTILHADO",
  currency: "BRL", available_amount: amount, total_amount: null, used_amount: null, is_flexible: false,
});
const bill = (id: string, resource_id: string, amount: string): BankBill => ({
  id, resource_id, currency: "BRL", due_date: "2026-11-10", total_amount: amount,
  minimum_payment_amount: null, status: "unknown",
});
const fixture = (): BankOverview => ({
  connections: [{ id: "fixture-bank", institution_name: "Banco fictício", status: "active",
    provider_status: "AUTHORISED", scopes: [], consent_expires_at: null, revoked_at: null,
    last_successful_sync_at: null, created_at: "2026-10-11" }],
  resources: [resource("card-a", "1111"), resource("card-b", "2222"), resource("card-c", "3333")],
  // Deliberately reordered: array position and bank name cannot select a line.
  limits: [line("b-credit", "card-b", "222.22"), line("a-credit", "card-a", "111.11"), line("c-credit", "card-c", null)],
  bills: [bill("bill-b", "card-b", "22.22"), bill("bill-a", "card-a", "11.11")],
  credit: [], sync: [],
});
const render = (overview: BankOverview, mode: "personal" | "business" = "personal") =>
  renderToStaticMarkup(React.createElement(DashboardCredit, { overview, mode })).replace(/\s/g, " ");
const details = (html: string) => html.match(/<section\b[^>]*aria-label="Limites e faturas"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? "";

describe("card fan data integrity", () => {
  it("keeps eight cards keyboard-addressable, including cards with no reported limits", () => {
    const data = fixture();
    data.resources = Array.from({ length: 8 }, (_, index) => resource(`card-${index}`, String(1000 + index)));
    data.limits = [];
    const html = render(data);
    const faces = [...html.matchAll(/<button\b[^>]*aria-label="Ver cartão ([^"]+)"[^>]*>/g)];
    expect(faces).toHaveLength(8);
    for (let index = 0; index < 8; index++) {
      const face = faces.find(match => match[1].includes(`final ${1000 + index}`));
      expect(face?.[0]).toContain('type="button"');
      expect(face?.[0]).not.toMatch(/disabled|tabindex="-1"/);
    }
    expect(html).toContain("não enviou limites");
  });

  // Server rendering verifies each card as the initial selection using the real
  // component. Click/focus behavior needs the separate browser verification.
  it.each(["card-a", "card-b"])("binds the selected %s only to its resource IDs", selectedId => {
    const data = fixture();
    data.resources.sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));
    const panel = details(render(data));
    const own = selectedId === "card-a" ? "a" : "b";
    const other = own === "a" ? "b" : "a";
    expect(panel).toContain(`Linha ${own}-credit`);
    expect(panel).toContain(`/api/open-finance/bills/bill-${own}?mode=personal`);
    expect(panel).not.toContain(`Linha ${other}-credit`);
    expect(panel).not.toContain(`/bills/bill-${other}`);
    expect(panel).not.toContain("c-credit");
  });

  it.each(["personal", "business"] as const)("uses the %s scope for every selected-card statement link", mode => {
    const data = fixture();
    data.resources = [data.resources[2], data.resources[1], data.resources[0]];
    const html = render(data, mode);
    const links = [...details(html).matchAll(/href="(\/api\/open-finance\/bills\/[^\"]+)"/g)].map(match => match[1]);
    expect(links).toEqual([`/api/open-finance/bills/bill-a?mode=${mode}`]);
  });

  it("keeps shared credit lines separate without manufacturing a combined available total", () => {
    const data = fixture();
    data.resources = [data.resources[1], data.resources[2], data.resources[0]];
    data.limits = [line("first-shared", "card-a", "713.37"), line("second-shared", "card-a", "713.37")];
    const html = render(data);
    const panel = details(html);
    expect(panel).toContain("first-shared");
    expect(panel).toContain("second-shared");
    expect(panel.match(/713,37/g)).toHaveLength(2);
    expect(html).not.toContain("1.426,74");
    expect(html).toContain("sem somar limites compartilhados");
  });

  it.each([true, false])("does not turn unknown credit into zero (unknown line present: %s)", present => {
    const data = fixture();
    data.resources = [resource("card-c", "3333")];
    data.limits = present ? [line("unknown", "card-c", null)] : [];
    data.bills = [];
    const html = render(data);
    expect(html).toContain("Não informado");
    expect(html).not.toContain("R$ 0,00");
    expect(html).not.toContain("R$ 111,11");
    expect(details(html)).not.toContain("/api/open-finance/bills/");
  });
});
