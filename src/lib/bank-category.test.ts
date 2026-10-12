import {expect,it} from "vitest";
import {createFinanceLedger,ledgerExpenseGroups} from "./finance-ledger";
import type {BankMovement} from "./open-finance-report";
const movement:BankMovement={id:"test",resource_name:"Conta",institution_name:"Banco teste",resource_type:"account",date:"2026-10-10",description:"Pix enviado - pessoa",amount:"30.00",currency:"BRL",direction:"debit",classification:"unknown",kind:"account_debits",bill_month:null,installment_number:null,installment_count:null};
function entry(extra:Partial<BankMovement>){return createFinanceLedger([],[{...movement,...extra}],"business")[0];}
it.each([
 ["Zé Delivery", "GENERAL_MERCHANDISE_OTHER", "Alimentação"],
 ["Zé Delivery", "ENTERTAINMENT", "Alimentação"],
 ["Compra delivery", "GENERAL_SERVICES", "Alimentação"],
 ["GOOGLE *ADS", "HOME_IMPROVEMENT", "Marketing"],
 ["GOOGLE *Serviços", "HOME_IMPROVEMENT", "Serviços"],
 ["Google Workspace", "HOME_IMPROVEMENT", "Tecnologia"],
 ["FACEBK *123456", "ENTERTAINMENT", "Marketing"],
 ["Facebook Serviços Online", "ENTERTAINMENT", "Marketing"],
 ["Uber Eats", "TRANSPORTATION", "Alimentação"],
 ["Drogasil", "GENERAL_MERCHANDISE", "Saúde"],
 ["DARF", "RENT_AND_UTILITIES", "Impostos"],
])("corrects a bank suggestion using the identifiable merchant %s",(description,source_category,category)=>{
 const result=entry({description,source_category});expect(result.category).toBe(category);expect(result.categorySource).toBe("description");
 expect(result.amount).toBe(30);expect(result.included).toBe(true);
});
it("preserves a chosen category, transfers and income even when a merchant matches",()=>{
 expect(entry({description:"Zé Delivery",user_category:"Evento empresa",source_category:"FOOD_AND_DRINK"}).category).toBe("Evento empresa");
 expect(entry({description:"Facebook",kind:"excluded",classification:"bill_payment"}).included).toBe(false);
 expect(entry({description:"Google",direction:"credit",kind:"credits",source_category:"INCOME_SALARY"}).category).toBe("Salário");
});
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
it("defaults ambiguous Pix and payment intermediaries to Outros without inventing their purpose",()=>{
 for(const extra of [{},{description:"Pix - Mercado Pago"},{description:"Pix recebido - pessoa",direction:"credit",kind:"credits" as const}]){
  const result=entry(extra);
  expect(result.category).toBe("Outros");expect(result.categorySource).toBe("default");
 }
});
it("keeps missing or unsupported bank categories categorized, including card refunds",()=>{
 for(const extra of [{description:"",source_category:null},{description:"Movimentação",source_category:"UNSUPPORTED"},{resource_type:"card",direction:"credit",kind:"credits" as const}]){
  expect(entry(extra).category).toBe("Outros");
 }
});
it("combines default bank categories with existing Outros entries in the expense chart",()=>{
 const entries=createFinanceLedger([{id:"manual",type:"expense",amount:5,category:"Outros",description:"Diversos",date:"2026-10-10",mode:"business",source:"whatsapp"}], [movement],"business");
 expect(ledgerExpenseGroups(entries,"category")).toEqual([{name:"Outros",value:35}]);
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
it("groups IOF, card interest and bank-fee enrichment into banking charges, keeping received interest as investments",()=>{
 for(const extra of [{description:"IOF"},{description:"Juros do cartão"},{source_category:"BANK_FEES_OTHER",description:"Cobrança"}]) expect(entry(extra).category).toBe("Encargos bancários");
 expect(entry({description:"Juros recebidos",direction:"credit",kind:"credits",source_category:"INCOME_INTEREST_EARNED"}).category).toBe("Rendimentos");
});

it("recognizes service receipts with aesthetic/service evidence without guessing every Pix is revenue",()=>{
 expect(entry({description:"Pix recebido - Estética Bela Teste",direction:"credit",kind:"credits",source_category:null}).category).toBe("Serviços");
 expect(entry({description:"Pix recebido - pessoa teste",direction:"credit",kind:"credits",source_category:null}).category).toBe("Outros");
 expect(entry({description:"Reembolso de estética",direction:"credit",kind:"credits",source_category:"INCOME_TAX_REFUND"}).category).toBe("Reembolso");
 expect(entry({description:"Transferência estética",direction:"credit",kind:"excluded",classification:"transfer"}).included).toBe(false);
 expect(entry({description:"Pix recebido - Estética Bela Teste",direction:"credit",kind:"credits",user_category:"Vendas"}).category).toBe("Vendas");
});
