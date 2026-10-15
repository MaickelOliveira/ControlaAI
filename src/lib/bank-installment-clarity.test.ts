import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FinanceBankSchedules from "../components/FinanceBankSchedules";
import { formatBankAgenda, type BankAgendaItem } from "./open-finance-schedules";
import { formatBankSchedules } from "./bank-schedule-answer";
import type { BankOverview } from "./open-finance-display";

const overview: BankOverview = {connections: [], resources: [], limits: [], bills: [], credit: [], sync: []};
const surfaces = ["whatsapp", "finance", "whatsapp-query"] as const;
type Surface = typeof surfaces[number];
const latestLabel = /(?:[uú]ltimas?\s+parcelas?|parcelas?\s+mais\s+recentes?)(?:\s+(?:identificadas?|encontradas?|observadas?))?/i;
const activeLabel = /(?:em\s+andamento|parcelas?\s+(?:futuras|previstas)|compras?\s+em\s+aberto)/i;
const recurringLabel = /(?:assinaturas?|recorr[eê]ncias?|recorrentes)/i;
const paidClaim = /\b\d+\s+(?:parcelas?\s+)?(?:pagas?|quitadas?)\b|\b(?:compra|pedido)\s+(?:foi\s+)?(?:pago|quitad[oa])\b/i;
const projectedCount = /\b\d+\s+parcelas?\s+(?:futuras?|previstas?|restantes?|pr[oó]ximas?)\b|\b(?:faltam|restam)\s+\d+\s+parcelas?\b/i;
const network = vi.fn();

function installment(id: string, observed = 2, total = 12, patch: Partial<BankAgendaItem> = {}): BankAgendaItem {
  return {
    id, kind: "installment", description: `Compra fictícia ${id}`, mode: "business", resource_id: "fictional-card",
    institution_name: "Banco fictício", resource_name: "Cartão fictício", amount: "49.90000000", currency: null,
    due_date: null, synced_at: "2026-10-13T12:00:00.000Z", observed_installments: observed, total_installments: total,
    ...patch,
  };
}

function recurring(id = "subscription"): BankAgendaItem {
  return {
    id, kind: "recurring", description: `Streaming fictício ${id}`, mode: "business", resource_id: "fictional-card",
    institution_name: "Banco fictício", resource_name: "Cartão fictício", amount: "29.90", currency: "BRL",
    due_date: "2026-11-13", synced_at: "2026-10-13T12:00:00.000Z", regularity_score: 0.95,
  };
}

function output(items: BankAgendaItem[], surface: Surface): string {
  if (surface === "whatsapp") return formatBankAgenda(items);
  if (surface === "finance") return renderToStaticMarkup(React.createElement(FinanceBankSchedules, {items, overview}));
  const agenda = {items, incomplete: false};
  // The real recurring-query caller composes the two selected kinds. Each formatter still receives the whole agenda.
  return [
    items.some(item => item.kind === "installment") ? formatBankSchedules(agenda, "installments", "Empresa · Companhia fictícia") : "",
    items.some(item => item.kind === "recurring") ? formatBankSchedules(agenda, "recurring", "Empresa · Companhia fictícia") : "",
  ].filter(Boolean).join("\n\n");
}

function visibleText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

// Recognize semantic heading regions, without depending on classes or an exact Portuguese sentence.
function groups(value: string, surface: Surface): Array<{kind: "active" | "last" | "recurring"; content: string}> {
  const matches = surface === "finance"
    ? Array.from(value.matchAll(/<(h[1-6]|summary)\b[^>]*>([\s\S]*?)<\/\1>/g)).map(match => ({index: match.index, text: visibleText(match[2])}))
    : Array.from(value.matchAll(/^[^\n]*\*([^\n]*?)\*[^\n]*$/gm)).map(match => ({index: match.index, text: match[1]}));
  const headings = matches.flatMap(heading => {
    const kind = activeLabel.test(heading.text) ? "active" : latestLabel.test(heading.text) ? "last"
      : recurringLabel.test(heading.text) ? "recurring" : null;
    return kind ? [{...heading, kind}] : [];
  });
  return headings.map((heading, index) => ({
    kind: heading.kind as "active" | "last" | "recurring",
    content: visibleText(value.slice(heading.index, headings[index + 1]?.index)),
  }));
}

