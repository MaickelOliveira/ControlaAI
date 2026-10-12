import {bankMoney} from "@/lib/open-finance-display";
export default function FinanceCategorySummary({type,groups,onAdd}:{type:"income"|"expense";groups:Array<{name:string;value:number}>;onAdd:()=>void}) {
 const income=type==="income",maximum=Math.max(0,...groups.map(g=>Math.abs(g.value)));
 return <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
  <div className="mb-4 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-ink">{income?"Receitas":"Despesas"} por categoria</h3><button type="button" onClick={onAdd} className="text-xs font-medium text-amber-ink">+ Categoria</button></div>
  {!groups.length?<p className="py-8 text-center text-sm text-subtle">Sem {income?"receitas":"despesas"} nos filtros selecionados.</p>:<div className="max-h-80 space-y-4 overflow-y-auto pr-1">{groups.map(group=><div key={group.name}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-medium text-muted">{group.name}</span><strong className="shrink-0 text-ink">{bankMoney(group.value,"BRL")}</strong></div><div className="h-2 rounded-full bg-surface-muted"><div className={`h-2 rounded-full ${income||group.value<0?"bg-emerald-500":"bg-amber-500"}`} style={{width:`${maximum?Math.min(100,Math.abs(group.value)/maximum*100):0}%`}}/></div></div>)}</div>}
 </section>;
}
