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
  it("shows only known zero-balance loans when asked which are settled", () => {
    const data=overview();
    data.credit[0].outstanding_amount="0.00000000";
    const text=formatBankQuestion(data,{kind:"loans",from:"2026-10-01",to:"2026-10-31",settledOnly:true},"Pessoal");
    expect(text).toContain("Crédito pessoal"); expect(text).not.toContain("Crédito fácil");
    expect(text).not.toContain("Total informado"); expect(text).toContain("não confirma quitação contratual");
  });
  it("consolidates missing investment data instead of repeating an empty answer for every bank",()=>{
    const empty=answer(overview(),"Mostre meus investimentos");
    expect(empty).toContain("Nenhum investimento informado");
    expect(empty).not.toContain("Nubank");expect(empty).not.toContain("Sicredi");
    const data=overview();data.resources.push(resource("investment","si","investment","CDB teste"));
    const shown=answer(data,"Mostre meus investimentos");
    expect(shown).toContain("CDB teste");expect(shown).toContain("Sicredi");expect(shown).not.toContain("Nubank");
  });
  it("answers financing separately and keeps unknown installments unknown", () => {
    const text = answer(overview(), "Mostre meus financiamentos no Sicredi");
    expect(text).toContain("Veículo"); expect(text).toContain(bankMoney("8000.81", "BRL"));
    expect(text).toContain("Valor da próxima parcela não informado pelo banco"); expect(text).not.toContain("Nubank");
    expect(text).not.toContain("Total informado:");
    const withInstallment = overview(); withInstallment.credit[2].next_installment_amount = "321.45";
    expect(answer(withInstallment, "Mostre meus financiamentos no Sicredi")).toContain(`Valor da próxima parcela: ${bankMoney("321.45", "BRL")}`);
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
  it("flags internally inconsistent card limits without changing the bank amounts", () => {
    const data = overview(); data.resources.push(resource("card", "nu", "card", "Meu Cartão"));
    data.limits = [{ id:"line", resource_id:"card", line_name:"CREDITO_A_VISTA", consolidation_type:"CONSOLIDADO", currency:"BRL", total_amount:"100", used_amount:"100", available_amount:"20", is_flexible:false }];
    const text = answer(data, "Qual meu limite no cartão Nubank?");
    expect(text).toContain(bankMoney("100","BRL")); expect(text).toContain(bankMoney("20","BRL"));
    expect(text).toContain("valores desta linha não fecham entre si");
  });
  it("shows used limits directly, preserving distinct shared lines and unknown values", () => {
    const data=overview();
    data.resources.push(resource("nu-card","nu","card","Nubank Gold"),resource("si-card","si","card","Sicredi Gold"));
    data.limits=[{id:"used",resource_id:"nu-card",line_name:"CREDITO_A_VISTA",consolidation_type:"CONSOLIDADO",currency:"BRL",total_amount:"100",used_amount:"35",available_amount:"65",is_flexible:false}];
    const text=answer(data,"Quanto do limite de cada cartão já foi usado?");
    expect(text).toContain("Nubank Gold");expect(text).toContain(`Utilizado: ${bankMoney("35","BRL")}`);
    expect(text).toContain("Sicredi Gold");expect(text).toContain("Utilizado: Não informado");
    expect(text).not.toContain("Total informado:");expect(text).not.toContain("Disponível:");
  });
  it("lists only card lines whose available limit was actually reported, including zero", () => {
    const data=overview();
    data.resources.push(resource("nu-card","nu","card","Nubank Gold"),resource("si-card","si","card","Sicredi Gold"),resource("real-card","real","card","Realize Gold"));
    data.limits=[
      {id:"known",resource_id:"nu-card",line_name:"CREDITO_A_VISTA",consolidation_type:"CONSOLIDADO",currency:"BRL",total_amount:"100",used_amount:"100",available_amount:"0",is_flexible:false},
      {id:"unknown",resource_id:"nu-card",line_name:"SAQUE",consolidation_type:"CONSOLIDADO",currency:"BRL",total_amount:"100",used_amount:"0",available_amount:null,is_flexible:false},
      {id:"si-unknown",resource_id:"si-card",line_name:"CREDITO_A_VISTA",consolidation_type:"CONSOLIDADO",currency:"BRL",total_amount:"100",used_amount:"0",available_amount:null,is_flexible:false},
    ];
    const text=answer(data,"Mostre apenas os cartões com limite disponível informado.");
    expect(text).toContain("Nubank Gold");expect(text).toContain(`Disponível: ${bankMoney("0","BRL")}`);
    expect(text).not.toContain("Sicredi Gold");expect(text).not.toContain("Realize Gold");expect(text).not.toContain("SAQUE");
    expect(text).not.toContain("O banco ainda não informou crédito");
  });
  it("distinguishes consolidated credit lines from proven sharing between cards", () => {
    const data=overview();
    data.resources.push(resource("nu-card","nu","card","Nubank Gold"),resource("si-card","si","card","Sicredi Gold"));
    data.limits=[
      {id:"consolidated",resource_id:"nu-card",line_name:"CREDITO_A_VISTA",consolidation_type:"CONSOLIDADO",currency:"BRL",total_amount:"1000",used_amount:"200",available_amount:"800",is_flexible:false},
      {id:"individual",resource_id:"si-card",line_name:"CREDITO_A_VISTA",consolidation_type:"INDIVIDUAL",currency:"BRL",total_amount:"1000",used_amount:"200",available_amount:"800",is_flexible:false},
    ];
    const text=answer(data,"Há linhas de crédito compartilhadas que não devem ser somadas?");
    expect(text).toContain("Nubank");expect(text).toContain("1 linha consolidada");
    expect(text).toContain("não informam quais cartões compartilham");
    expect(text).toContain("não soma");expect(text).not.toContain("R$ 2.000");
    expect(text).not.toContain("Sicredi Gold");
  });
  it("shows only inconsistent received credit lines when asked if any do not add up", () => {
    const data=overview();
    data.resources.push(resource("good","nu","card","Cartão certo"),resource("bad","real","card","Cartão divergente"));
    data.limits=[
      {id:"ok",resource_id:"good",line_name:"CREDITO_A_VISTA",consolidation_type:"CONSOLIDADO",currency:"BRL",total_amount:"100",used_amount:"20",available_amount:"80",is_flexible:false},
      {id:"wrong",resource_id:"bad",line_name:"CREDITO_A_VISTA",consolidation_type:"CONSOLIDADO",currency:"BRL",total_amount:"100",used_amount:"100",available_amount:"20",is_flexible:false},
    ];
    const text=answer(data,"Algum limite recebido está inconsistente com o total e o utilizado?");
    expect(text).toContain("Cartão divergente");expect(text).toContain("Realize");
    expect(text).toContain(bankMoney("100","BRL"));expect(text).toContain(bankMoney("20","BRL"));
    expect(text).not.toContain("Cartão certo");expect(text).not.toContain("Sicredi");
    expect(text).toContain("confirme");
  });
  it("identifies the highest and lowest reported available card lines without adding shared credit", () => {
    const data=overview();
    data.resources.push(resource("high","nu","card","Cartão alto"),resource("low","si","card","Cartão baixo"),resource("unknown","real","card","Cartão sem dado"));
    data.limits=[
      {id:"high-a",resource_id:"high",line_name:"CREDITO_A_VISTA",consolidation_type:"CONSOLIDADO",currency:"BRL",total_amount:"1200",used_amount:"200",available_amount:"1000",is_flexible:false},
      {id:"high-b",resource_id:"high",line_name:"SAQUE",consolidation_type:"CONSOLIDADO",currency:"BRL",total_amount:"500",used_amount:"0",available_amount:"500",is_flexible:false},
      {id:"low",resource_id:"low",line_name:"CREDITO_A_VISTA",consolidation_type:"INDIVIDUAL",currency:"BRL",total_amount:"100",used_amount:"100",available_amount:"0",is_flexible:false},
      {id:"missing",resource_id:"unknown",line_name:"CREDITO_A_VISTA",consolidation_type:"CONSOLIDADO",currency:"BRL",total_amount:null,used_amount:null,available_amount:null,is_flexible:false},
    ];
    const highest=answer(data,"Qual cartão tem o maior limite disponível?");
    expect(highest).toContain("Cartão alto");expect(highest).toContain(bankMoney("1000","BRL"));
    expect(highest).not.toContain("Cartão baixo");expect(highest).not.toContain("1.500");
    const lowest=answer(data,"Qual cartão tem o menor limite disponível?");
    expect(lowest).toContain("Cartão baixo");expect(lowest).toContain(bankMoney("0","BRL"));
    expect(lowest).not.toContain("Cartão sem dado");expect(lowest).not.toContain("Cartão alto");
  });
  it("names received accounts and cards with missing positions without inventing an update schedule", () => {
    const data=overview();
    data.resources.push({...resource("known-account","nu","account","Conta atualizada"),available_amount:"50"},
      resource("missing-account","si","account","Conta sem saldo"),resource("missing-card","real","card","Cartão sem limite"),
      resource("revoked-card","old","card","Cartão antigo"));
    data.sync=[{status:"error",last_successful_sync_at:null,covered_from:null,covered_to:null}];
    const text=answer(data,"Explique quais saldos e limites ainda dependem de atualização bancária.");
    expect(text).toContain("Conta sem saldo");expect(text).toContain("Sicredi");
    expect(text).toContain("Cartão sem limite");expect(text).toContain("Realize");
    expect(text).toContain("Realize não enviou dados de conta");
    expect(text).toContain("importação pendente ou com falha");
    expect(text).not.toContain("Conta atualizada");expect(text).not.toContain("Cartão antigo");
    expect(text).not.toContain("várias vezes ao dia");
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
  it("answers the last update with received balances and dates, not a capabilities list", () => {
    const data=overview();
    data.resources.push({...resource("nu-account","nu","account","Conta Nubank"),available_amount:"123.45",synced_at:"2026-10-14"},
      {...resource("si-account","si","account","Conta Sicredi"),available_amount:"-10",synced_at:"2026-10-15"});
    const text=answer(data,"Qual era o saldo informado por cada banco na última atualização?");
    expect(text).toContain("última posição recebida");
    expect(text).toContain("Nubank");expect(text).toContain(bankMoney("123.45","BRL"));expect(text).toContain("14/10/2026");
    expect(text).toContain("Sicredi");expect(text).toContain(bankMoney("-10","BRL"));expect(text).toContain("15/10/2026");
    expect(text).not.toContain("Consigo consultar");
  });
  it("shows only negative account balances and warns when the bank feed is incomplete", () => {
    const data=overview();
    data.resources.push({...resource("positive","nu","account","Conta positiva"),available_amount:"20"},
      {...resource("negative","si","account","Conta negativa"),available_amount:"-15.25"},
      resource("missing","real","account","Conta sem saldo"));
    data.sync=[{status:"error",last_successful_sync_at:null,covered_from:null,covered_to:null}];
    const text=answer(data,"Existe alguma conta com saldo negativo?");
    expect(text).toContain("Conta negativa");expect(text).toContain(bankMoney("-15.25","BRL"));
    expect(text).not.toContain("Conta positiva");expect(text).not.toContain("Conta sem saldo");
    expect(text).toContain("importação pendente ou com falha");
  });
  it("lists only connected accounts whose available balance was not received", () => {
    const data=overview();
    data.resources.push({...resource("known","nu","account","Conta informada"),available_amount:"0"},
      resource("missing","si","account","Conta sem saldo"),
      resource("card","real","card","Cartão sem saldo"));
    const text=answer(data,"Quais contas conectadas não enviaram saldo?");
    expect(text).toContain("Conta sem saldo");expect(text).toContain("Sicredi");
    expect(text).not.toContain("Conta informada");expect(text).not.toContain("Cartão sem saldo");
    expect(text).toContain("Realize");
    expect(text).toContain("não enviaram dados de conta");
  });
  it("limits a focused balance reply when many accounts match",()=>{
    const data=overview();
    data.resources.push(...Array.from({length:21},(_,index)=>({...resource(`missing-${index}`,"si","account",`Conta ${index}`),available_amount:null})));
    const text=answer(data,"Quais contas conectadas não enviaram saldo?");
    expect(text).toContain("Conta 19");expect(text).not.toContain("Conta 20");
    expect(text).toContain("Mais 1 conta(s) em Contas");
  });
  it("keeps exact bank names distinct and filters the last four digits of a card", () => {
    const data = overview(); data.connections.push(connection("bb", "Banco do Brasil"), connection("bne", "Banco do Nordeste do Brasil S.A."));
    data.resources.push({ ...resource("bb-cash", "bb", "account", "Conta"), available_amount: "10" }, { ...resource("bne-cash", "bne", "account", "Conta"), available_amount: "90" }, { ...resource("c1", "nu", "card", "Um"), identification_last4: "1234" }, { ...resource("c2", "nu", "card", "Dois"), identification_last4: "5678" });
    expect(answer(data, "Qual saldo no Banco do Brasil?")).not.toContain("Nordeste");
    const card = answer(data, "Qual limite no cartão Nubank final 1234?"); expect(card).toContain("final 1234"); expect(card).not.toContain("5678");
  });
});

it("filters vehicle financing by purpose across banks and hides exact zero debts without hiding unknown values", () => {
  const data = overview();
  data.resources.push(resource("house", "si", "financing", "Imóvel residencial"), resource("zero", "si", "loan", "Quitado teste"), resource("unknown", "nu", "loan", "Sem posição teste"), resource("tiny", "nu", "loan", "Saldo pequeno teste"));
  data.resources.find(r => r.id === "fin")!.name = "VEICULOS E UTILITARIOS LEVES - REVENDAS";
  data.credit.push({ resource_id: "house", currency: "BRL", outstanding_amount: "55000", contract_amount: null, next_installment_amount: null, due_date: null }, { resource_id: "zero", currency: "BRL", outstanding_amount: "0.00000000", contract_amount: "2000", next_installment_amount: "100", due_date: null }, { resource_id: "tiny", currency: "BRL", outstanding_amount: "0.00000001", contract_amount: null, next_installment_amount: null, due_date: null });
  const vehicle = formatBankQuestion(data, { kind: "financings", keyword: "carro", from: "2026-10-01", to: "2026-10-31" }, "Pessoal");
  expect(vehicle).toContain("VEICULOS E UTILITARIOS"); expect(vehicle).toContain(bankMoney("8000.81", "BRL")); expect(vehicle).not.toContain("Imóvel residencial"); expect(vehicle).not.toContain("55.000");
  expect(vehicle).not.toContain("*Nubank*"); expect(vehicle).not.toContain("*Realize*");
  expect(vehicle).toContain("Valor da próxima parcela não informado pelo banco");
  const loans = answer(data, "Mostre meus empréstimos");
  expect(loans).not.toContain("Quitado teste"); expect(loans).toContain("Sem posição teste"); expect(loans).toContain("Saldo pequeno teste");
});
