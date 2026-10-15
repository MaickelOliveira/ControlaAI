import {describe,expect,it} from "vitest";
import {answerBillQuestion,parseBillQuestion,paidBillHistoryAnswer,closedBillAnswer} from "./bank-bill-answers";
import type {BankOverview} from "./open-finance-display";
import type {LedgerEntry} from "./finance-ledger";

const overview={
 connections:[{id:"nu",institution_name:"Nubank",status:"active"},{id:"sa",institution_name:"Santander",status:"active"},{id:"re",institution_name:"Realize",status:"active"},{id:"old",institution_name:"Inter",status:"revoked"}],
 resources:[{id:"card-nu",connection_id:"nu",resource_type:"card",name:"Platinum",identification_last4:"1234"},{id:"card-sa",connection_id:"sa",resource_type:"card",name:"Mastercard",identification_last4:"6129"},{id:"card-re",connection_id:"re",resource_type:"card",name:"Cartão Renner"},{id:"card-old",connection_id:"old",resource_type:"card",name:"Antigo"}],
 bills:[
  {id:"nu-latest",resource_id:"card-nu",currency:"BRL",due_date:"2026-10-02",total_amount:"2215.51",minimum_payment_amount:"1054.96",status:"unknown"},
  {id:"nu-old",resource_id:"card-nu",currency:"BRL",due_date:"2026-09-02",total_amount:"704.46",minimum_payment_amount:"105.67",status:"unknown"},
  {id:"sa-latest",resource_id:"card-sa",currency:"BRL",due_date:"2026-10-13",total_amount:"1614.20",minimum_payment_amount:"219.29",status:"unknown"},
  {id:"old",resource_id:"card-old",currency:"BRL",due_date:"2026-10-20",total_amount:"999",minimum_payment_amount:"90",status:"unknown"},
 ],limits:[],credit:[],sync:[],
} as unknown as BankOverview;

