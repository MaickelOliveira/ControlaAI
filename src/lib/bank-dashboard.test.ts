import {expect,it} from "vitest";
import {bankDashboardAccounts} from "./bank-dashboard";
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
