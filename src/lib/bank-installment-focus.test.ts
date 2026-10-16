import {describe,expect,it} from "vitest";
import {parseBankInstallmentFocus,formatBankInstallmentFocus} from "./bank-installment-focus";
import type {BankAgenda} from "./open-finance-schedules";

const agenda:BankAgenda={incomplete:false,items:[
 {id:"fee",kind:"installment",description:"ANUIDADE DIFERENCIADA",resource_name:"Gold",resource_id:"gold",institution_name:"Sicredi",due_date:null,amount:"25",currency:"BRL",synced_at:"2026-10-14",observed_installments:1,total_installments:12},
 {id:"future",kind:"installment",description:"Loja de móveis",resource_name:"Gold",resource_id:"gold",institution_name:"Sicredi",due_date:"2026-10-22",amount:"100",currency:"BRL",synced_at:"2026-10-14",observed_installments:2,total_installments:10},
 {id:"undated",kind:"installment",description:"Geladeira",resource_name:"Platinum",resource_id:"platinum",institution_name:"Nubank",due_date:null,amount:"80",currency:"BRL",synced_at:"2026-10-14",observed_installments:3,total_installments:12},
 {id:"finished",kind:"installment",description:"Tênis",resource_name:"Platinum",resource_id:"platinum",institution_name:"Nubank",due_date:null,amount:"50",currency:"BRL",synced_at:"2026-10-14",observed_installments:3,total_installments:3},
]};

describe("perguntas focadas sobre parcelas bancárias",()=>{
 it.each([
  ["Quais compras parceladas ainda têm parcela futura com data?","future-dated"],
  ["Qual é a próxima parcela de cada cartão?","next-by-card"],
  ["Mostre a quantidade total e a última parcela identificada de cada compra parcelada.","position"],
  ["Quais parcelas têm valor informado mas vencimento desconhecido?","undated-valued"],
  ["Separe anuidade de compras parceladas.","separate-annuity"],
  ["Quanto vence em parcelas de cartão na próxima semana?","due-next-week"],
  ["Quais parcelas não têm número total informado?","missing-total"],
 ] as const)("entende %s",(message,kind)=>expect(parseBankInstallmentFocus(message)).toEqual({kind}));
 it("não intercepta edição, pagamento nem perguntas sem filtro claro",()=>{
  expect(parseBankInstallmentFocus("Pague a parcela da geladeira")).toBeNull();
  expect(parseBankInstallmentFocus("Quanto tenho parcelado?")).toBeNull();
 });
 it("mostra apenas compras com parcela futura datada",()=>{
  const answer=formatBankInstallmentFocus(agenda,{kind:"future-dated"},"2026-10-15","Pessoal");
  expect(answer).toContain("Loja de móveis");expect(answer).toContain("22/10/2026");
  expect(answer).not.toContain("ANUIDADE");expect(answer).not.toContain("Geladeira");
  expect(answer).toContain("sem data");
 });
 it("diz por cartão quando a próxima parcela não pode ser identificada",()=>{
  const answer=formatBankInstallmentFocus(agenda,{kind:"next-by-card"},"2026-10-15","Pessoal");
  expect(answer).toContain("Gold");expect(answer).toContain("Loja de móveis");
  expect(answer).toContain("Platinum");expect(answer).toContain("não recebi próxima parcela com data");
  expect(answer).not.toContain("ANUIDADE");
 });
 it("mostra número da parcela por compra, sem confundir anuidade com compra",()=>{
  const answer=formatBankInstallmentFocus(agenda,{kind:"position"},"2026-10-15","Pessoal");
  expect(answer).toContain("2 de 10");expect(answer).toContain("3 de 12");
  expect(answer).not.toContain("ANUIDADE");
 });
 it("separa valores conhecidos sem data e anuidades das compras",()=>{
  const undated=formatBankInstallmentFocus(agenda,{kind:"undated-valued"},"2026-10-15","Pessoal");
  expect(undated).toContain("Geladeira");expect(undated).not.toContain("Loja de móveis");
  const split=formatBankInstallmentFocus(agenda,{kind:"separate-annuity"},"2026-10-15","Pessoal");
  expect(split).toContain("Anuidades (1)");expect(split).toContain("Compras parceladas (3)");
  expect(split).toContain("ANUIDADE DIFERENCIADA");expect(split).toContain("Geladeira");
  expect(split).toContain("mesma descrição não prova duplicidade");
 });
 it("não informa total zero quando a próxima semana não tem parcelas datadas",()=>{
  const answer=formatBankInstallmentFocus(agenda,{kind:"due-next-week"},"2026-10-15","Pessoal");
  expect(answer).toContain("19/10/2026 a 25/10/2026");
  expect(answer).toContain("Loja de móveis");
  expect(answer).not.toContain("Geladeira");
  const unknown=formatBankInstallmentFocus({...agenda,items:agenda.items.filter(item=>!item.due_date)},{kind:"due-next-week"},"2026-10-15","Pessoal");
  expect(unknown).toContain("não há valor confirmado para somar");
  expect(unknown).not.toContain("R$ 0,00");
 });
 it("lista só parcelas sem quantidade total, mesmo quando outras têm posição conhecida",()=>{
  const data={...agenda,items:[...agenda.items,{id:"unknown",kind:"installment" as const,description:"Compra sem total",resource_name:"Gold",institution_name:"Sicredi",due_date:null,amount:"30",currency:"BRL",synced_at:"2026-10-14",observed_installments:2,total_installments:null}]};
  const answer=formatBankInstallmentFocus(data,{kind:"missing-total"},"2026-10-15","Pessoal");
  expect(answer).toContain("Compra sem total");
  expect(answer).not.toContain("Loja de móveis");expect(answer).not.toContain("Geladeira");expect(answer).not.toContain("ANUIDADE");
  const empty=formatBankInstallmentFocus(agenda,{kind:"missing-total"},"2026-10-15","Pessoal");
  expect(empty).toContain("Nenhuma parcela sem número total");
 });
});
