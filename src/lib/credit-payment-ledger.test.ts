import {expect,it} from "vitest";
import {mergeCreditPayments} from "./credit-payment-ledger";
import {createFinanceLedger,ledgerBalance} from "./finance-ledger";
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