describe("perguntas específicas sobre faturas bancárias",()=>{
 it.each([
  ["Quais faturas já venceram e o banco ainda não confirmou pagamento?","overdue"],
  ["Mostre a fatura atual de cada cartão por banco.","latest"],
  ["Qual é o total informado da fatura do Nubank?","total"],
  ["Qual é o pagamento mínimo informado para cada fatura?","minimum"],
  ["Qual fatura tem o vencimento mais próximo?","next"],
  ["Alguma fatura aparece sem data de vencimento?","undated"],
  ["Tem faturas vencidas sem pagamento confirmado?","overdue"],
  ["Liste a última fatura de cada cartão", "latest"],
  ["Qual o mínimo das faturas?", "minimum"],
  ["Qual é a próxima fatura a vencer?", "next"],
  ["Quais faturas não têm vencimento?", "undated"],
  ["Separe o valor da fatura das compras já realizadas no cartão.", "separate"],
  ["Compare fatura e compras dos cartões.", "separate"],
  ["Fatura versus compras no cartão: mostre separado.", "separate"],
  ["Quais bancos confirmaram pagamento de fatura?", "confirmed-payment"],
  ["Liste pagamentos parciais informados nas faturas.", "partial-payment"],
  ["Mostre as faturas do modo Empresa sem misturar com o Pessoal.", "latest"],
  ["Quais cartões não enviaram dados de fatura?", "missing"],
 ] as const)("entende %s",(message,kind)=>expect(parseBillQuestion(message)?.kind).toBe(kind));
 it("não trata pedido de pagamento como consulta",()=>expect(parseBillQuestion("Pague a fatura do Nubank")).toBeNull());
 it("explica histórico de fatura quitada sem prometer baixa automática",()=>{
  const reply=paidBillHistoryAnswer("Uma fatura quitada pode continuar aparecendo no extrato?")!;
  expect(reply).toContain("Sim");expect(reply).toContain("histórico");expect(reply.toLowerCase()).toContain("se o banco informar");
  expect(reply).not.toContain("será marcada");
  expect(paidBillHistoryAnswer("Pague a fatura agora")).toBeNull();
 });
 it("distingue fatura fechada de compra que ainda pode mudar de ciclo",()=>{
  const reply=closedBillAnswer("Qual é a diferença entre fatura fechada e compra em aberto?")!;
  expect(reply).toContain("ciclo encerrado");expect(reply).toContain("ainda não entrou");
  expect(reply).toContain("não significa que já foi paga");
 });
 it("mostra só a última fatura por cartão sem concluir que permanece em aberto",()=>{
  const reply=answerBillQuestion(overview,{kind:"latest"},"2026-10-15","personal");
  expect(reply).toContain("Nubank");expect(reply).toContain("R$ 2.215,51");expect(reply).not.toContain("704,46");expect(reply).not.toContain("Inter");expect(reply).toContain("pode já ter sido paga");
  expect(reply).toContain("Realize · Cartão Renner · fatura não informada pelo banco");
 });
 it("responde com o último total do banco solicitado e não com todo o histórico",()=>{
  const reply=answerBillQuestion(overview,{kind:"total",bankName:"Nubank"},"2026-10-15","personal");
  expect(reply).toContain("2.215,51");expect(reply).not.toContain("704,46");expect(reply).not.toContain("Santander");
 });
 it("lista mínimos da última fatura de cada cartão",()=>{
  const reply=answerBillQuestion(overview,{kind:"minimum"},"2026-10-15","personal");
  expect(reply).toContain("1.054,96");expect(reply).toContain("219,29");expect(reply).not.toContain("105,67");
 });
 it("não chama fatura antiga com pagamento desconhecido de dívida confirmada",()=>{
  const reply=answerBillQuestion(overview,{kind:"overdue"},"2026-10-15","personal");
  expect(reply).toContain("02/10/2026");expect(reply).toContain("13/10/2026");expect(reply).not.toContain("02/09/2026");expect(reply).toContain("não prova que exista dívida");
 });
 it("procura a próxima data em todos os períodos, não só até o fim do mês",()=>{
  const future={...overview,bills:[{...overview.bills[0],due_date:"2026-11-15"},{...overview.bills[2],due_date:"2026-12-01"}]} as BankOverview;
  const reply=answerBillQuestion(future,{kind:"next"},"2026-10-15","personal");
  expect(reply).toContain("15/11/2026");expect(reply).not.toContain("01/12/2026");
 });
 it("responde claramente quando nenhuma fatura recebida está sem data",()=>{
  const reply=answerBillQuestion(overview,{kind:"undated"},"2026-10-15","personal");
  expect(reply).toContain("Nenhuma fatura recebida apareceu sem data");
 });
 it("separa última fatura de compras do mês sem somar a obrigação duas vezes",()=>{
  const entries=[
   {id:"bank:purchase",source:"bank",mode:"personal",status:"posted",included:true,type:"expense",amount:35,date:"2026-10-14",description:"Mercado",bank:{resource_id:"card-nu",resource_type:"card",direction:"debit",currency:"BRL",amount:"35",description:"Mercado"}},
   {id:"bank:payment",source:"bank",mode:"personal",status:"posted",included:false,type:"expense",amount:500,date:"2026-10-14",description:"Pagamento de fatura",bank:{resource_id:"card-nu",resource_type:"card",direction:"debit",currency:"BRL",amount:"500",description:"Pagamento de fatura"}},
  ] as unknown as LedgerEntry[];
  const reply=answerBillQuestion(overview,{kind:"separate"},"2026-10-15","personal",entries);
  expect(reply).toContain("Nubank");expect(reply).toContain("2.215,51");expect(reply).toContain("35,00");
  expect(reply).not.toContain("704,46");expect(reply).not.toContain("500,00");
  expect(reply).toContain("Realize · Cartão Renner");expect(reply).toContain("Fatura não informada pelo banco");
  expect(reply).toContain("nenhuma compra em BRL contabilizável recebida");
  expect(reply.toLowerCase()).toContain("não some");
 });
 it("mostra só bancos com pagamento informado e não chama ausência de confirmação de falta de pagamento",()=>{
  const paid={...overview,bills:[...overview.bills,{id:"paid",resource_id:"card-nu",currency:"BRL",due_date:"2026-08-02",total_amount:"704.46",minimum_payment_amount:"105",status:"paid",payment_amount:"704.46",payment_evidence:true}]} as BankOverview;
  const reply=answerBillQuestion(paid,{kind:"confirmed-payment"},"2026-10-15","personal");
  expect(reply).toContain("Nubank");expect(reply).not.toContain("Santander");expect(reply).not.toContain("Inter");
  const missing=answerBillQuestion(overview,{kind:"confirmed-payment"},"2026-10-15","personal");
  expect(missing).toContain("Nenhum banco conectado informou pagamento de fatura");
  expect(missing).toContain("não prova que não foram pagas");
 });
 it("lista somente pagamentos parciais com evidência recebida",()=>{
  const partial={...overview,bills:[...overview.bills,{id:"partial",resource_id:"card-sa",currency:"BRL",due_date:"2026-09-13",total_amount:"1000",minimum_payment_amount:"100",status:"partial",payment_amount:"250",payment_evidence:true}]} as BankOverview;
  const reply=answerBillQuestion(partial,{kind:"partial-payment"},"2026-10-15","personal");
  expect(reply).toContain("Santander");expect(reply).toContain("250,00");expect(reply).not.toContain("Nubank");
  expect(answerBillQuestion(overview,{kind:"partial-payment"},"2026-10-15","personal")).toContain("Nenhum pagamento parcial informado");
  const noAmount={...overview,bills:[{id:"status-only",resource_id:"card-sa",currency:"BRL",due_date:"2026-10-13",total_amount:"1000",status:"partial",payment_amount:"0"}]} as BankOverview;
  const noAmountReply=answerBillQuestion(noAmount,{kind:"partial-payment"},"2026-10-15","personal");
  expect(noAmountReply).toContain("Não informado");expect(noAmountReply).not.toContain("R$ 0,00");
 });
 it("identifica cartões ativos sem fatura recebida",()=>{
  const reply=answerBillQuestion(overview,{kind:"missing"},"2026-10-15","personal");
  expect(reply).toContain("Realize · Cartão Renner");expect(reply).not.toContain("Nubank");expect(reply).not.toContain("Inter");
 });
});
