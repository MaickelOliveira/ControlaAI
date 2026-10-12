"use client";
import {useState,type CSSProperties} from "react";
import BankLogo from "./BankLogo";
import Link from "next/link";
import {bankDate,bankMoney,type BankOverview} from "@/lib/open-finance-display";
import {displayCardLimits,headlineCardLimit} from "@/lib/bank-card-limit";
import UiIcon from "./UiIcon";

function cardTheme(bank:string,product:string):string {
  const name=`${bank} ${product}`.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
  if(name.includes("nubank"))return "nu";
  if(name.includes("santander"))return "santander";
  if(name.includes("sicredi"))return "sicredi";
  if(name.includes("mercado pago"))return "mercado";
  if(/\binter\b/.test(name))return "inter";
  if(name.includes("renner"))return "renner";
  if(name.includes("realize"))return "realize";
  return "gold";
}
export default function DashboardCredit({overview,mode="personal"}:{overview:BankOverview|null;mode?:"personal"|"business"}) {
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const cards=overview?.resources.filter(resource=>resource.resource_type==="card")??[];
  const selected=cards.find(card=>card.id===selectedId)??cards.at(-1);
  const selectedBank=overview?.connections.find(connection=>connection.id===selected?.connection_id);
  const limits=displayCardLimits(overview?.limits.filter(line=>line.resource_id===selected?.id)??[]);
  const bills=overview?.bills.filter(bill=>bill.resource_id===selected?.id).sort((a,b)=>(b.due_date??"").localeCompare(a.due_date??""))??[];
  return <article className="z-card">
    <div className="z-card-heading"><h2>Crédito disponível</h2><UiIcon name="wallet" className="h-4 w-4 text-amber-ink"/></div>
    {!cards.length?<div className="z-empty">Conecte seus cartões para acompanhar o crédito disponível.</div>:<>
      <p className="mb-2 text-[11px] text-subtle">Selecione um cartão para ver limites e faturas.</p>
      <div className="z-credit-deck-viewport"><div className="z-credit-fan" role="group" aria-label="Seus cartões">
        {cards.map((card,index)=>{
          const bank=overview!.connections.find(connection=>connection.id===card.connection_id);
          const line=headlineCardLimit(overview!.limits.filter(limit=>limit.resource_id===card.id));
          const bankName=bank?.institution_name??"Cartão";
          return <button key={card.id} type="button" className={`z-credit-face z-credit-face-${cardTheme(bankName,card.name)}`} aria-label={`Ver cartão ${bankName} · ${card.name}${card.identification_last4?` · final ${card.identification_last4}`:""}`} aria-pressed={selected?.id===card.id} aria-controls="z-credit-selected-details" onClick={()=>setSelectedId(card.id)} style={{"--card-index":index } as CSSProperties}>
            <span className="z-credit-face-bank"><BankLogo institutionId={bank?.institution_id} size={28}/><span>{bankName}</span><UiIcon name="wallet" className="ml-auto h-4 w-4"/></span>
            <span className="z-credit-face-value"><small>Crédito disponível</small><strong>{bankMoney(line?.available_amount,line?.currency)}</strong></span>
            <span className="z-credit-face-line">{line?line.line_name||"Linha do cartão":"O banco ainda não enviou limites"}{line?.consolidation_type?` · ${line.consolidation_type}`:""}</span>
            <span className="z-credit-face-footer"><span>{card.name}{card.identification_last4?` · •••• ${card.identification_last4}`:""}</span><span>{bank&&bank.status!=="active"?"Histórico":card.card_network??""}</span></span>
          </button>;
        })}
      </div></div>
      <div className="z-credit-card-picker" aria-label="Selecionar cartão">{cards.map(card=><button key={card.id} type="button" aria-pressed={selected?.id===card.id} onClick={()=>setSelectedId(card.id)}>{overview?.connections.find(c=>c.id===card.connection_id)?.institution_name??card.name}{card.identification_last4?` · ${card.identification_last4}`:""}</button>)}</div>
      <section id="z-credit-selected-details" className="z-credit-selected" aria-live="polite" aria-label="Limites e faturas">
        <h3 className="text-xs font-semibold">{selectedBank?.institution_name??"Cartão"} · {selected?.name} · Limites e faturas</h3>
        {!limits.length&&<p className="mt-2 text-xs text-muted">O banco ainda não enviou limites para este cartão.</p>}
        {limits.map(line=><div key={line.id} className="mt-3 border-t border-line pt-3 text-[11px]"><p className="font-medium">{line.line_name||"Linha do cartão"}{line.consolidation_type?` · ${line.consolidation_type}`:""}</p><dl className="mt-2 space-y-1.5">{([["Disponível",line.available_amount],["Total",line.total_amount],["Utilizado",line.used_amount]] as const).map(([label,amount])=><div key={label} className="flex justify-between gap-2"><dt className="text-muted">{label}</dt><dd className="font-semibold">{bankMoney(amount,line.currency)}</dd></div>)}</dl>{line.displayCount>1&&<p className="mt-2 text-subtle">{line.displayCount} registros iguais do banco · exibidos uma vez.</p>}</div>)}
        <details className="mt-3 border-t border-line pt-3 text-[11px]"><summary className="cursor-pointer font-medium">Faturas recebidas · {bills.length}</summary>{bills.slice(0,6).map(bill=><a key={bill.id} href={`/api/open-finance/bills/${bill.id}?mode=${mode}`} className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-line p-2"><span>{bankDate(bill.due_date)} · {bankMoney(bill.total_amount,bill.currency)}</span><span>Demonstrativo ↓</span></a>)}{!bills.length&&<p className="mt-2 text-muted">Aguardando faturas do banco.</p>}</details>
      </section>
      <p className="mt-3 text-[10px] leading-5 text-subtle">Por linha, sem somar limites compartilhados. Crédito não é saldo em conta.</p>
    </>}
    <Link href="/dashboard/contas" className="mt-4 flex items-center justify-between rounded-full border border-line px-4 py-2.5 text-[11px] font-medium">Ver todos os detalhes<UiIcon name="arrow" className="h-4 w-4"/></Link>
  </article>;
}
