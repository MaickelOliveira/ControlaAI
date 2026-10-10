import { bankMoney, bankDate, type BankOverview } from "@/lib/open-finance-display";
export default function OpenFinanceResources({ data }: { data: BankOverview }) {
  return <div className="grid gap-4 md:grid-cols-2">
    {data.resources.map(resource => <article key={resource.id} className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-slate-500">{{account:"Conta bancária", card:"Cartão", investment:"Investimento", loan:"Empréstimo", financing:"Financiamento", reserve:"Reserva de saldo"}[resource.resource_type]} · {data.connections.find(c => c.id === resource.connection_id)?.institution_name}</p>
      <h3 className="mt-1 font-semibold text-slate-900">{resource.name}{resource.identification_last4 ? ` · final ${resource.identification_last4}` : ""}</h3>
      {resource.resource_type === "account" || resource.resource_type === "reserve" ? <p className="mt-3 text-sm">Saldo disponível: <strong>{bankMoney(resource.available_amount, resource.currency)}</strong></p> : null}
      {resource.resource_type === "investment" && <div className="mt-3 space-y-1 text-sm"><p>Saldo bruto: <strong>{bankMoney(resource.gross_amount, resource.currency)}</strong></p><p>Saldo líquido: <strong>{bankMoney(resource.net_amount, resource.currency)}</strong></p><p className="text-slate-500">Posição de {bankDate(resource.valuation_date)}</p></div>}
      {resource.resource_type === "card" && <div className="mt-3 space-y-3">
        {!data.limits.some(l => l.resource_id === resource.id) && <p className="text-sm text-slate-500">O banco ainda não informou os limites.</p>}
        {data.limits.filter(l => l.resource_id === resource.id).map(limit => <div key={limit.id} className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-950">
          <p className="font-medium">{limit.line_name || "Linha de crédito"} {limit.consolidation_type ? `· ${limit.consolidation_type}` : ""}</p>
          <p>Total: {bankMoney(limit.total_amount, limit.currency)}</p><p>Utilizado: {bankMoney(limit.used_amount, limit.currency)}</p><p>Disponível: <strong>{bankMoney(limit.available_amount, limit.currency)}</strong></p>
          {limit.is_flexible && <p>Limite flexível, sujeito à análise do banco.</p>}
        </div>)}
        <p className="text-xs text-slate-500">Cada linha é exibida separadamente. Limites compartilhados não são somados.</p>
      </div>}
      {data.credit.filter(d => d.resource_id === resource.id).map(credit => <div key={credit.resource_id} className="mt-3 space-y-1 text-sm"><p>Valor contratado: {bankMoney(credit.contract_amount, credit.currency)}</p><p>Saldo devedor: <strong>{bankMoney(credit.outstanding_amount, credit.currency)}</strong></p><p>Próxima parcela: {bankMoney(credit.next_installment_amount, credit.currency)}</p><p>Vencimento final: {bankDate(credit.due_date)}</p></div>)}
      <p className="mt-3 text-xs text-slate-500">Recebido em {bankDate(resource.synced_at)}. Os horários de atualização dependem do banco.</p>
    </article>)}
    {!data.resources.length && <p className="text-sm text-slate-600">Nenhum dado bancário recebido neste modo. Após autorizar, os dados podem levar alguns minutos para chegar.</p>}
  </div>;
}
