"use client";
import {useState} from "react";
import type {BankMovement} from "@/lib/open-finance-report";
import {creditPixCents,isPixPayment} from "@/lib/credit-funded-payment";
import {bankMoney} from "@/lib/open-finance-display";

export default function BankCreditPixDialog({credit:receivedCredit,movements,mode,onClose,onSaved}:{credit:BankMovement;movements:BankMovement[];mode:string;onClose:()=>void;onSaved:()=>void}){
 // Keep the values being confirmed fixed. The RPC rejects stale bank snapshots.
 const [credit]=useState(receivedCredit),[availableMovements]=useState(movements);
 const [paymentId,setPaymentId]=useState(""),[confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
 const link=credit.credit_reconciliation,gross=creditPixCents(credit.amount);
 const candidates=availableMovements.filter(row=>{const amount=creditPixCents(row.amount);return isPixPayment(row)&&!row.credit_reconciliation&&gross!==null&&amount!==null&&amount<=gross;});
 const payment=candidates.find(row=>row.id===paymentId),net=payment?creditPixCents(payment.amount):null;
 const charges=gross!==null&&net!==null?`${(gross-net)/BigInt(100)}.${String((gross-net)%BigInt(100)).padStart(2,"0")}`:null;
 async function save(undo=false){
  setSaving(true);setError("");
  try{
   const response=await fetch(`/api/open-finance/movements/credit-pix?mode=${mode}`,{method:undo?"DELETE":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(undo?{reconciliationId:link?.id}:{creditMovementId:credit.id,paymentMovementId:payment?.id,grossAmount:credit.amount,paymentAmount:payment?.amount,chargesAmount:charges,confirmed,creditDate:credit.date,paymentDate:payment?.date})});
   if(!response.ok){const body=await response.json();throw Error(body.error||"Não foi possível salvar. Confira os registros novamente.");}
   onSaved();
  }catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível salvar.");}finally{setSaving(false);}
 }
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
  <div role="dialog" aria-modal="true" aria-labelledby="credit-pix-heading" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-6 shadow-xl">
   <h2 id="credit-pix-heading" className="text-lg font-bold text-ink">{link?"Pagamento feito com dinheiro do cartão":"Você pegou dinheiro do cartão, pelo Pix, para fazer esse pagamento?"}</h2>
   <p className="mt-3 break-words text-sm text-muted">{credit.institution_name} · {credit.description}</p>
   <p className="mt-2 text-sm text-ink">{link?"Cobrança do cartão que você confirmou":"Cobrança no cartão"}: <strong>{bankMoney(link?.gross_amount??credit.amount,link?"BRL":credit.currency)}</strong></p>
   {link?<>
    <p className="mt-4 text-sm leading-6 text-muted">{link.status==="review"?"O banco atualizou os dados. O ajuste foi suspenso para você conferir.":`Você confirmou um Pix de ${bankMoney(link.payment_amount,"BRL")} e ${bankMoney(link.charges_amount,"BRL")} de juros e taxas.`}</p>
    <p className="mt-2 text-xs leading-5 text-muted">Desfazer faz os dois valores originais voltarem ao resumo de gastos. O histórico e a dívida no cartão são preservados.</p>
    {error&&<p role="alert" className="mt-3 text-sm text-red-ink">{error}</p>}
    <div className="mt-5 flex flex-wrap justify-end gap-2"><button disabled={saving} onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-muted">Fechar</button><button disabled={saving} onClick={()=>void save(true)} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">{saving?"Salvando…":"Desfazer confirmação"}</button></div>
   </>:<>
    <label htmlFor="credit-pix-payment" className="mt-5 block text-sm font-medium text-ink">Qual Pix você fez com esse dinheiro?</label>
    <select id="credit-pix-payment" value={paymentId} disabled={saving} onChange={event=>{setPaymentId(event.target.value);setConfirmed(false);}} className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-sm"><option value="">Escolha o pagamento</option>{candidates.map(row=><option key={row.id} value={row.id}>{row.date.split("-").reverse().join("/")} · {row.description} · {bankMoney(row.amount,row.currency)} · {row.institution_name}</option>)}</select>
    {!candidates.length&&<p className="mt-2 text-xs leading-5 text-muted">Não há um Pix disponível neste período. Feche esta janela e ajuste as datas em Finanças para incluir o pagamento. Um Pix já confirmado em outro ajuste não aparece aqui.</p>}
    {payment&&charges!==null&&<>
     <p className="mt-3 break-words text-sm leading-5 text-muted">Pix escolhido: {payment.description} · {payment.institution_name} · {payment.date.split("-").reverse().join("/")}</p>
     <div className="mt-4 rounded-2xl bg-surface-muted p-4 text-sm leading-6 text-ink">O cartão cobrou <strong>{bankMoney(credit.amount,"BRL")}</strong> por esse Pix de <strong>{bankMoney(payment.amount,"BRL")}</strong>, já com <strong>{bankMoney(charges,"BRL")}</strong> de juros e taxas?</div>
     <label className="mt-4 flex items-start gap-3 text-sm leading-5 text-ink"><input type="checkbox" checked={confirmed} disabled={saving} onChange={event=>setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-amber-500"/>Sim, o dinheiro veio do cartão e essa diferença é de juros e taxas.</label>
     <p className="mt-3 text-xs leading-5 text-muted">A Zelo vai contar o Pix uma vez e os juros/taxas separadamente. Isso não paga nem diminui sua dívida no cartão. Nenhum registro do banco será apagado.</p>
    </>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-ink">{error}</p>}
    <div className="mt-5 flex flex-wrap justify-end gap-2"><button disabled={saving} onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-muted">Não, são pagamentos diferentes</button><button disabled={saving||!confirmed||!payment} onClick={()=>void save()} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50">{saving?"Salvando…":"Sim, é o mesmo pagamento"}</button></div>
   </>}
  </div>
 </div>;
}
