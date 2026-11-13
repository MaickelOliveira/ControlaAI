"use client";
import {useState} from "react";
import FinanceCategorySelect from "./FinanceCategorySelect";
import type {LedgerEntry} from "@/lib/finance-ledger";
import {OWN_ACCOUNT_TRANSFER_CATEGORY} from "@/lib/bank-category";
import {BILL_PAYMENT_CATEGORY,canMarkBankBillPayment,isBankBillPayment} from "@/lib/bank-bill-payment";
export default function BankCategoryDialog({entry,mode,categories,onClose,onSaved,onCategoryCreated}:{entry:LedgerEntry;mode:string;categories:string[];onClose:()=>void;onCategoryCreated?:(name:string)=>void;onSaved:(matched?:number,billPayment?:boolean)=>void}){
  const bank=entry.bank;
  const manualBillPayment=bank?.user_category===BILL_PAYMENT_CATEGORY;
  const canMarkBill=!!bank&&canMarkBankBillPayment(bank)&&bank.kind!=="excluded"&&!isBankBillPayment(bank);
  const options=entry.bank?.resource_type==="account"?[...new Set([...categories,OWN_ACCOUNT_TRANSFER_CATEGORY])]:categories;
  const [category,setCategory]=useState(options.includes(entry.category)?entry.category:"");
  const [applyToMatchingHistory,setApplyToMatchingHistory]=useState(false);
  const [saving,setSaving]=useState(false),[error,setError]=useState("");
  async function save(value:string|null,billPayment?:boolean){
    setSaving(true);setError("");
    try{
      const response=await fetch(`/api/open-finance/movements/category?mode=${mode}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({movementId:bank?.id,category:value,billPayment,date:entry.date,applyToMatchingHistory:value===OWN_ACCOUNT_TRANSFER_CATEGORY&&applyToMatchingHistory,stopFutureMatching:billPayment===undefined&&value===null&&bank?.user_category===OWN_ACCOUNT_TRANSFER_CATEGORY})});
      if(!response.ok){const body=await response.json();throw Error(body.error||"Não foi possível salvar a categoria.");}
      const result=await response.json();onSaved(result.matched,billPayment);
    }catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível salvar a categoria.");}finally{setSaving(false);}
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
    <form role="dialog" aria-modal="true" aria-labelledby="bank-category-heading" onSubmit={e=>{e.preventDefault();void save(category);}} className="max-h-[90dvh] overflow-y-auto w-full max-w-md rounded-3xl bg-surface p-6 shadow-xl">
      <h2 id="bank-category-heading" className="text-lg font-bold text-ink">{manualBillPayment?"Pagamento de fatura":"Categoria da movimentação"}</h2>
      <p className="mt-3 break-words text-sm text-muted">{entry.description}</p>
      {manualBillPayment?<p className="mt-2 text-xs text-muted">Você marcou este lançamento como pagamento de fatura. Ele aparece no extrato e fica fora das despesas.</p>:<>
      <p className="mt-2 text-xs text-muted">Sua escolha fica salva no extrato e nos gráficos. Em parcelamentos ou assinaturas identificados, ela vale para os lançamentos anteriores e futuros da mesma compra.</p>
      <label htmlFor="bank-category-select" className="mt-5 block text-sm font-medium text-ink">Categoria</label>
      <FinanceCategorySelect id="bank-category-select" required onCreated={onCategoryCreated} value={category} disabled={saving} onChange={setCategory} categories={options} type={entry.type==="income"?"income":"expense"}/>
      {category===OWN_ACCOUNT_TRANSFER_CATEGORY&&<p className="mt-2 text-xs text-muted">Essa movimentação continua no extrato, mas não entra nas receitas ou despesas.</p>}
      {category===OWN_ACCOUNT_TRANSFER_CATEGORY&&<label className="mt-3 flex items-start gap-2 text-xs text-ink"><input type="checkbox" checked={applyToMatchingHistory} disabled={saving} onChange={event=>setApplyToMatchingHistory(event.target.checked)} className="mt-0.5"/><span>Também aplicar às movimentações da mesma conta, com descrição e valor iguais, em todos os meses e nas próximas importações. Confira se todas representam transferências entre suas contas.</span></label>}
      {entry.categorySource==="description"&&<p className="mt-2 text-xs text-amber-ink">Categoria sugerida pela descrição. Confira se corresponde ao pagamento.</p>}
      {canMarkBill&&<div className="mt-4 border-t border-line pt-3">
        <button type="button" disabled={saving} onClick={()=>void save(BILL_PAYMENT_CATEGORY,true)} className="text-sm font-semibold text-amber-ink">Marcar como pagamento de fatura</button>
        <p className="mt-1 text-xs text-muted">O lançamento continua no extrato. As compras do cartão continuam contando nas despesas.</p>
      </div>}
      </>}
      {error&&<p role="alert" className="mt-3 text-sm text-red-ink">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-muted">Cancelar</button>{manualBillPayment?
        <button type="button" disabled={saving} onClick={()=>void save(null,false)} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink">Desfazer marcação manual</button>:
        <button disabled={saving||!category} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?"Salvando…":"Salvar categoria"}</button>}</div>
      {!manualBillPayment&&bank?.user_category&&<button type="button" disabled={saving} onClick={()=>void save(null)} className="mt-3 text-xs text-muted underline">{bank.user_category===OWN_ACCOUNT_TRANSFER_CATEGORY?"Voltar à categoria automática e parar a regra futura":"Voltar à categoria automática"}</button>}
    </form>
  </div>;
}
