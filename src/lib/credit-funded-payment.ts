import type {BankMovement,CreditReconciliation} from "./open-finance-report";

/** These BRL snapshots must be whole cents; never round a mismatch into a match. */
export function creditPixCents(value:unknown):bigint|null {
 if(typeof value!=="string"||!/^\d{1,16}(?:\.\d{1,8})?$/.test(value))return null;
 const [whole,fraction=""]=value.split(".");
 if(!/^0*$/.test(fraction.slice(2)))return null;
 const cents=BigInt(whole)*BigInt(100)+BigInt((fraction+"00").slice(0,2));
 return cents<=BigInt(Number.MAX_SAFE_INTEGER)?cents:null;
}
export function isCardCreditOperation(movement:BankMovement):boolean {
 const cents=creditPixCents(movement.amount);
 return movement.resource_type==="card"&&movement.direction==="debit"&&movement.currency==="BRL"
  &&movement.source_type==="OPERACOES_CREDITO_CONTRATADAS_CARTAO"&&movement.kind!=="excluded"
  &&!['bill_payment','transfer','investment'].includes(movement.classification)&&cents!==null&&cents>BigInt(0);
}
export function isPixPayment(movement:BankMovement):boolean {
 const cents=creditPixCents(movement.amount);
 return movement.resource_type==="account"&&movement.direction==="debit"&&movement.currency==="BRL"
  &&movement.source_type==="PIX"&&movement.kind!=="excluded"
  &&!['bill_payment','transfer','investment'].includes(movement.classification)&&cents!==null&&cents>BigInt(0);
}
export function creditPaymentAdjustment(movement:BankMovement):CreditReconciliation|null {
 const link=movement.credit_reconciliation;
 if(!isCardCreditOperation(movement)||!link||link.status!=="active"||link.role!=="credit"
  ||! /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(link.id))return null;
 const gross=creditPixCents(link.gross_amount),payment=creditPixCents(link.payment_amount),charges=creditPixCents(link.charges_amount);
 if(gross===null||payment===null||charges===null||gross<=BigInt(0)||payment<=BigInt(0)
  ||gross!==creditPixCents(movement.amount)||gross!==payment+charges)return null;
 return link;
}
