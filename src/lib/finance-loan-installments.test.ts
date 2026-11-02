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
