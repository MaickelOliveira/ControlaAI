import {expect,it} from "vitest";
import {mergeCreditPayments} from "./credit-payment-ledger";
import {createFinanceLedger,ledgerBalance,ledgerCategoryGroups} from "./finance-ledger";
import type {BankMovement} from "./open-finance-report";
const payment={id:"credit:contract:payment",resource_id:"contract",resource_name:"Financiamento de veículo",institution_name:"Banco Exemplo",institution_id:"bank",resource_type:"financing",date:"2026-09-15",description:"Veículo",amount:"890.10",currency:"BRL",direction:"debit",classification:"loan_repayment",kind:"account_debits",source_type:"LOAN_REPAYMENT"} as BankMovement;
const debit={...payment,id:"cash",resource_id:"account",resource_type:"account",resource_name:"Conta",description:"LIQUIDACAO DE PARCELA",classification:"unknown",source_type:null};
it("classifies historical repayments on their actual paid date, including a zero-balance contract",()=>{
 const entries=createFinanceLedger([],mergeCreditPayments([], [payment]),"personal");
 expect(entries[0]).toMatchObject({date:"2026-09-15",category:"Parcelas do veículo",status:"posted"});
 expect(ledgerBalance(entries).expense).toBe(890.1);
});
it("identifies one explicitly described matching debit and counts its payment once, preserving manual categories",()=>{
 const merged=mergeCreditPayments([debit],[payment]);expect(merged).toHaveLength(1);
 expect(merged[0]).toMatchObject({id:"cash",credit_resource_id:"contract",credit_category:"Parcelas do veículo"});
 expect(ledgerBalance(createFinanceLedger([],merged,"personal")).expense).toBe(890.1);
 const user=mergeCreditPayments([{...debit,user_category:"Categoria minha"}],[payment]);
 expect(createFinanceLedger([],user,"personal")[0].category).toBe("Categoria minha");
});
it("never identifies an unrelated purchase, another bank, different date, fee, or ambiguous contract by amount",()=>{
 for(const row of [{...debit,description:"Compra exemplo"},{...debit,institution_id:"other"},{...debit,date:"2026-09-16"},{...debit,description:"IOF LIQUIDACAO DE PARCELA"}])expect(mergeCreditPayments([row],[payment])).toHaveLength(2);
 expect(mergeCreditPayments([debit],[payment,{...payment,id:"second",resource_id:"second"}])).toHaveLength(3);
});
it.each(["2026-09-15","2026-11-03","2027-01-03"])("reconciles a provider-identified loan debit with its contract payment on %s",date=>{
 const loan={...payment,date,resource_type:"loan",resource_name:"Crédito pessoal",description:"Crédito pessoal",amount:"890.0963"};
 const cash={...debit,date,description:"Parcela Paga | Reforma",source_type:"OPERACAO_CREDITO",source_category:"LOAN_PAYMENTS_OTHER_PAYMENT"};
 const before=structuredClone(cash);
 const merged=mergeCreditPayments([cash],[loan]);
 expect(merged).toHaveLength(1);
 expect(merged[0]).toMatchObject({id:"cash",amount:"890.10",credit_resource_id:"contract",credit_category:"Empréstimos"});
 const entries=createFinanceLedger([],merged,"personal");
 expect(ledgerBalance(entries).expense).toBe(890.1);
 expect(ledgerCategoryGroups(entries,"expense")).toEqual([{name:"Empréstimos",value:890.1}]);
 expect(cash).toEqual(before);
});
it("requires an unambiguous loan debit even when the provider supplies its category",()=>{
 const cash={...debit,description:"Parcela Paga | Reforma",source_category:"LOAN_PAYMENTS_OTHER_PAYMENT"};
 for(const row of [
  {...cash,institution_id:"other"}, {...cash,date:"2026-09-16"}, {...cash,amount:"890.11"}, {...cash,currency:"USD"},
  {...cash,description:"IOF LIQUIDACAO DE PARCELA"},
  {...cash,description:"Pagamento de parcela",source_category:"LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"},
  {...cash,description:"Pagamento de parcela",source_category:"LOAN_PAYMENTS_BNPL"},
 ])expect(mergeCreditPayments([row],[payment])).toHaveLength(2);
 expect(mergeCreditPayments([cash,{...cash,id:"other-cash"}],[payment])).toHaveLength(3);
 expect(mergeCreditPayments([cash],[payment,{...payment,id:"other-payment",resource_id:"other-contract"}])).toHaveLength(3);
});
