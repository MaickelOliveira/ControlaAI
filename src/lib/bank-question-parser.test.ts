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
});

it.each(["quanto falta pra min pagar do carro", "Quanto ainda devo no financiamento do carro?", "Quanto falta para quitar minha casa?"])("recognizes remaining financed debt rather than monthly bills: %s", message => {
  expect(parseBankQuestion(message, "2026-10-11")).toMatchObject({ kind: "financings", keyword: /carro/.test(message) ? "carro" : "casa" });
});
it.each(["Pague o financiamento do carro", "Quanto falta pagar do carro e registre 50", "Quanto falta pagar do carro mês passado?"])("does not execute payoff questions as mutations or discard historical filters: %s", message => expect(parseBankQuestion(message, "2026-10-11")).toBeNull());

it.each(["quanto falta pagar do carro da empresa", "quanto falta pagar do carro pessoal", "quanto falta pagar do carro hoje", "quanto falta pagar do carro esta semana"])("does not treat an explicit workspace or date as a bank filter: %s",message=>expect(parseBankQuestion(message,"2026-10-11")).toBeNull());
