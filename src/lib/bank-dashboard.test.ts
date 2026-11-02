import {expect,it} from "vitest";
import {bankDashboardAccounts,bankDashboardLoans} from "./bank-dashboard";
import type {BankOverview,BankResource} from "./open-finance-display";
const account:BankResource={id:"account",connection_id:"connection",resource_type:"account",name:"Conta",subtype:null,card_network:null,identification_last4:null,currency:"BRL",available_amount:"100.05",gross_amount:null,net_amount:null,valuation_date:null,synced_at:"2026-10-10"};
it("keeps currencies, negative bank balances and unknown amounts distinct without including credit or investments",()=>{
 const overview={connections:[{id:"connection",institution_name:"Banco"}],resources:[account,{...account,id:"negative",available_amount:"-10.02"},{...account,id:"usd",currency:"USD"},{...account,id:"unknown",available_amount:null},{...account,id:"card",resource_type:"card"},{...account,id:"investment",resource_type:"investment"}]} as BankOverview;
 const groups=bankDashboardAccounts(overview);
 expect(Number(groups.find(g=>g.currency==="BRL")?.total)).toBe(90.03);
 expect(groups.find(g=>g.currency==="BRL")?.missing).toBe(1);
 expect(Number(groups.find(g=>g.currency==="USD")?.total)).toBe(100.05);
 expect(groups.reduce((n,g)=>n+g.accounts.length,0)).toBe(4);
});
it("preserves non-two-decimal currencies and does not claim zero for entirely unknown balances",()=>{
 const groups=bankDashboardAccounts({connections:[],resources:[{...account,currency:"KWD",available_amount:"1.234"},{...account,id:"unknown",available_amount:null}]} as unknown as BankOverview);
 expect(Number(groups.find(g=>g.currency==="KWD")?.total)).toBe(1.234);
 expect(groups.find(g=>g.currency==="KWD")?.accounts[0].rawAmount).toBe("1.234");
 expect(groups.find(g=>g.currency==="BRL")?.total).toBeNull();
});

function loanOverview():BankOverview {
 const connection={id:"connection",institution_name:"Banco teste",status:"active",provider_status:null,scopes:[],consent_expires_at:null,revoked_at:null,last_successful_sync_at:null,created_at:"2026-10-01"};
 return {connections:[connection,{...connection,id:"archived",institution_name:"Banco antigo",status:"revoked",archived_at:"2026-10-01"}],resources:[
  {...account,id:"car",resource_type:"financing",name:"Financiamento do carro"},
  {...account,id:"loan",resource_type:"loan",name:"Crédito pessoal"},
  {...account,id:"usd",resource_type:"loan",name:"Crédito em dólar"},
  {...account,id:"unknown",resource_type:"loan",name:"Contrato sem posição"},
  {...account,id:"paid",resource_type:"loan",name:"Contrato zerado"},
  {...account,id:"tiny",resource_type:"loan",name:"Saldo pequeno"},
  {...account,id:"old",connection_id:"archived",resource_type:"financing",name:"Financiamento antigo"},account,
 ],credit:[
  {resource_id:"car",currency:"BRL",contract_amount:"40000",outstanding_amount:"10000.10",next_installment_amount:"800.50",due_date:"2030-01-10"},
  {resource_id:"loan",currency:"BRL",contract_amount:"5000",outstanding_amount:"2000.20",next_installment_amount:null,due_date:null},
  {resource_id:"usd",currency:"USD",contract_amount:null,outstanding_amount:"99",next_installment_amount:null,due_date:null},
  {resource_id:"paid",currency:"BRL",contract_amount:"100",outstanding_amount:"0.00000000",next_installment_amount:null,due_date:null},
  {resource_id:"tiny",currency:"BRL",contract_amount:null,outstanding_amount:"0.00000001",next_installment_amount:null,due_date:null},
  {resource_id:"old",currency:"BRL",contract_amount:null,outstanding_amount:"50000",next_installment_amount:null,due_date:null},
 ],limits:[],bills:[],sync:[]};
}
it("includes vehicle financing and loans, summing exact positions by currency without cash or archived contracts",()=>{
 const overview=loanOverview(),before=structuredClone(overview),groups=bankDashboardLoans(overview);
 const vehicle=groups.find(g=>g.category==="Parcelas do veículo")!;
 expect(vehicle.total).toBe("10000.10000000");
 expect(groups.find(g=>g.currency==="BRL"&&g.category==="Empréstimos")?.total).toBe("2000.20000001");
 expect(vehicle.loans.find(l=>l.id==="car")).toMatchObject({kind:"Financiamento",nextInstallment:"800.50",finalDueDate:"2030-01-10"});
 expect(groups.find(g=>g.currency==="USD")?.total).toBe("99.00000000");
 expect(groups.flatMap(g=>g.loans).map(l=>l.id)).toEqual(["car","loan","tiny","usd","unknown"]);
 expect(overview).toEqual(before);
});
it("keeps unknown balances and currencies unknown, including positive balances below a cent",()=>{
 const groups=bankDashboardLoans(loanOverview());
 expect(groups.find(g=>g.currency===null)).toMatchObject({total:null,missing:1});
 expect(groups.find(g=>g.currency===null)?.loans[0].rawAmount).toBeNull();
 expect(groups.find(g=>g.category==="Empréstimos"&&g.currency==="BRL")?.loans.find(l=>l.id==="tiny")?.rawAmount).toBe("0.00000001");
});
it("filters loan contracts by category, account and accent-insensitive bank/product search",()=>{
 const overview=loanOverview();
 expect(bankDashboardLoans(overview,{categories:["Parcelas do veículo"],account:"bank:car"})[0].loans.map(l=>l.id)).toEqual(["car"]);
 expect(bankDashboardLoans(overview,{categories:["Empréstimos"]}).flatMap(g=>g.loans).some(l=>l.id==="car")).toBe(false);
 expect(bankDashboardLoans(overview,{search:"credito pessoal"})[0].loans.map(l=>l.id)).toEqual(["loan"]);
 expect(bankDashboardLoans(overview,{search:"carro"})[0].loans[0].nextInstallment).toBe("800.50");
 for(const filters of [{type:"income"},{categories:["Alimentação"]},{account:"manual:car"},{account:"bank:missing"}])expect(bankDashboardLoans(overview,filters)).toEqual([]);
});
it.each(["Sicredi","Banco do Brasil","Itaú","Santander","Banco independente"])("classifies vehicle contracts by purpose at %s, not by bank identity",bank=>{
 const overview=loanOverview();overview.connections[0].institution_name=bank;
 overview.resources[0].name="AQUISICAO_DE_VEICULOS";
 const groups=bankDashboardLoans(overview,{categories:["Parcelas do veículo"]});
 expect(groups).toHaveLength(1);
 expect(groups[0].loans[0]).toMatchObject({id:"car",bank,kind:"Financiamento"});
 expect(groups[0].loans).toHaveLength(1);
});
