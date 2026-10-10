import {expect,it} from "vitest";
import {createFinanceLedger,ledgerExpenseGroups} from "./finance-ledger";
import type {BankMovement} from "./open-finance-report";
const movement:BankMovement={id:"test",resource_name:"Conta",institution_name:"Banco teste",resource_type:"account",date:"2026-10-10",description:"Pix enviado - pessoa",amount:"30.00",currency:"BRL",direction:"debit",classification:"unknown",kind:"account_debits",bill_month:null,installment_number:null,installment_count:null};
function entry(extra:Partial<BankMovement>){return createFinanceLedger([],[{...movement,...extra}],"business")[0];}
it.each([
 ["FOOD_AND_DRINK_GROCERIES","Alimentação"],
 ["TRANSPORTATION_GAS","Transporte"],
 ["MEDICAL_PHARMACIES_AND_SUPPLEMENTS","Saúde"],
 ["GENERAL_SERVICES_EDUCATION","Educação"],
 ["GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT","Impostos"],
 ["GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES","Vestuário"],
 ["RENT_AND_UTILITIES_RENT","Moradia"],
])("uses provider category %s instead of the account origin",(source_category,category)=>{
 expect(entry({source_category}).category).toBe(category);
});
it("categorizes clear descriptions when provider enrichment is absent",()=>{
 expect(entry({description:"Pix enviado - Facebook Serviços Online"}).category).toBe("Marketing");
 expect(entry({description:"Compra Supermercado Exemplo"}).category).toBe("Alimentação");
});
it("does not invent the reason for a Pix to a person or a payment intermediary",()=>{
 expect(entry({}).category).toBe("A categorizar");
 expect(entry({description:"Pix - Mercado Pago"}).category).toBe("A categorizar");
 expect(entry({description:"Pix recebido - pessoa",direction:"credit",kind:"credits"}).category).toBe("A categorizar");
});
it("uses incoming categories and treats card refunds as expenses",()=>{
 expect(entry({source_category:"INCOME_SALARY",direction:"credit",kind:"credits"}).category).toBe("Salário");
 expect(entry({source_category:"FOOD_AND_DRINK_RESTAURANT",resource_type:"card",direction:"credit",kind:"credits"}).category).toBe("Alimentação");
});
it("keeps the owner choice above provider suggestions without changing the source amount",()=>{
 const result=entry({user_category:"Fornecedor especial",source_category:"FOOD_AND_DRINK_GROCERIES"});
 expect(result.category).toBe("Fornecedor especial");expect(result.bank?.source_category).toBe("FOOD_AND_DRINK_GROCERIES");expect(result.amount).toBe(30);
});
it("keeps exclusions excluded even with a chosen spending category",()=>{
 const result=entry({kind:"excluded",classification:"transfer",user_category:"Alimentação"});
 expect(result.included).toBe(false);expect(result.category).toBe("Transferências e pagamentos");
});
it("combines bank categories with WhatsApp categories in charts without editing manual records",()=>{
 const entries=createFinanceLedger([{id:"manual",type:"expense",amount:5,category:"Alimentação",description:"Almoço",date:"2026-10-10",mode:"business",source:"whatsapp"}], [{...movement,source_category:"FOOD_AND_DRINK_GROCERIES"}],"business");
 expect(ledgerExpenseGroups(entries,"category")).toEqual([{name:"Alimentação",value:35}]);
});