beforeEach(() => {
  network.mockReset();
  network.mockImplementation(() => { throw new Error("REAL_TRANSPORT_FORBIDDEN"); });
  vi.stubGlobal("fetch", network);
});

afterEach(() => {
  try { expect(network).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});

describe.each(surfaces)("installment meaning in %s", surface => {
  it("shows the last identified 2 of 12 and the remaining 10 as future predictions", () => {
    const item = installment("notebook");
    const text = visibleText(output([item], surface));
    expect(text).toMatch(/\b2\s*(?:de|\/)\s*12\b/i);
    expect(text).toMatch(latestLabel);
    expect(text).toMatch(/\b10\s+parcelas?\b|\b(?:pr[oó]ximas?|futuras?|restantes?|previstas?)(?:\s+parcelas?)?(?:\s+previstas?)?\s*[:·-]?\s*10\b/i);
    expect(text).toMatch(/(?:previst|previs[aã]o|previs[oõ]es)/i);
    expect(text).not.toMatch(paidClaim);
  });

  it.each([2, 3, 5])("separates a purchase of %i installments when its last ordinal was found without claiming payment", total => {
    const completed = installment("sofa", total, total);
    const active = installment("notebook", 2, 12);
    const rendered = output([completed, active], surface);
    const sections = groups(rendered, surface);
    const last = sections.find(section => section.kind === "last" && section.content.includes(completed.description));
    const ongoing = sections.find(section => section.kind === "active" && section.content.includes(active.description));
    expect(last).toBeDefined();
    expect(ongoing).toBeDefined();
    expect(last!.content).toMatch(new RegExp(`\\b${total}\\s*(?:de|/)\\s*${total}\\b`, "i"));
    expect(last!.content).not.toContain(active.description);
    expect(ongoing!.content).not.toContain(completed.description);
    expect(visibleText(rendered)).not.toMatch(paidClaim);
  });

  it("separates ongoing installments, the last observed installment and recurring subscriptions", () => {
    const active = installment("notebook");
    const last = installment("sofa", 3, 3);
    const subscription = recurring();
    const rendered = output([last, subscription, active], surface);
    const sections = groups(rendered, surface);
    for (const [kind, item] of [["active", active], ["last", last], ["recurring", subscription]] as const) {
      const section = sections.find(candidate => candidate.kind === kind && candidate.content.includes(item.description));
      expect(section).toBeDefined();
      for (const other of [active, last, subscription].filter(candidate => candidate.id !== item.id)) {
        expect(section!.content).not.toContain(other.description);
      }
    }
    expect(visibleText(rendered)).toMatch(/n[aã]o.{0,60}(?:somad|contabilizad)/i);
    expect(visibleText(rendered)).not.toMatch(paidClaim);
  });

  it.each([
    {label: "unknown last ordinal", observed: null, total: 12},
    {label: "unknown total", observed: 2, total: null},
    {label: "both unknown", observed: null, total: null},
    {label: "zero ordinal", observed: 0, total: 12},
    {label: "negative ordinal", observed: -1, total: 12},
    {label: "ordinal above total", observed: 13, total: 12},
    {label: "zero total", observed: 2, total: 0},
    {label: "fractional ordinal", observed: 2.5, total: 12},
    {label: "fractional total", observed: 2, total: 12.5},
    {label: "non-finite ordinal", observed: Number.NaN, total: 12},
  ])("does not invent zeroes or a remaining projection for $label", ({observed, total}) => {
    const item = installment("unknown", 2, 12, {observed_installments: observed, total_installments: total});
    const text = visibleText(output([item], surface));
    expect(text).not.toMatch(/\b(?:null|undefined|NaN|Infinity)\b/i);
    expect(text).not.toMatch(/\b0\s*(?:de|\/)\s*\d+\b/);
    expect(text).not.toMatch(projectedCount);
    expect(text).not.toMatch(paidClaim);
    expect(text).toMatch(/(?:\?|n[aã]o\s+informad|desconhecid|indispon[ií]vel|n[aã]o\s+identificad)/i);
    if (observed != null && total != null) {
      const invalidOrdinal = `${observed}\\s*(?:de|/)\\s*${total}`.replace(/\./g, "\\.");
      expect(text).not.toMatch(new RegExp(invalidOrdinal));
    }
  });

  it("preserves an identified ordinal of 2 when the total is unknown, without predicting the remaining count", () => {
    const text = visibleText(output([installment("partial-ordinal", 2, 12, {total_installments: null})], surface));
    expect(text).toMatch(/(?:[uú]ltima\s+parcela|parcela\s+mais\s+recente)(?:\s+(?:identificada|encontrada|observada))?\s*[:·-]?\s*2\b/i);
    expect(text).toMatch(/(?:restant[ea]s?|pr[oó]ximas?\s+parcelas?|parcelas?\s+futuras?).{0,45}(?:n[aã]o\s+informad|desconhecid|indispon[ií]vel)/i);
    expect(text).not.toMatch(projectedCount);
    expect(text).not.toMatch(paidClaim);
    expect(text).not.toMatch(/\b(?:null|undefined|NaN)\b/i);
  });

  it("preserves a known total of 12 when the last ordinal is unknown, without assuming zero observations", () => {
    const text = visibleText(output([installment("partial-total", 2, 12, {observed_installments: null})], surface));
    expect(text).toMatch(/\btotal(?:\s+(?:de\s+parcelas|do\s+parcelamento))?(?:\s+(?:informado|identificado))?\s*[:·-]?\s*12\b|\b12\s+parcelas\s+(?:no|ao)\s+total\b/i);
    expect(text).toMatch(/(?:restant[ea]s?|pr[oó]ximas?\s+parcelas?|parcelas?\s+futuras?).{0,45}(?:n[aã]o\s+informad|desconhecid|indispon[ií]vel)/i);
    expect(text).not.toMatch(/\b0\s*(?:de|\/)\s*12\b/);
    expect(text).not.toMatch(projectedCount);
    expect(text).not.toMatch(paidClaim);
    expect(text).not.toMatch(/\b(?:null|undefined|NaN)\b/i);
  });

  it("keeps absent currency and due date unknown without assigning BRL or a future calendar", () => {
    const text = visibleText(output([installment("undated")], surface));
    expect(text).toContain("49,90");
    expect(text).toMatch(/moeda\s+n[aã]o\s+informada/i);
    expect(text).toMatch(/(?:vencimento|data).{0,30}n[aã]o\s+(?:informad|enviad)/i);
    expect(text).not.toContain("R$");
    if (surface === "whatsapp-query") {
      expect(text).toMatch(/recebido\s+em\s+13\/10\/2026/i);
      expect(text).not.toMatch(/(?:vencimento|pr[oó]xima\s+cobran[cç]a|cobran[cç]a\s+prevista)\s*(?:(?:informad[oa]|estimad[oa])\s*)?[:·-]?\s*(?:\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/i);
    } else {
      expect(text).not.toMatch(/\b\d{2}\/\d{2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/);
    }
  });

  it("preserves the original description, bank, card and input data", () => {
    const items = [installment("original", 2, 12, {
      description: "Notebook modelo X da loja fictícia", institution_name: "Banco d'Água & Cia", resource_name: "Cartão Série 7",
    }), recurring("original")];
    const before = structuredClone(items);
    const text = visibleText(output(items, surface));
    expect(text).toContain(items[0].description);
    expect(text).toContain(items[0].institution_name);
    expect(text).toContain(items[0].resource_name);
    expect(items).toEqual(before);
  });

  it("escapes descriptions and bank names for its output while preserving the source fields", () => {
    const item = installment("escaped", 2, 12, {
      description: 'Loja <script>alert("fictional")</script> *surpresa* _teste_\nNova linha',
      institution_name: "<Banco> *fictício*", resource_name: "Cartão_<img src=x onerror=boom>",
    });
    const before = structuredClone(item);
    const rendered = output([item], surface);
    expect(rendered).not.toMatch(/<script\b|<img\b|<[^>]*\bonerror\s*=/i);
    if (surface === "finance") {
      expect(rendered).toContain("&lt;script&gt;");
      expect(rendered).toContain("&lt;Banco&gt;");
    } else {
      expect(rendered).not.toContain("*surpresa*");
      expect(rendered).not.toContain("_teste_");
      expect(rendered).not.toContain("*fictício*");
      expect(rendered).not.toContain("<Banco>");
      expect(rendered).toContain("surpresa");
      expect(rendered).toContain("fictício");
    }
    expect(item).toEqual(before);
  });

  it("keeps predictions informational without payment/delete actions or posted expense totals", () => {
    const rendered = output([installment("notebook"), recurring()], surface);
    expect(visibleText(rendered)).toMatch(/n[aã]o.{0,60}(?:somad|contabilizad)/i);
    expect(rendered).not.toMatch(/<button\b|<a\b|<form\b/i);
    expect(visibleText(rendered)).not.toMatch(/(?:marcar\s+como\s+pag[oa]|confirmar\s+pagamento|excluir|deletar|total\s+(?:de\s+)?despesas)/i);
    expect(visibleText(rendered)).not.toMatch(paidClaim);
  });
});

it("keeps an ongoing purchase visible when the first four input items have their last installment identified", () => {
  const completed = Array.from({length: 4}, (_, index) => installment(`last-${index}`, 2, 2));
  const active = installment("active");
  const html = output([...completed, active], "finance");
  const initiallyVisible = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/gi, "");
  expect(initiallyVisible).toContain(active.description);
  const details = Array.from(html.matchAll(/<details\b[^>]*>/gi));
  for (const detail of details) expect(detail[0]).not.toMatch(/\bopen(?:\s|=|>)/i);
});

it("keeps a long Finance prediction list expandable with native details initially closed", () => {
  const items = Array.from({length: 21}, (_, index) => installment(`active-${index}`, 2, 12));
  const html = output(items, "finance");
  const details = Array.from(html.matchAll(/<details\b[^>]*>/gi));
  expect(details.length).toBeGreaterThan(0);
  expect(html).toMatch(/<summary\b/i);
  for (const detail of details) expect(detail[0]).not.toMatch(/\bopen(?:\s|=|>)/i);
  expect(visibleText(html)).toContain(items[0].description);
});

it("prioritizes ongoing purchases and subscriptions inside the 20-item WhatsApp limit and retains an overflow notice", () => {
  const completed = Array.from({length: 22}, (_, index) => installment(`last-${String(index).padStart(2, "0")}`, 3, 3));
  const active = installment("active-priority");
  const subscription = recurring("priority");
  const items = [...completed, active, subscription];
  const before = structuredClone(items);
  const text = formatBankAgenda(items);
  expect(text).toContain(active.description);
  expect(text).toContain(subscription.description);
  expect(items.filter(item => text.includes(item.description)).length).toBeLessThanOrEqual(20);
  expect(text).toMatch(/(?:demais|outros\s+itens|itens\s+(?:restantes|omitidos)|ver\s+mais|limite\s+de\s+20)/i);
  expect(items).toEqual(before);
});

it("retains the incomplete-data warning even when all identified installments reach their total", () => {
  const text = formatBankAgenda([installment("last", 3, 3)], true);
  expect(text).toMatch(/consulta\s+banc[aá]ria\s+incompleta/i);
  expect(text).toMatch(/(?:atualiza[cç][aã]o|indispon[ií]ve)/i);
  expect(text).not.toMatch(paidClaim);
  expect(formatBankAgenda([], true)).toMatch(/incompleta/i);
});

it("does not treat cycle payments equal to the bill total as proof an installment purchase was paid", () => {
  const bill: BankAgendaItem = {
    ...installment("bill", 3, 3), kind: "bill", description: "Fatura fictícia", currency: "BRL", amount: "149.70",
    due_date: "2026-11-13", payment_evidence: true, payment_amount: "149.70",
  };
  const before = structuredClone(bill);
  const text = formatBankAgenda([bill, installment("last", 3, 3)]);
  expect(text).toMatch(/(?:confira|confirm|banco)/i);
  expect(text).not.toMatch(paidClaim);
  expect(text).not.toMatch(/fatura\s+(?:paga|quitada)/i);
  expect(bill).toEqual(before);
});

it.each(["installments", "recurring"] as const)("keeps the real WhatsApp query formatter restricted to the selected %s kind", kind => {
  const active = installment("kind-active");
  const last = installment("kind-last", 3, 3);
  const subscription = recurring("kind-subscription");
  const bill: BankAgendaItem = {...installment("kind-bill"), kind: "bill", description: "Fatura fictícia de seleção"};
  const agenda = {items: [active, last, subscription, bill], incomplete: false};
  const before = structuredClone(agenda);
  const text = formatBankSchedules(agenda, kind, "Empresa · Companhia fictícia");

  expect(text).toContain("Empresa · Companhia fictícia");
  for (const item of agenda.items) {
    const selected = item.kind === (kind === "installments" ? "installment" : "recurring");
    if (selected) expect(text).toContain(item.description);
    else expect(text).not.toContain(item.description);
  }
  expect(agenda).toEqual(before);
  expect(text).not.toMatch(paidClaim);
});

it("prioritizes active purchases within each bank's ten-item query limit while preserving every currency subtotal and receipt date", () => {
  const alfa = "Banco Alfa fictício", beta = "Banco Beta fictício";
  const alfaLast = Array.from({length: 12}, (_, index) => installment(`alfa-last-${String(index).padStart(2, "0")}`, 3, 3,
    {institution_name: alfa, amount: "5.00", currency: "BRL"}));
  const betaLast = Array.from({length: 10}, (_, index) => installment(`beta-last-${String(index).padStart(2, "0")}`, 2, 2,
    {institution_name: beta, amount: "2.00", currency: "BRL"}));
  const activeAlfa = installment("alfa-active-brl", 2, 12, {institution_name: alfa, amount: "7.00", currency: "BRL"});
  const activeDollar = installment("alfa-active-usd", 2, 12, {institution_name: alfa, amount: "10.00", currency: "USD"});
  const activeBeta = installment("beta-active-brl", 2, 12, {institution_name: beta, amount: "3.00", currency: "BRL"});
  const agenda = {items: [...alfaLast, ...betaLast, activeAlfa, activeDollar, activeBeta], incomplete: true};
  const before = structuredClone(agenda);
  const text = visibleText(formatBankSchedules(agenda, "installments", "Empresa · Companhia fictícia"));

  expect(text).toContain(activeAlfa.description);
  expect(text).toContain(activeDollar.description);
  expect(text).toContain(activeBeta.description);
  for (const institution of [alfa, beta]) {
    expect(text).toContain(institution);
    expect(agenda.items.filter(item => item.institution_name === institution && text.includes(item.description)).length).toBeLessThanOrEqual(10);
  }
  // Includes hidden last-installment rows; preserves BRL/USD separately instead of converting them or dropping past observations.
  expect(text).toMatch(/Subtotal conhecido:\s*R\$\s*67,00/);
  expect(text).toMatch(/Subtotal conhecido:\s*US\$\s*10,00/);
  expect(text).toMatch(/Subtotal conhecido:\s*R\$\s*23,00/);
  expect(text).toMatch(/(?:inclu(?:i|em)|consider(?:a|am)).{0,100}[uú]ltimas?\s+parcelas?|[uú]ltimas?\s+parcelas?.{0,100}(?:inclu[ií]d|subtotal|total)/i);
  expect(text).toMatch(/n[aã]o\s+[eé]\s+(?:o\s+)?saldo\s+devedor/i);
  expect(text).toMatch(/(?:mais|demais|outros).{0,35}ite(?:m|ns)/i);
  expect(text).toMatch(/recebido\s+em\s+13\/10\/2026/i);
  expect(text).toContain("Empresa · Companhia fictícia");
  expect(text).toMatch(/consulta\s+banc[aá]ria\s+incompleta/i);
  expect(text).not.toMatch(paidClaim);
  expect(agenda).toEqual(before);
});

it.each(["installments", "recurring"] as const)("keeps incomplete-data and receipt metadata in the selected %s query response", kind => {
  const agenda = {items: [installment("query-incomplete"), recurring("query-incomplete")], incomplete: true};
  const text = formatBankSchedules(agenda, kind, "Empresa · Companhia fictícia");
  expect(text).toMatch(/consulta\s+banc[aá]ria\s+incompleta/i);
  expect(text).toMatch(/recebido\s+em\s+13\/10\/2026/i);
  expect(text).not.toMatch(paidClaim);
});
