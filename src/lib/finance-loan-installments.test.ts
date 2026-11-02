import {expect,it} from "vitest";
import {categoriesWithLoanInstallments,financeLoanInstallments} from "./finance-loan-installments";
import {ledgerBalance,type LedgerEntry} from "./finance-ledger";
import type {BankOverview} from "./open-finance-display";
const overview={connections:[{id:"a",institution_name:"Banco A",status:"active"},{id:"b",institution_name:"Banco B",status:"active"}],resources:[{id:"l1",connection_id:"a",resource_type:"loan",name:"Pessoal"},{id:"l2",connection_id:"b",resource_type:"loan",name:"Consignado"},{id:"car",connection_id:"a",resource_type:"financing",name:"Veículo"}],credit:[{resource_id:"l1",currency:"BRL",outstanding_amount:"1000",next_installment_amount:"100.125"},{resource_id:"l2",currency:"BRL",outstanding_amount:"2000",next_installment_amount:"200"},{resource_id:"car",currency:"BRL",outstanding_amount:"3000",next_installment_amount:null}]} as unknown as BankOverview;
const filters={from:"2026-11-01",to:"2026-11-30"},today="2026-11-02";
const payment={id:"paid",date:today,type:"expense",category:"Empréstimos",amount:100.13,included:true,source:"bank",status:"posted",bank:{resource_id:"account-a",institution_name:"Banco A",currency:"BRL"}} as LedgerEntry;
it("sums every current installment in cents, keeps vehicle separate and does not turn debt into spending",()=>{
 const loans=financeLoanInstallments(overview,[],filters,today);
 expect(loans).toHaveLength(3);expect(loans.find(l=>l.id==="car")?.category).toBe("Parcelas do veículo");expect(loans.find(l=>l.id==="car")?.amount).toBeNull();
 expect(categoriesWithLoanInstallments([],loans)).toEqual([{name:"Empréstimos",value:300.13,forecast:300.13}]);
 expect(ledgerBalance([]).expense).toBe(0);
});
it("counts an unambiguous identified bank payment once without removing its ledger record",()=>{
 const loans=financeLoanInstallments(overview,[payment],filters,today);
 expect(loans[0].recordedId).toBe("paid");
 expect(categoriesWithLoanInstallments([payment],loans)).toEqual([{name:"Empréstimos",value:300.13,forecast:200}]);
 expect(ledgerBalance([payment]).expense).toBe(100.13);
 const other={...payment,bank:{...payment.bank!,institution_name:"Unrelated bank"}};
 expect(financeLoanInstallments(overview,[other],filters,today)[0].recordedId).toBeUndefined();
});
it("does not extrapolate current installments into past/future or partial months and respects filters",()=>{
 expect(financeLoanInstallments(overview,[],{from:"2026-10-01",to:"2026-10-31"},today)).toEqual([]);
 expect(financeLoanInstallments(overview,[],{from:"2026-12-01",to:"2026-12-31"},today)).toEqual([]);
 expect(financeLoanInstallments(overview,[],{...filters,from:today},today)).toEqual([]);
 expect(financeLoanInstallments(overview,[],{...filters,type:"income"},today)).toEqual([]);
 expect(financeLoanInstallments(overview,[],{...filters,categories:["Parcelas do veículo"]},today)).toHaveLength(1);
 expect(financeLoanInstallments(overview,[],{...filters,account:"bank:l2"},today)).toHaveLength(1);
});
it("leaves unavailable, foreign-currency and disconnected installments outside the real total",()=>{
 const foreign={...overview,credit:overview.credit.map(c=>({...c,currency:"USD"})),connections:overview.connections.map(c=>c.id==="b"?{...c,status:"revoked"}:c)};
 const loans=financeLoanInstallments(foreign,[],filters,today);
 expect(loans).toHaveLength(2);expect(categoriesWithLoanInstallments([],loans)).toEqual([]);
});
it("projects the user's vehicle plan for past and future months only until the chosen end, without posting payments",()=>{
 const plan={resource_id:"car",amount:"890.10",currency:"BRL",first_due_date:"2026-09-30",last_due_date:"2026-12-30"};
 const data={...overview,installment_plans:[plan]};
 const dates=financeLoanInstallments(data,[],{from:"2026-09-01",to:"2026-12-31",categories:["Parcelas do veículo"]},today);
 expect(dates.map(p=>p.dueDate)).toEqual(["2026-09-30","2026-10-30","2026-11-30","2026-12-30"]);
 expect(new Set(dates.map(p=>p.id)).size).toBe(4);
 expect(categoriesWithLoanInstallments([],dates)).toEqual([{name:"Parcelas do veículo",value:3560.4,forecast:3560.4}]);
 expect(financeLoanInstallments(data,[],{from:"2027-01-01",to:"2027-01-31"},today)).toEqual([]);
 expect(ledgerBalance([]).expense).toBe(0);
 const paid={...payment,amount:890.1,category:"Categoria minha",bank:{...payment.bank!,resource_id:"car"}};
 const current=financeLoanInstallments(data,[paid],filters,today);
 expect(current.find(p=>p.resourceId==="car")?.recordedId).toBe("paid");
 expect(financeLoanInstallments(data,[{...paid,amount:50}],filters,today).find(p=>p.resourceId==="car")?.recordedId).toBeUndefined();
});
