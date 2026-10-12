import { describe, expect, it } from "vitest";
import { formatBankQuestion } from "./bank-question-answer";
import { parseBankQuestion } from "./bank-question-parser";
import { bankMoney, type BankOverview, type BankResource } from "./open-finance-display";
const connection = (id: string, institution_name: string, status = "active") => ({ id, institution_name, status, provider_status: null, scopes: ["CREDIT_OPERATIONS"], consent_expires_at: null, revoked_at: null, last_successful_sync_at: null, created_at: "2026-10-11" });
const resource = (id: string, connection_id: string, resource_type: BankResource["resource_type"], name: string): BankResource => ({ id, connection_id, resource_type, name, subtype: null, card_network: null, identification_last4: null, currency: "BRL", available_amount: null, gross_amount: null, net_amount: null, valuation_date: null, synced_at: "2026-10-11" });
function overview(): BankOverview {
  return { connections: [connection("nu", "Nubank"), connection("si", "Sicredi"), connection("real", "Realize"), connection("old", "Banco removido", "revoked")], resources: [resource("nu-loan", "nu", "loan", "Crédito pessoal"), resource("si-loan", "si", "loan", "Crédito fácil"), resource("fin", "si", "financing", "Veículo"), resource("old-loan", "old", "loan", "Antigo"), resource("orphan", "foreign", "loan", "Não autorizado")], credit: [
    { resource_id: "nu-loan", currency: "BRL", outstanding_amount: "1200.10", contract_amount: "5000", next_installment_amount: "200", due_date: "2027-01-10" },
    { resource_id: "si-loan", currency: "BRL", outstanding_amount: "700.55", contract_amount: "2000", next_installment_amount: null, due_date: null },
    { resource_id: "fin", currency: "BRL", outstanding_amount: "8000.81", contract_amount: "12000.99", next_installment_amount: null, due_date: null },
    { resource_id: "old-loan", currency: "BRL", outstanding_amount: "999999", contract_amount: null, next_installment_amount: null, due_date: null },
  ], limits: [], bills: [], sync: [] };
}
const answer = (data: BankOverview, text: string) => formatBankQuestion(data, parseBankQuestion(text, "2026-10-11")!, "Pessoal");
describe("saved bank positions", () => {
  it("lists loans from each connected bank and totals debt, without adding financing or old connections", () => {
    const text = answer(overview(), "zelo quanto eu tenho de emprestimo?");
    expect(text).toContain("Nubank"); expect(text).toContain(bankMoney("1200.10", "BRL"));
    expect(text).toContain("Sicredi"); expect(text).toContain(bankMoney("700.55", "BRL"));
    expect(text).toContain(bankMoney("1900.65", "BRL")); expect(text).toContain("Realize");
    expect(text).toContain("não informou"); expect(text).not.toContain("Banco removido"); expect(text).not.toContain("Não autorizado");
    expect(text).not.toContain("8.000"); expect(text).not.toContain("Você gastou");
  });
  it("answers financing separately and keeps unknown installments unknown", () => {
    const text = answer(overview(), "Mostre meus financiamentos no Sicredi");
    expect(text).toContain("Veículo"); expect(text).toContain(bankMoney("8000.81", "BRL"));
    expect(text).toContain("Próxima parcela: Não informado"); expect(text).not.toContain("Nubank");
  });
  it("filters available card credit to Nubank and keeps shared credit lines separate", () => {
    const data = overview(); data.resources.push(resource("card", "nu", "card", "Platinum"), resource("other-card", "si", "card", "Gold"));
    data.limits = [
      { id: "l1", resource_id: "card", line_name: "CREDITO_A_VISTA", consolidation_type: "CONSOLIDADO", currency: "BRL", total_amount: "2000", used_amount: "754.08", available_amount: "1245.92", is_flexible: false },
      { id: "l2", resource_id: "card", line_name: "SAQUE", consolidation_type: "CONSOLIDADO", currency: "BRL", total_amount: "2000", used_amount: "754.08", available_amount: "1245.92", is_flexible: false },
      { id: "foreign", resource_id: "other-card", line_name: "Outro", consolidation_type: null, currency: "BRL", total_amount: "9000", used_amount: "1", available_amount: "8999", is_flexible: false },
    ];
    const text = answer(data, "Quanto eu tenho de crédito disponível no cartão Nubank?");
    expect(text).toContain("Nubank"); expect(text).toContain(bankMoney("1245.92", "BRL")); expect(text).toContain("CREDITO A VISTA"); expect(text).toContain("SAQUE");
    expect(text).not.toContain("Sicredi"); expect(text).not.toContain("2.491"); expect(text).toContain("não são somados");
  });
  it("does not invent zero or add currencies when debt values are missing", () => {
    const data = overview(); data.credit[0].outstanding_amount = null; data.credit[1].currency = "USD";
    const text = answer(data, "Mostre meus empréstimos");
    expect(text).toContain("Saldo devedor: Não informado"); expect(text).toContain("Subtotal conhecido"); expect(text).toContain(bankMoney("700.55", "USD")); expect(text).not.toContain("1.900");
    data.credit = []; expect(answer(data, "Mostre meus empréstimos")).not.toContain("R$");
  });
  it("distinguishes a disconnected name, card suffix and partial imports", () => {
    const data = overview(); data.truncated = true; data.sync = [{ status: "error", last_successful_sync_at: null, covered_from: null, covered_to: null }];
    expect(answer(data, "Mostre meus empréstimos no Inter")).toContain("Não encontrei");
    const text = answer(data, "Mostre meus empréstimos"); expect(text).toContain("parcial"); expect(text).toContain("pendente ou com falha"); expect(text).toContain("Subtotal conhecido");
  });
  it("returns account balances, investment values and statement amounts for the requested bank", () => {
    const data = overview();
    data.resources.push({ ...resource("cash", "nu", "account", "Conta"), available_amount: "123.45" }, { ...resource("inv", "si", "investment", "Fundo"), gross_amount: "300", net_amount: "290", valuation_date: "2026-10-10" }, resource("card", "nu", "card", "Platinum"));
    data.bills.push({ id: "bill", resource_id: "card", currency: "BRL", total_amount: "400", minimum_payment_amount: "60", due_date: "2026-10-20", status: "unknown" });
    expect(answer(data, "Qual meu saldo no Nubank?")).toContain(bankMoney("123.45", "BRL"));
    expect(answer(data, "Mostre meus investimentos no Sicredi")).toContain(bankMoney("290", "BRL"));
    const bill = answer(data, "Qual o valor da fatura no Nubank?"); expect(bill).toContain(bankMoney("400", "BRL")); expect(bill).toContain("20/10/2026"); expect(bill).toContain("Pagamento: não informado"); expect(bill).not.toContain("Sicredi");
  });
  it("keeps exact bank names distinct and filters the last four digits of a card", () => {
    const data = overview(); data.connections.push(connection("bb", "Banco do Brasil"), connection("bne", "Banco do Nordeste do Brasil S.A."));
    data.resources.push({ ...resource("bb-cash", "bb", "account", "Conta"), available_amount: "10" }, { ...resource("bne-cash", "bne", "account", "Conta"), available_amount: "90" }, { ...resource("c1", "nu", "card", "Um"), identification_last4: "1234" }, { ...resource("c2", "nu", "card", "Dois"), identification_last4: "5678" });
    expect(answer(data, "Qual saldo no Banco do Brasil?")).not.toContain("Nordeste");
    const card = answer(data, "Qual limite no cartão Nubank final 1234?"); expect(card).toContain("final 1234"); expect(card).not.toContain("5678");
  });
});
