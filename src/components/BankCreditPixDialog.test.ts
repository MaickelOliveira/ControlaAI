import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import BankCreditPixDialog from "./BankCreditPixDialog";
import type { BankMovement } from "@/lib/open-finance-report";

const credit: BankMovement = {
  id: "fictional-credit", resource_id: "fictional-card", resource_name: "Cartão fictício",
  institution_name: "Banco fictício", resource_type: "card", date: "2026-10-12",
  description: "Crédito fictício", amount: "850.16", currency: "BRL", direction: "debit",
  classification: "purchase", kind: "card_purchases", source_type: "OPERACOES_CREDITO_CONTRATADAS_CARTAO",
  bill_month: "2026-10", installment_number: null, installment_count: null,
};
const payment: BankMovement = {
  ...credit, id: "fictional-payment", resource_id: "fictional-account", resource_name: "Conta fictícia",
  resource_type: "account", description: "Pix fictício", source_type: "PIX", kind: "account_debits", amount: "821.48",
};
const render = (row: BankMovement, movements: BankMovement[] = []) => renderToStaticMarkup(
  React.createElement(BankCreditPixDialog, { credit: row, movements, mode: "personal", onClose: () => {}, onSaved: () => {} }),
).replace(/\s/g, " ");

it.each(["credit", "payment"] as const)("shows the confirmed card gross even when opened from the %s row", role => {
  const row: BankMovement = { ...(role === "credit" ? credit : payment), credit_reconciliation: {
    id: "00000000-0000-4000-8000-000000000099", role, status: "active",
    gross_amount: "850.16", payment_amount: "821.48", charges_amount: "28.68",
  } };
  const before = JSON.stringify(row);
  const html = render(row);
  expect(html).toContain("Cobrança do cartão que você confirmou: <strong>R$ 850,16</strong>");
  expect(html).toContain("Pix de R$ 821,48 e R$ 28,68 de juros e taxas");
  expect(html).toContain("Desfazer confirmação");
  expect(html).toContain("histórico e a dívida no cartão são preservados");
  expect(JSON.stringify(row)).toBe(before);
});

it("does not preselect an eligible Pix or enable saving without the holder's explicit confirmation", () => {
  const html = render(credit, [payment]);
  expect(html).toContain("Você pegou dinheiro do cartão, pelo Pix, para fazer esse pagamento?");
  expect(html).toContain('value="fictional-payment"');
  expect(html).toMatch(/<option value="" selected="">Escolha o pagamento<\/option>/);
  const saveButton = html.match(/<button\b([^>]*)>Sim, é o mesmo pagamento<\/button>/);
  expect(saveButton).not.toBeNull();
  expect(saveButton?.[1]).toContain('disabled=""');
  expect(html).not.toContain('checked=""');
});
