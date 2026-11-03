"use client";
import {useEffect,useRef} from "react";
import {financeDuplicateGroups} from "@/lib/finance-duplicate-review";
import {financeOrigin,type LedgerEntry} from "@/lib/finance-ledger";
import {bankMoney} from "@/lib/open-finance-display";
export default function FinanceDuplicateReview({entries,visibleEntries,onClose}:{entries:readonly LedgerEntry[];visibleEntries:readonly LedgerEntry[];onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const groups=financeDuplicateGroups(entries,visibleEntries);
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 return <dialog ref={dialog} aria-labelledby="duplicate-review-heading" onCancel={event=>{event.preventDefault();onClose();}} className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-3xl border border-line bg-surface p-5 text-ink shadow-xl backdrop:bg-black/50 sm:p-6">
  <div className="flex items-start justify-between gap-3"><h2 id="duplicate-review-heading" className="text-lg font-bold">Possíveis duplicadas</h2><button type="button" onClick={onClose} autoFocus className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm">Fechar</button></div>
  <p className="mt-3 text-sm text-muted">Compare os nomes e as origens. Valores e datas iguais podem ser compras diferentes. Nenhum lançamento foi excluído ou retirado dos totais automaticamente.</p>
  {!groups.length?<p className="mt-5 text-sm text-muted">Não há mais possíveis duplicadas nos filtros selecionados.</p>:<div className="mt-5 space-y-4">{groups.map(group=><section key={group.key} className="rounded-2xl border border-line p-3 sm:p-4">
   <h3 className="mb-3 text-sm font-semibold text-amber-ink">{new Date(`${group.entries[0].date}T12:00:00`).toLocaleDateString("pt-BR")} · {bankMoney(group.entries[0].amount,"BRL")} · {group.entries.length} registros</h3>
   <ul className="divide-y divide-line">{group.entries.map(entry=><li key={entry.id} className="py-3 first:pt-0 last:pb-0"><p className="break-words text-sm font-semibold">{entry.description}</p><p className="mt-1 break-words text-xs text-muted">{financeOrigin(entry)} · {entry.category}</p>{entry.registeredByName&&<p className="mt-1 text-xs text-subtle">Registrado por {entry.registeredByName}</p>}</li>)}</ul>
  </section>)}</div>}
 </dialog>;
}
