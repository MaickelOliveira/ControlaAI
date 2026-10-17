import { expect, it } from "vitest";
import { parseBankQuestion } from "./bank-question-parser";
it.each([
  ["Quanto tenho de empréstimo?", "loans"], ["Quanto eu tenho em empréstimos?", "loans"],
  ["Zelo, quanto eu devo em empréstimos no Nubank?", "loans"], ["Quanto estou devendo em empréstimos?", "loans"],
  ["Quais são os meus empréstimos?", "loans"], ["Me mostre os empréstimos em todos os bancos conectados", "loans"],
  ["Quantos empréstimos eu tenho em cada um dos bancos?", "loans"], ["Me mostra meus empréstimos no Sicredi", "loans"],
  ["Quanto eu tenho de financiamentos?", "financings"], ["Quanto devo em financiamentos no banco Inter?", "financings"],
  ["Quais são os meus financiamentos?", "financings"], ["Quantos financiamentos tenho nos meus bancos?", "financings"],
  ["Qual é o meu limite disponível?", "limits"], ["Quanto crédito disponível eu tenho no Nubank?", "limits"],
  ["Quanto eu tenho de crédito disponível no cartão do Nubank?", "limits"], ["Qual meu limite total no cartão Nubank?", "limits"],
  ["Quanto já usei do limite no Nubank?", "limits"], ["Mostre meus limites dos cartões", "limits"],
  ["Rita, qual o meu limite no cartão final 1234?", "limits"], ["Por favor, Zelo, qual o limite do cartão Nubank?", "limits"],
  ["Qual o meu saldo no banco Santander?", "balances"], ["Qual meu saldo disponível no Nubank?", "balances"],
  ["Me mostre os saldos das contas bancárias", "balances"], ["Quanto tenho de saldo nos bancos?", "balances"],
  ["Como estão meus investimentos?", "investments"], ["Quanto tenho investido no Inter?", "investments"],
  ["Quais são os meus investimentos no banco XP?", "investments"], ["Me mostre meus investimentos", "investments"],
  ["Quais são as minhas faturas?", "bills"], ["Qual o valor da minha fatura no Nubank?", "bills"],
  ["Quanto está a minha fatura do cartão Nubank?", "bills"], ["Me mostre as faturas no Santander", "bills"],
  ["Quanto gastei mês passado?", "spending"], ["Quanto gastei nos cartões mês passado?", "spending"],
  ["Quanto eu gastei no Nubank mês passado?", "spending"], ["Quanto gastei no cartão Nubank mês passado?", "spending"],
  ["Quanto gastamos nos bancos conectados neste mês?", "spending"], ["Quanto gastei em todos os bancos?", "spending"],
])("recognizes %s", (message, kind) => expect(parseBankQuestion(message, "2026-10-11")).toMatchObject({ kind }));
it.each(["Registre um empréstimo de 500", "Pague meu empréstimo", "Cancele a conta do Nubank", "Quanto gastei com farmácia?", "Qual era meu limite mês passado?", "Mostre meus empréstimos vencidos", "Qual meu saldo?", "Meu saldo", "Qual o valor da fatura vencida?", "Quais empréstimos acima de 500?", "Mostre meus investimentos de 2025", "Quanto tenho de empréstimos e financiamentos?", "Quero contratar um empréstimo"]) ("does not reinterpret a mutation, period balance or unsupported filter: %s", message => expect(parseBankQuestion(message, "2026-10-11")).toBeNull());
it("retains the exact institution phrase and card suffix", () => {
  expect(parseBankQuestion("Qual o limite disponível no cartão do Nubank final 1234?", "2026-10-11")).toMatchObject({ bankName: "nubank", last4: "1234" });
  expect(parseBankQuestion("Qual saldo no Banco do Brasil?", "2026-10-11")).toMatchObject({ bankName: "do brasil" });
  expect(parseBankQuestion("Qual saldo no Banco Agora?", "2026-10-11")).toMatchObject({ bankName: "agora" });
});
it("treats 'each account now' as a balance request, not a bank name", () => {
  expect(parseBankQuestion("Qual o saldo disponível em cada conta agora?", "2026-10-15"))
    .toMatchObject({kind:"balances"});
  expect(parseBankQuestion("Qual o saldo disponível em cada conta agora?", "2026-10-15")?.bankName).toBeUndefined();
});
it("recognizes focused questions about negative and missing account balances", () => {
  expect(parseBankQuestion("Existe alguma conta com saldo negativo?", "2026-10-15"))
    .toMatchObject({kind:"balances",balanceFilter:"negative"});
  expect(parseBankQuestion("Existe alguma conta pessoal com saldo negativo? Mostre somente essas contas.", "2026-10-15"))
    .toMatchObject({kind:"balances",balanceFilter:"negative"});
  expect(parseBankQuestion("Quais contas conectadas não enviaram saldo?", "2026-10-15"))
    .toMatchObject({kind:"balances",balanceFilter:"missing"});
});
it("treats the last received bank update as a current snapshot, without opening historical periods", () => {
  expect(parseBankQuestion("Qual era o saldo informado por cada banco na última atualização?", "2026-10-15"))
    .toMatchObject({kind:"balances",latestSnapshot:true});
  expect(parseBankQuestion("Qual era o saldo informado por cada banco mês passado?", "2026-10-15")).toBeNull();
});
it("recognizes focused card-limit questions without inventing a bank filter", () => {
  expect(parseBankQuestion("Quanto do limite de cada cartão já foi usado?", "2026-10-15"))
    .toMatchObject({kind:"limits",limitView:"used"});
  expect(parseBankQuestion("Mostre apenas os cartões com limite disponível informado.", "2026-10-15"))
    .toMatchObject({kind:"limits",limitView:"available-known"});
  expect(parseBankQuestion("Há linhas de crédito compartilhadas que não devem ser somadas?", "2026-10-15"))
    .toMatchObject({kind:"limits",limitView:"shared"});
  expect(parseBankQuestion("Algum limite recebido está inconsistente com o total e o utilizado?", "2026-10-15"))
    .toMatchObject({kind:"limits",limitView:"inconsistent"});
  expect(parseBankQuestion("Qual cartão tem o maior limite disponível?", "2026-10-15"))
    .toMatchObject({kind:"limits",limitView:"max-available"});
  expect(parseBankQuestion("Qual cartão tem o menor limite disponível?", "2026-10-15"))
    .toMatchObject({kind:"limits",limitView:"min-available"});
});
it("routes a joint balance-and-limit coverage question to received bank data", () => {
  expect(parseBankQuestion("Explique quais saldos e limites ainda dependem de atualização bancária.","2026-10-15"))
    .toMatchObject({kind:"coverage"});
});

