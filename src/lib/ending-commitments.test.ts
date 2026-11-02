import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {endingCommitmentsSummary,formatEndingCommitments,bankEndingCommitments,manualEndingCommitments,type EndingCommitment} from "./ending-commitments";
import type {BankOverview} from "./open-finance-display";
import type {BankInstallmentAnchor} from "./bank-installment-projections";
import type {RecurringTransaction} from "./recurring";
const today="2026-11-02",cutoff="2027-01-31";
const row=(id:string,endDate:string|null,amount=10):EndingCommitment=>({id,endDate,amount,description:`Contrato fictício ${id}`,origin:"Banco fictício",currency:"BRL",monthly:true});
it("adds only installments ending on or before the inclusive cutoff, excluding later and already completed obligations",()=>{
 const rows=[row("nov","2026-11-30",10.01),row("dec","2026-12-20",20.02),row("jan","2027-01-31",30.03),row("after","2027-02-01",999),row("past","2026-10-31",999)];
 expect(endingCommitmentsSummary(rows,today,cutoff)).toMatchObject({monthlyRelief:60.06,unquantified:0,items:[{id:"nov"},{id:"dec"},{id:"jan"}]});
 const text=formatEndingCommitments(rows,today,cutoff,"Pessoal");
 expect(text).toContain("R$ 60,06 por mês");expect(text).toContain("31/01/2027");expect(text).not.toContain("fictício after");expect(text).not.toContain("fictício past");
});
it("does not sum unknown dates, values, currencies or non-monthly charges and never counts the same id twice",()=>{
 const result=endingCommitmentsSummary([row("one",cutoff),row("one",cutoff),row("missing-date",null),{...row("value",cutoff),amount:null},{...row("currency",cutoff),currency:"USD"},{...row("weekly",cutoff),monthly:false}],today,cutoff);
 expect(result).toMatchObject({monthlyRelief:10,unquantified:4});
 expect(result.items).toHaveLength(1);
});
it("keeps a bank installment with no due day outside a partial-month cutoff",()=>{
 const item={...row("month-only",cutoff),monthOnly:true};
 expect(endingCommitmentsSummary([item],today,"2027-01-15")).toMatchObject({monthlyRelief:0,unquantified:1});
 expect(endingCommitmentsSummary([item],today,cutoff).monthlyRelief).toBe(10);
});
it("combines bank loans, manual missing-field vehicle plans and positively anchored card installments",()=>{
 const data={connections:[{id:"bank",status:"active",institution_name:"Banco fictício"}],resources:[{id:"loan",connection_id:"bank",resource_type:"loan",name:"Crédito fictício"},{id:"car",connection_id:"bank",resource_type:"financing",name:"Veículo fictício"},{id:"card",connection_id:"bank",resource_type:"card",name:"Cartão fictício"},{id:"closed",connection_id:"bank",resource_type:"loan",name:"Crédito encerrado"}],credit:[{resource_id:"loan",currency:"BRL",outstanding_amount:"500",next_installment_amount:"35",due_date:"2026-12-20",periodicity:"MENSAL"},{resource_id:"car",currency:"BRL",outstanding_amount:"700",next_installment_amount:null,due_date:"2027-05-20"},{resource_id:"closed",outstanding_amount:"0",next_installment_amount:"90",currency:"BRL",due_date:"2026-12-20",periodicity:"MENSAL"}],installment_plans:[{resource_id:"car",amount:"50",currency:"BRL",first_due_date:"2026-06-20",last_due_date:"2027-05-20"}]} as BankOverview;
 const anchor={id:"purchase",resource_id:"card",description:"Compra fictícia",institution_name:"Banco fictício",resource_name:"Cartão fictício",amount:"20",currency:"BRL",bill_month:"2026-10-01",observed_installments:2,total_installments:5,synced_at:today} as BankInstallmentAnchor;
 const rows=bankEndingCommitments(data,[anchor],today);
 expect(rows).toHaveLength(3);
 expect(endingCommitmentsSummary(rows,today,cutoff)).toMatchObject({monthlyRelief:55,items:[{id:"credit:loan"},{id:"card:purchase"}]});
 expect(formatEndingCommitments(rows,today,cutoff,"Pessoal")).not.toContain("Veículo fictício");
 expect(bankEndingCommitments({...data,connections:[{...data.connections[0],status:"revoked"}]},[anchor],today)).toEqual([]);
});
it("preserves a manual monthly forecast and avoids adding its mirrored imported installment",()=>{
 const registered=[{id:"manual",type:"expense",status:"active",recurrenceType:"installment",description:"Notebook fictício",amount:7,totalInstallments:5,paidInstallments:2,nextDueDate:"2026-11-15",repeatUnit:"monthly"}] as RecurringTransaction[];
 const imported=[{description:"Notebook fictício",amount:7,current:2,total:5,remaining:3,date:"2026-10-15",mode:"personal" as const}];
 const rows=manualEndingCommitments(registered,imported);
 expect(rows).toHaveLength(1);expect(rows[0].endDate).toBe("2027-01-15");
 expect(endingCommitmentsSummary(rows,today,cutoff).monthlyRelief).toBe(7);
});
it("keeps the bank's still-active patterns with older observed months and counts a positively merged purchase once",()=>{
 const anchor={id:"first",resource_id:"card",description:"Compra fictícia",institution_name:"Banco fictício",resource_name:"Cartão fictício",amount:"10",currency:"BRL",bill_month:"2026-01-01",observed_installments:1,total_installments:12,synced_at:today} as BankInstallmentAnchor;
 const last={...anchor,id:"last",amount:"9.95",bill_month:"2026-11-01",observed_installments:11};
 const data={connections:[{id:"bank",status:"active",institution_name:"Banco fictício"}],resources:[{id:"card",connection_id:"bank",resource_type:"card",name:"Cartão fictício"}],credit:[],agenda:{incomplete:false,items:[{id:"first",kind:"installment",description:"Compra fictícia",source_schedule_ids:["first","last"]}]}} as unknown as BankOverview;
 const rows=bankEndingCommitments(data,[anchor,last],today);
 expect(rows).toHaveLength(1);expect(endingCommitmentsSummary(rows,today,cutoff)).toMatchObject({monthlyRelief:9.95,items:[{endDate:"2026-12-31"}]});
 const older={...anchor,id:"older",bill_month:"2026-02-01"};
 expect(endingCommitmentsSummary(bankEndingCommitments({...data,agenda:undefined},[older],today),today,cutoff).monthlyRelief).toBe(10);
 const partial={...data,agenda:{incomplete:false,items:[{id:"first",purchase_date:"2025-12-20",source_ordinals:[1]},{id:"last",purchase_date:"2025-12-20",source_ordinals:[11,12]}]}} as unknown as BankOverview;
 expect(endingCommitmentsSummary(bankEndingCommitments(partial,[anchor,last],today),today,cutoff)).toMatchObject({monthlyRelief:9.95,unquantified:1});
});
