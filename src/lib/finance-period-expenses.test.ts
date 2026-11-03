import {expect,it} from "vitest";
import {financePeriodExpenses} from "./finance-period-expenses";
import {createFinanceLedger,ledgerBalance,type FinanceLedgerData} from "./finance-ledger";
import type {BankOverview} from "./open-finance-display";
import type {BankMovement} from "./open-finance-report";
const filters={from:"2026-11-01",to:"2026-11-30",type:"all" as const,categories:[] as string[],search:""};
const overview={connections:[{id:"bank",institution_name:"Banco fictício",status:"active"}],resources:[{id:"loan",connection_id:"bank",resource_type:"loan",name:"Pessoal"},{id:"car",connection_id:"bank",resource_type:"financing",name:"Veículo"},{id:"card",connection_id:"bank",resource_type:"card",name:"Cartão"}],credit:[{resource_id:"loan",currency:"BRL",outstanding_amount:"1000",next_installment_amount:"300"},{resource_id:"car",currency:"BRL",outstanding_amount:"2000",next_installment_amount:null}],limits:[],bills:[],sync:[],installment_plans:[{resource_id:"car",currency:"BRL",amount:"800",first_due_date:"2026-10-20",last_due_date:"2026-12-20"}],agenda:{items:[{id:"subscription",resource_id:"card",kind:"recurring",description:"Netflix",institution_name:"Banco fictício",resource_name:"Cartão",due_date:"2026-11-15",amount:"20.00",currency:"BRL",synced_at:"2026-11-01"}]}} as unknown as BankOverview;
const movement=(patch:Partial<BankMovement>={}):BankMovement=>({id:"pix",resource_id:"cash",resource_name:"Conta",institution_name:"Banco fictício",resource_type:"account",date:"2026-11-05",description:"Mercado",amount:"50",currency:"BRL",direction:"debit",classification:"purchase",kind:"account_debits",user_category:"Alimentação",bill_month:null,installment_number:null,installment_count:null,...patch});
function data():FinanceLedgerData{
 const movements=[movement()];
 const finances=createFinanceLedger([{id:"chat",type:"expense",amount:10,category:"Delivery",description:"Jantar",date:"2026-11-05",mode:"personal",source:"whatsapp"},{id:"pending",type:"expense",amount:30,category:"Moradia",description:"Conta",date:"2026-11-10",mode:"personal",status:"pending"}],movements,"personal");
 return {finances,balance:ledgerBalance(finances),totalBalance:ledgerBalance(finances),bank:{overview,report:{...filters,movements,totals:[],next:null,missing_dates:0,history_complete:false,sync_pending:false,last_successful_sync_at:null}},installmentAnchors:{items:[],incomplete:false}};
}
it("feeds the category chart with posted purchases, all loan/vehicle forecasts, subscriptions and manual commitments",()=>{
 const ledger=data();const before=structuredClone(ledger);
 const result=financePeriodExpenses(ledger,[{id:"rent",type:"expense",category:"Moradia",description:"Aluguel",amount:100,status:"active",nextDueDate:"2026-11-20"}],filters,"2026-11-03");
 expect(result.expensePlan).toMatchObject({recorded:60,forecast:1250,total:1310,unquantified:0});
 expect(result.expensePlan.groups).toEqual([{name:"Parcelas do veículo",value:800,forecast:800},{name:"Empréstimos",value:300,forecast:300},{name:"Moradia",value:130,forecast:130},{name:"Alimentação",value:50,forecast:0},{name:"Assinaturas",value:20,forecast:20},{name:"Delivery",value:10,forecast:0}]);
 expect(ledger).toEqual(before);expect(ledgerBalance(ledger.finances).expense).toBe(60);
});
it("replaces the vehicle prediction after the bank reports its payment even when the amount changed",()=>{
 const ledger=data();const payment=movement({id:"car-payment",resource_id:"car",resource_type:"financing",description:"Veículo",amount:"817.35",user_category:null,source_type:"LOAN_REPAYMENT",credit_category:"Parcelas do veículo"});
 ledger.bank!.report.movements.push(payment);ledger.finances.push(...createFinanceLedger([],[payment],"personal"));
 const result=financePeriodExpenses(ledger,[],{...filters,categories:["Parcelas do veículo"]},"2026-11-03");
 expect(result.expensePlan).toMatchObject({recorded:817.35,forecast:0,total:817.35});
});
it("applies category, search, income and bank filters before calculating the shared chart",()=>{
 expect(financePeriodExpenses(data(),[],{...filters,categories:["Empréstimos"]},"2026-11-03").expensePlan.total).toBe(300);
 expect(financePeriodExpenses(data(),[],{...filters,search:"Netflix"},"2026-11-03").expensePlan.total).toBe(20);
 expect(financePeriodExpenses(data(),[],{...filters,type:"income"},"2026-11-03").expensePlan.total).toBe(0);
 expect(financePeriodExpenses(data(),[],{...filters,account:"manual:other"},"2026-11-03").expensePlan.total).toBe(0);
});
it("includes a card installment in the selected month with the same category as Finanças",()=>{
 const ledger=data();ledger.installmentAnchors={items:[{id:"purchase",resource_id:"card",description:"Compra fictícia",resource_name:"Cartão",institution_name:"Banco fictício",amount:"20",currency:"BRL",bill_month:"2026-10",synced_at:"2026-11-01",observed_installments:1,total_installments:3}],incomplete:false};
 const result=financePeriodExpenses(ledger,[],{...filters,categories:["Outros"]},"2026-11-03");
 expect(result.projectedInstallments).toHaveLength(1);expect(result.expensePlan).toMatchObject({total:20,forecast:20,recorded:0});
});
