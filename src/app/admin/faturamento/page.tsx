"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";

type ClienteBilling = {
  id: string; name: string; email: string; plan: string; status: string;
  price: number; isOverride: boolean; activatedAt?: string; deactivatedAt?: string; trialEndsAt: string;
};

type BillingData = {
  prices: { monthly: number; semiannual: number; annual: number };
  mrr: number;
  mrrByPlan: { personal: number; business: number };
  countByPlan: { personal: number; business: number };
  activeCount: number; trialCount: number; expiredCount: number; inactiveCount: number; overrideCount: number;
  clientes: ClienteBilling[];
};

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtDate(d?: string) { return d ? new Date(d).toLocaleDateString("pt-BR") : "—"; }

export default function FaturamentoPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceForm, setPriceForm] = useState({ monthly: "", semiannual: "", annual: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/admin/billing").then(r => r.json()).then(d => {
      setData(d);
      setPriceForm({ monthly: String(d.prices.monthly), semiannual: String(d.prices.semiannual), annual: String(d.prices.annual) });
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function savePrices(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/admin/billing", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(priceForm),
    });
    setSaving(false);
    load();
  }

  const kpis = data ? [
    { label: "MRR Total", value: fmt(data.mrr), icon: "💰", color: "text-emerald-400" },
    { label: "Clientes Ativos", value: String(data.activeCount), icon: "⭐", color: "text-blue-400" },
    { label: "Em Trial", value: String(data.trialCount), icon: "⏳", color: "text-amber-400" },
    { label: "Preços Negociados", value: String(data.overrideCount), icon: "🤝", color: "text-purple-400" },
  ] : [];

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Faturamento</h1>
        <p className="text-slate-400 text-sm mt-0.5">Quanto a plataforma fatura e quanto cada cliente paga</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xl">{k.icon}</span>
            </div>
            <p className={clsx("text-3xl font-bold", k.color)}>{loading ? "—" : k.value}</p>
            <p className="text-slate-400 text-xs mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* MRR por plano */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">👤 Plano Pessoal</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{loading ? "—" : fmt(data?.mrrByPlan.personal ?? 0)}</p>
          <p className="text-slate-400 text-xs mt-1">{data?.countByPlan.personal ?? 0} cliente(s) ativo(s)</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">🏢 Plano Empresa</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{loading ? "—" : fmt(data?.mrrByPlan.business ?? 0)}</p>
          <p className="text-slate-400 text-xs mt-1">{data?.countByPlan.business ?? 0} cliente(s) ativo(s)</p>
        </div>
      </div>

      {/* Outros indicadores */}
      {data && (
        <div className="flex flex-wrap gap-3">
          <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-full">⚠️ {data.expiredCount} trial(s) expirado(s)</span>
          <span className="text-xs bg-slate-100 text-slate-500 border border-slate-200 px-3 py-1.5 rounded-full">💤 {data.inactiveCount} inativo(s)</span>
        </div>
      )}

      {/* Configurar preços */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="font-semibold text-slate-900 mb-1">Preço padrão por plano</h2>
        <p className="text-slate-400 text-xs mb-4">Valor mensal equivalente usado para cada período contratado.</p>
        <form onSubmit={savePrices} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Mensal (R$/mês)</label>
            <input type="number" step="0.01" min="0" value={priceForm.monthly}
              onChange={e => setPriceForm(f => ({ ...f, monthly: e.target.value }))}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none w-36" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Semestral (R$/mês)</label>
            <input type="number" step="0.01" min="0" value={priceForm.semiannual}
              onChange={e => setPriceForm(f => ({ ...f, semiannual: e.target.value }))}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none w-36" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Anual (R$/mês)</label>
            <input type="number" step="0.01" min="0" value={priceForm.annual}
              onChange={e => setPriceForm(f => ({ ...f, annual: e.target.value }))}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none w-36" />
          </div>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar preços"}
          </button>
        </form>
      </div>

      {/* Lista de clientes com valor */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Clientes</h2>
        {loading ? (
          <p className="text-slate-400 text-sm">Carregando...</p>
        ) : !data?.clientes.length ? (
          <p className="text-slate-400 text-sm">Nenhum cliente ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">Plano</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Valor</th>
                  <th className="pb-2 font-medium">Cliente desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.clientes.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 transition">
                    <td className="py-3">
                      <Link href={`/admin/clientes/${c.id}`} className="font-medium text-slate-800 hover:underline">{c.name}</Link>
                      <p className="text-xs text-slate-400">{c.email}</p>
                    </td>
                    <td className="py-3 text-slate-600">{c.plan === "business" ? "🏢 Empresa" : "👤 Pessoal"}</td>
                    <td className="py-3">
                      <span className={clsx("text-xs px-2 py-0.5 rounded-full border",
                        c.status === "active" ? "bg-blue-50 text-blue-600 border-blue-200" :
                        c.status === "trial" ? "bg-amber-50 text-amber-600 border-amber-200" :
                        c.status === "expired" ? "bg-red-50 text-red-600 border-red-200" :
                        "bg-slate-100 text-slate-500 border-slate-200"
                      )}>{c.status === "active" ? "Ativo" : c.status === "trial" ? "Trial" : c.status === "expired" ? "Expirado" : "Inativo"}</span>
                    </td>
                    <td className="py-3">
                      <span className="font-semibold text-slate-800">{fmt(c.price)}</span>
                      {c.isOverride && <span className="ml-1.5 text-[10px] bg-purple-50 text-purple-600 border border-purple-200 px-1.5 py-0.5 rounded-full">negociado</span>}
                    </td>
                    <td className="py-3 text-slate-500 text-xs">{c.status === "active" ? fmtDate(c.activatedAt) : c.deactivatedAt ? `Saiu em ${fmtDate(c.deactivatedAt)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
