import {expect,it} from "vitest";
import {financeExpensePlan} from "./finance-expense-plan";
import {createFinanceLedger,ledgerBalance,type LedgerEntry} from "./finance-ledger";
import {unrepresentedBankSchedules} from "./finance-bank-schedules";
import type {BankAgendaItem} from "./open-finance-schedules";
import type {BankInstallmentProjection} from "./bank-installment-projections";
import type {LoanInstallment} from "./finance-loan-installments";
import type {BankMovement} from "./open-finance-report";
const loan:LoanInstallment={id:"loan-month",resourceId:"loan",name:"Crédito fictício",bank:"Banco fictício",category:"Empréstimos",amount:30,currency:"BRL",month:"2026-11"};
const installment:BankInstallmentProjection={id:"purchase",resource_id:"card",description:"Compra fictícia",resource_name:"Cartão fictício",institution_name:"Banco fictício",amount:"20.00",currency:"BRL",bill_month:"2026-10",synced_at:"2026-11-01",observed_installments:1,total_installments:3,month:"2026-11",position:2,total:3,observed:false};
const subscription:BankAgendaItem={id:"subscription",resource_id:"card",kind:"recurring",description:"Assinatura fictícia",institution_name:"Banco fictício",resource_name:"Cartão fictício",due_date:"2026-11-15",amount:"10.00",currency:"BRL",synced_at:"2026-11-01"};
const base={posted:[] as LedgerEntry[],pending:[] as LedgerEntry[],recurring:[],loans:[],installments:[],schedules:[],from:"2026-11-01",to:"2026-11-30"};
const movement=(patch:Partial<BankMovement>):BankMovement=>({id:"movement",resource_id:"card",resource_name:"Cartão fictício",institution_name:"Banco fictício",resource_type:"card",date:"2026-11-15",description:"Compra fictícia",amount:"20.00",currency:"BRL",direction:"debit",classification:"purchase",kind:"card_purchases",bill_month:"2026-11",installment_number:null,installment_count:null,...patch});
it("starts the month with loans, vehicle, card installments, recurring accounts and WhatsApp commitments already in the budget",()=>{
 const pending=createFinanceLedger([{id:"whatsapp",type:"expense",amount:5,description:"Conta fictícia",category:"Moradia",date:"2026-11-20",mode:"personal",source:"whatsapp",status:"pending"}],[],"personal");
 const plan=financeExpensePlan({...base,pending,loans:[loan,{...loan,id:"vehicle-month",category:"Parcelas do veículo",amount:40}],installments:[installment],schedules:[subscription],recurring:[{id:"rent",type:"expense",amount:15,category:"Moradia",status:"active"}]});
 expect(plan).toMatchObject({recorded:0,forecast:120,total:120,unquantified:0});
 expect(plan.groups.reduce((n,g)=>n+g.value,0)).toBe(120);
 expect(ledgerBalance(pending)).toEqual({income:0,expense:0,balance:0});
});
it("moves a received loan payment out of forecasts without doubling the monthly total",()=>{
 const before=financeExpensePlan({...base,loans:[loan]});
 const posted=createFinanceLedger([], [movement({id:"payment",resource_id:"loan",resource_type:"loan",amount:"30.00",description:"Parcela empréstimo",credit_category:"Empréstimos"})],"personal");
 const after=financeExpensePlan({...base,posted,loans:[{...loan,recordedId:posted[0].id}]});
 expect(before).toMatchObject({total:30,forecast:30,recorded:0});
 expect(after).toMatchObject({total:30,forecast:0,recorded:30});
});
it("includes Pix, card purchases and WhatsApp records alongside outstanding bank subscriptions",()=>{
 const posted=createFinanceLedger([{id:"chat",type:"expense",amount:3,category:"Outros",description:"Compra fictícia",date:"2026-11-15",mode:"personal",source:"whatsapp"}],[movement({id:"pix",resource_type:"account",amount:"5.00",kind:"account_debits"}),movement({id:"card",amount:"7.00"})],"personal");
 expect(financeExpensePlan({...base,posted,schedules:[subscription]})).toMatchObject({recorded:15,forecast:10,total:25});
});
it("replaces a bank subscription prediction when its dated card entry arrives",()=>{
 const posted=createFinanceLedger([],[movement({id:"subscription-payment",description:subscription.description,amount:subscription.amount})],"personal");
 const schedules=unrepresentedBankSchedules([subscription],posted,[]);
 expect(financeExpensePlan({...base,posted,schedules})).toMatchObject({total:10,forecast:0,recorded:10});
 expect(financeExpensePlan({...base,schedules:[subscription]}).total).toBe(10);
});
it("keeps unknown values, foreign currencies and unanchored dates visible but outside the real total",()=>{
 const result=financeExpensePlan({...base,loans:[{...loan,amount:null},{...loan,id:"foreign",currency:"USD"}],schedules:[{...subscription,due_date:null},{...subscription,id:"currency",currency:null}]});
 expect(result).toMatchObject({total:0,forecast:0,unquantified:4});
});
it("counts one anchored installment for the selected month, with cent rounding and refunds preserved",()=>{
 const posted=createFinanceLedger([],[movement({id:"refund",amount:"0.10",direction:"credit"})],"personal");
 const result=financeExpensePlan({...base,posted,schedules:[{...subscription,kind:"installment",due_date:null,last_observed_month:"2026-10-01",last_observed_installment:1,total_installments:3,amount:"0.20"}]});
 expect(result).toMatchObject({recorded:-0.1,forecast:0.2,total:0.1});
 expect(financeExpensePlan({...base,schedules:[{...subscription,kind:"bill"}]}).total).toBe(0);
});

it("keeps forecast amounts in genuine expense categories without creating billing-type categories",()=>{
 const result=financeExpensePlan({...base,installments:[installment],schedules:[subscription]});
 expect(result.groups).toEqual([{name:"Outros",value:20,forecast:20},{name:"Assinaturas",value:10,forecast:10}]);
 expect(result.total).toBe(30);
 expect(result.groups.some(g=>/recorrentes|parceladas/i.test(g.name))).toBe(false);
});