it.each(["quanto falta pra min pagar do carro", "Quanto ainda devo no financiamento do carro?", "Quanto falta para quitar minha casa?"])("recognizes remaining financed debt rather than monthly bills: %s", message => {
  expect(parseBankQuestion(message, "2026-10-11")).toMatchObject({ kind: "financings", keyword: /carro/.test(message) ? "carro" : "casa" });
});
it("recognizes the next installment of a vehicle financing without treating it as a card installment", () => {
  expect(parseBankQuestion("Qual é o valor da próxima parcela do financiamento do meu carro no Sicredi? Se não constar nos dados bancários, diga isso claramente.", "2026-10-11"))
    .toMatchObject({kind:"financings",keyword:"carro",bankName:"sicredi"});
});
it("recognizes the next installment across all personal loans", () => {
  expect(parseBankQuestion("Qual é o valor da próxima parcela de cada empréstimo? Avise quais bancos não informaram esse valor.", "2026-10-11"))
    .toMatchObject({kind:"loans"});
});
it.each([
  "Qual é o saldo devedor de cada empréstimo?",
  "Mostre o saldo devedor de todos os meus empréstimos.",
  "Quanto falta pagar em cada empréstimo?",
])("recognizes each-loan balance without treating the rest of the sentence as a bank: %s", message => {
  expect(parseBankQuestion(message,"2026-10-15")).toMatchObject({kind:"loans",debtView:"balance"});
  expect(parseBankQuestion(message,"2026-10-15")?.bankName).toBeUndefined();
});
it.each([
  ["Qual é o valor contratado de cada empréstimo?","contracted"],
  ["Qual é o valor da próxima parcela de cada empréstimo?","next-installment"],
  ["Quais empréstimos não informaram o valor da próxima parcela?","missing-next-installment"],
  ["Quais empréstimos não informaram vencimento final?","missing-due-date"],
  ["Quais empréstimos têm saldo devedor zero informado?","zero"],
  ["Mostre empréstimos ativos sem incluir contratos de saldo zero.","positive"],
  ["Qual empréstimo tem o maior saldo devedor?","max-balance"],
  ["Qual empréstimo tem o menor saldo devedor positivo?","min-positive"],
])("recognizes the requested loan field: %s",(message,debtView)=>{
  expect(parseBankQuestion(message,"2026-10-15")).toMatchObject({kind:"loans",debtView});
  expect(parseBankQuestion(message,"2026-10-15")?.bankName).toBeUndefined();
});
it("understands a natural follow-up asking for each loan's final date",()=>{
  const question="Quando termina cada empréstimo pessoal? Liste as datas finais que o banco informou e indique os contratos sem data.";
  expect(parseBankQuestion(question,"2026-10-17")).toMatchObject({kind:"loans",debtView:"due-date"});
  expect(parseBankQuestion(question,"2026-10-17")?.bankName).toBeUndefined();
  expect(parseBankQuestion("Quando terminava cada empréstimo no mês passado?","2026-10-17")).toBeNull();
});
it("recognizes settled loans without accepting the rest of a sentence as a bank name", () => {
  expect(parseBankQuestion("Quais empréstimos já estão quitados? Separe por banco e não conte como dívida.", "2026-10-11"))
    .toMatchObject({kind:"loans",settledOnly:true});
  expect(parseBankQuestion("Quais empréstimos atrasados? Separe por banco.", "2026-10-11")).toBeNull();
});
it.each(["Pague o financiamento do carro", "Quanto falta pagar do carro e registre 50", "Quanto falta pagar do carro mês passado?"])("does not execute payoff questions as mutations or discard historical filters: %s", message => expect(parseBankQuestion(message, "2026-10-11")).toBeNull());

it.each(["quanto falta pagar do carro da empresa", "quanto falta pagar do carro pessoal", "quanto falta pagar do carro hoje", "quanto falta pagar do carro esta semana"])("does not treat an explicit workspace or date as a bank filter: %s",message=>expect(parseBankQuestion(message,"2026-10-11")).toBeNull());
