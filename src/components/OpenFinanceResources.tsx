import BankLogo from "./BankLogo";
import { bankMoney, bankDate, bankResourceName, type BankOverview, type BankResource } from "@/lib/open-finance-display";
import { groupBankResources } from "@/lib/open-finance-grouping";
import { canDisconnectBank } from "@/lib/open-finance-connection-actions";
import OpenFinanceIcon from "./OpenFinanceIcon";

const labels = { account: "Conta bancária", card: "Cartão de crédito", investment: "Investimento", loan: "Empréstimo", financing: "Financiamento", reserve: "Reserva de saldo" };

function Product({ resource, data, mode }: { resource: BankResource; data: BankOverview; mode: "personal" | "business" }) {
  const limits = data.limits.filter(l => l.resource_id === resource.id);
  const bills = data.bills.filter(b => b.resource_id === resource.id).sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""));
  const schedules = data.agenda?.items.filter(i => i.resource_id === resource.id && i.kind !== "bill") ?? [];
  const credit = data.credit.find(c => c.resource_id === resource.id);
  const isDebt = resource.resource_type === "loan" || resource.resource_type === "financing";
  const value = resource.resource_type === "card" ? bankMoney(limits[0]?.available_amount, limits[0]?.currency)
    : resource.resource_type === "investment" ? bankMoney(resource.net_amount, resource.currency)
    : isDebt ? bankMoney(credit?.outstanding_amount, credit?.currency) : bankMoney(resource.available_amount, resource.currency);
  const valueLabel = resource.resource_type === "card" ? `Disponível · ${limits[0]?.line_name || "Linha de crédito"}` : resource.resource_type === "investment" ? "Saldo líquido" : isDebt ? "Saldo devedor" : "Saldo disponível";
  const icon = resource.resource_type === "card" ? "card" : resource.resource_type === "investment" ? "chart" : "bank";

  return <details className={`z-bank-product ${isDebt ? "z-bank-debt" : "z-bank-tile"} z-bank-type-${resource.resource_type}`}>
    <summary>
      <span className={`z-bank-product-icon ${resource.resource_type === "card" ? "bg-amber-soft text-amber-ink" : "bg-surface-muted text-muted"}`}><OpenFinanceIcon name={icon} className="h-5 w-5" /></span>
      <span className="min-w-0"><strong>{bankResourceName(resource.name)}</strong><small>{labels[resource.resource_type]}{resource.identification_last4 ? ` · final ${resource.identification_last4}` : ""}</small></span>
      <span className="z-bank-product-value"><small>{valueLabel}</small><strong>{value}</strong>{limits.length > 1 && <small>{limits.length} linhas · ver detalhes</small>}</span>
      <span className="z-bank-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div className="z-bank-product-details">
      {resource.resource_type === "investment" && <p className="text-xs text-muted">Valor bruto: {bankMoney(resource.gross_amount, resource.currency)} · Posição em {bankDate(resource.valuation_date)}</p>}
      {resource.resource_type === "card" && <div className="space-y-4">
        {!limits.length && <p className="text-xs text-muted">O banco ainda não informou os limites.</p>}
        {limits.map(limit => <div key={limit.id} className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-muted">{limit.line_name || "Linha de crédito"}{limit.consolidation_type ? ` · ${limit.consolidation_type}` : ""}</p>
          <dl className="mt-3 space-y-3 text-xs">{([["Disponível",limit.available_amount],["Total",limit.total_amount],["Utilizado",limit.used_amount]] as const).map(([label,amount])=><div key={label} className="flex flex-wrap justify-between gap-2"><dt className="text-muted">{label}</dt><dd className="font-semibold text-ink">{bankMoney(amount,limit.currency)}</dd></div>)}</dl>
          {limit.is_flexible && <p className="mt-3 text-xs text-muted">Limite flexível, sujeito à análise do banco.</p>}
        </div>)}
        {limits.length > 1 && <p className="text-xs text-muted">Cada linha mantém seu limite. Limites compartilhados não são somados.</p>}
        <div><h4 className="text-xs font-semibold">Faturas · {bills.length} recebida(s)</h4>
          {!bills.length && <p className="mt-2 text-xs text-muted">Aguardando dados de faturas do banco.</p>}
          {bills.slice(0, 12).map(b => <div key={b.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs"><div><p>Vencimento {bankDate(b.due_date)} · <strong>{bankMoney(b.total_amount, b.currency)}</strong></p><p className="mt-1 text-muted">{b.payment_evidence ? `Pagamentos informados: ${bankMoney(b.payment_amount, b.currency)}. Confira no banco.` : "Pagamento não confirmado pelo banco."}</p></div><a href={`/api/open-finance/bills/${b.id}?mode=${mode}`} className="rounded-lg border border-line bg-surface px-3 py-2 font-medium hover:bg-surface-muted">Baixar demonstrativo ↓</a></div>)}
          {bills.length > 12 && <p className="mt-3 text-xs text-muted">Peça à Zelo pelo WhatsApp a fatura do mês desejado.</p>}
        </div>
        {schedules.length > 0 && <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-xs font-medium">Assinaturas e parcelas · {schedules.length}</summary><div className="mt-3 space-y-3">{schedules.map(s => <div key={s.id} className="text-xs"><p className="font-medium">{s.description}</p><p className="mt-1 text-muted">{s.kind === "recurring" ? `Cobrança prevista: ${bankDate(s.due_date)} · estimativa ${bankMoney(s.amount, s.currency)}` : `${s.observed_installments}/${s.total_installments} parcelas observadas; próximo vencimento não informado.`}</p></div>)}<p className="text-[11px] text-muted">Previsões do histórico, sujeitas a mudanças. Parcelas observadas não confirmam pagamento.</p></div></details>}
      </div>}
      {credit && <div className="grid gap-3 text-xs sm:grid-cols-3"><p className="text-muted">Valor contratado<strong className="mt-1 block text-ink">{bankMoney(credit.contract_amount, credit.currency)}</strong></p><p className="text-muted">Próxima parcela<strong className="mt-1 block text-ink">{bankMoney(credit.next_installment_amount, credit.currency)}</strong></p><p className="text-muted">Vencimento final<strong className="mt-1 block text-ink">{bankDate(credit.due_date)}</strong></p></div>}
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-subtle"><OpenFinanceIcon name="clock" className="h-3 w-3" />Recebido em {bankDate(resource.synced_at)}</p>
    </div>
  </details>;
}

export default function OpenFinanceResources({ data, mode, busy = false, onDisconnect }: { data: BankOverview; mode: "personal" | "business"; busy?: boolean; onDisconnect?: (id: string) => void }) {
  if (!data.resources.length) return <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-9 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-soft text-amber-ink"><OpenFinanceIcon name="bank" /></span><h3 className="mt-4 font-semibold">Seu próximo banco começa aqui</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">Autorize a conexão no aplicativo do banco. Ela aparece automaticamente na Zelo; os dados podem levar alguns minutos para chegar.</p></div>;
  return <div className="space-y-4">{groupBankResources(data).map(bank => <article key={bank.id} aria-label={bank.name} className="z-bank-card">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><BankLogo institutionId={bank.id} size={44}/><div><h3 className="text-base font-semibold">{bank.name}</h3><p className="mt-0.5 text-xs text-muted">{bank.resources.length} produto(s) · {mode === "personal" ? "Pessoa física" : "Pessoa jurídica"}</p></div></div>
      {onDisconnect && data.connections.filter(c => canDisconnectBank(c) && bank.resources.some(r => r.connection_id === c.id)).map((c, _, connections) => <button key={c.id} type="button" disabled={busy} onClick={() => onDisconnect(c.id)} aria-label={`Desconectar banco ${c.institution_name} · ${bankDate(c.created_at)}`} className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-muted hover:bg-red-soft hover:text-red-ink disabled:opacity-50">Desconectar{connections.length > 1 ? ` · ${bankDate(c.created_at)}` : ""}</button>)}
    </header>
    <div className="z-bank-products">{bank.resources.filter(r => r.resource_type !== "loan" && r.resource_type !== "financing").map(resource => <Product key={resource.id} resource={resource} data={data} mode={mode} />)}</div><div>{bank.resources.filter(r => r.resource_type === "loan" || r.resource_type === "financing").map(resource => <Product key={resource.id} resource={resource} data={data} mode={mode} />)}</div>
    <p className="mt-4 text-[11px] text-subtle">Saldo é dinheiro em conta. Crédito é o limite do cartão. Clique no produto para ver faturas e detalhes.</p>
  </article>)}</div>;
}
