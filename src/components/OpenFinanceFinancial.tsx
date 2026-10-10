"use client";
import {useEffect,useState} from "react";
import {bankDate,bankMoney} from "@/lib/open-finance-display";
import {BANK_HISTORY_NOTICE,BANK_TOTAL_LABELS,type BankFinancialData} from "@/lib/open-finance-report";
async function loadFinancial(mode:string,from:string,to:string,after?:string,signal?:AbortSignal):Promise<BankFinancialData|null> {
  const query=new URLSearchParams({mode,from,to});if(after)query.set("after",after);
  const response=await fetch(`/api/open-finance/report?${query}`,{cache:"no-store",signal});
  if(response.status===401||response.status===404)return null;
  const body=await response.json();if(!response.ok)throw new Error(body.error||"Não foi possível atualizar os bancos.");return body;
}
export default function OpenFinanceFinancial({mode,from,to}:{mode:"personal"|"business";from:string;to:string}) {
  const [data,setData]=useState<BankFinancialData|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[question,setQuestion]=useState(""),[answer,setAnswer]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    void loadFinancial(mode,from,to,undefined,controller.signal).then(setData).catch(e=>{if(e.name!=="AbortError")setError(e.message);});
    return ()=>controller.abort();
  },[mode,from,to]);
  async function more(){if(!data?.report.next)return;setBusy(true);setError("");try{const next=await loadFinancial(mode,from,to,data.report.next);if(next)setData({...next,report:{...next.report,movements:[...data.report.movements,...next.report.movements]}});}catch(e){setError(e instanceof Error?e.message:"Tente novamente.");}finally{setBusy(false);}}
  async function ask(){setBusy(true);setError("");try{const response=await fetch(`/api/open-finance/ask?mode=${mode}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Tente novamente.");setAnswer(result.answer);}catch(e){setError(e instanceof Error?e.message:"Tente novamente.");}finally{setBusy(false);}}
  if(!data)return error?<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>:null;
  if(!data.overview.connections.length)return null;
  return <section aria-label="Financeiro dos bancos conectados" className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5">
    <div><h2 className="text-lg font-bold text-slate-900">Dados dos bancos conectados</h2><p className="text-sm text-slate-600">{bankDate(from)} a {bankDate(to)} · prévia privada</p></div>
    <p className="text-sm text-slate-600">{BANK_HISTORY_NOTICE} Estes valores ficam separados dos lançamentos manuais abaixo.</p>
    {data.report.sync_pending&&<p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Há uma importação pendente ou que precisa de nova tentativa. Você pode verificar a conexão em Contas.</p>}
    {!!data.report.missing_dates&&<p className="text-sm text-amber-900">{data.report.missing_dates} movimentação(ões) sem data informada pelo banco não entram nos totais do período.</p>}
    <div className="grid gap-3 sm:grid-cols-2">{data.report.totals.filter(t=>t.kind!=="excluded").map(t=><article key={`${t.kind}-${t.currency}`} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-600">{BANK_TOTAL_LABELS[t.kind]}</p><p className="mt-1 text-lg font-semibold">{bankMoney(t.amount,t.currency)}</p><p className="text-xs text-slate-500">{t.count} movimentação(ões){t.missing_amounts?` · ${t.missing_amounts} sem valor informado`:""}</p></article>)}</div>
    <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold">Faturas recebidas</summary><p className="mt-2 text-xs text-slate-500">O vencimento da fatura e a data da compra são informações diferentes. O total da fatura não é somado às compras.</p>{data.overview.bills.map(b=><div key={b.id} className="mt-3 border-t pt-3 text-sm"><p className="font-medium">{data.overview.resources.find(r=>r.id===b.resource_id)?.name||"Cartão"} · vence em {bankDate(b.due_date)}</p><p>Total: {bankMoney(b.total_amount,b.currency)} · mínimo: {bankMoney(b.minimum_payment_amount,b.currency)}</p><p className="text-slate-500">Situação de pagamento: {b.status==="unknown"?"não informada pelo banco":b.status}</p></div>)}{!data.overview.bills.length&&<p className="mt-3 text-sm text-slate-500">Nenhuma fatura recebida.</p>}</details>
    <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold">Movimentações recebidas</summary><div className="divide-y">{data.report.movements.map(m=><article key={m.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{m.description}</p><p>{m.direction==="debit"?"Saída":m.direction==="credit"?"Entrada":"Direção não informada"} · {bankMoney(m.amount,m.currency)}</p></div><p className="text-xs text-slate-500">{m.institution_name} · {m.resource_name} · {bankDate(m.date)} · {BANK_TOTAL_LABELS[m.kind]}</p>{m.installment_number&&<p className="text-xs text-slate-500">Parcela {m.installment_number}{m.installment_count?` de ${m.installment_count}`:""}{m.bill_month?` · competência ${m.bill_month.slice(5,7)}/${m.bill_month.slice(0,4)}`:""}</p>}</article>)}</div>{data.report.next&&<button disabled={busy} onClick={()=>void more()} className="mt-3 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Ver mais</button>}</details>
    <form onSubmit={e=>{e.preventDefault();void ask();}} className="rounded-xl border border-slate-200 bg-white p-4"><label htmlFor="bank-question" className="font-semibold">Pergunte à Zelo sobre seus bancos</label><p className="mt-1 text-xs text-slate-500">Exemplos: quanto gastei nos cartões mês passado? Qual meu limite disponível? Como estão meus investimentos?</p><div className="mt-3 flex gap-2"><input id="bank-question" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={500} required className="min-w-0 flex-1 rounded-lg border p-2 text-sm"/><button disabled={busy} className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Consultar</button></div>{answer&&<p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{answer}</p>}</form>
    {data.overview.truncated&&<p className="text-sm text-amber-900">Há mais registros do que esta prévia consegue mostrar. O resumo de contas e faturas está limitado.</p>}
    {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}<p className="text-xs text-slate-500">Última importação concluída: {bankDate(data.report.last_successful_sync_at)}</p>
  </section>;
}
