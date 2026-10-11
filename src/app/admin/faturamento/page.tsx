"use client";
import PageTitle from "@/components/PageTitle";
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
        <PageTitle icon="wallet">Faturamento</PageTitle>
        <p className="text-subtle text-sm mt-0.5">Quanto a plataforma fatura e quanto cada cliente paga</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-surface border border-line rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xl">{k.icon}</span>
            </div>
            <p className={clsx("text-3xl font-bold", k.color)}>{loading ? "—" : k.value}</p>
            <p className="text-subtle text-xs mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* MRR por plano */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-line rounded-2xl p-5">
          <p className="text-xs text-subtle font-medium uppercase tracking-wide">👤 Plano Pessoal</p>
          <p className="text-2xl font-bold text-ink mt-1">{loading ? "—" : fmt(data?.mrrByPlan.personal ?? 0)}</p>
          <p className="text-subtle text-xs mt-1">{data?.countByPlan.personal ?? 0} cliente(s) ativo(s)</p>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-5">
          <p className="text-xs text-subtle font-medium uppercase tracking-wide">🏢 Plano Empresa</p>
          <p className="text-2xl font-bold text-ink mt-1">{loading ? "—" : fmt(data?.mrrByPlan.business ?? 0)}</p>
          <p className="text-subtle text-xs mt-1">{data?.countByPlan.business ?? 0} cliente(s) ativo(s)</p>
        </div>
      </div>

      {/* Outros indicadores */}
      {data && (
        <div className="flex flex-wrap gap-3">
          <span className="text-xs bg-red-soft text-red-ink border border-line px-3 py-1.5 rounded-full">⚠️ {data.expiredCount} trial(s) expirado(s)</span>
          <span className="text-xs bg-surface-muted text-muted border border-line px-3 py-1.5 rounded-full">💤 {data.inactiveCount} inativo(s)</span>
        </div>
      )}

      {/* Configurar preços */}
      <div className="bg-surface border border-line rounded-2xl p-5">
        <h2 className="font-semibold text-ink mb-1">Preço padrão por plano</h2>
        <p className="text-subtle text-xs mb-4">Valor mensal equivalente usado para cada período contratado.</p>
        <form onSubmit={savePrices} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted mb-1 block">Mensal (R$/mês)</label>
            <input type="number" step="0.01" min="0" value={priceForm.monthly}
              onChange={e => setPriceForm(f => ({ ...f, monthly: e.target.value }))}
              className="border border-line rounded-xl px-3 py-2 text-sm outline-none w-36" />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Semestral (R$/mês)</label>
            <input type="number" step="0.01" min="0" value={priceForm.semiannual}
              onChange={e => setPriceForm(f => ({ ...f, semiannual: e.target.value }))}
              className="border border-line rounded-xl px-3 py-2 text-sm outline-none w-36" />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">Anual (R$/mês)</label>
            <input type="number" step="0.01" min="0" value={priceForm.annual}
              onChange={e => setPriceForm(f => ({ ...f, annual: e.target.value }))}
              className="border border-line rounded-xl px-3 py-2 text-sm outline-none w-36" />
          </div>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary transition disabled:opacity-50">
            {saving ? "Salvando..." : "Salvar preços"}
          </button>
        </form>
      </div>

      {/* Lista de clientes com valor */}
      <div className="bg-surface border border-line rounded-2xl p-5">
        <h2 className="font-semibold text-ink mb-4">Clientes</h2>
        {loading ? (
          <p className="text-subtle text-sm">Carregando...</p>
        ) : !data?.clientes.length ? (
          <p className="text-subtle text-sm">Nenhum cliente ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-subtle uppercase tracking-wide border-b border-line">
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">Plano</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Valor</th>
                  <th className="pb-2 font-medium">Cliente desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.clientes.map(c => (
                  <tr key={c.id} className="hover:bg-surface-muted transition">
                    <td className="py-3">
                      <Link href={`/admin/clientes/${c.id}`} className="font-medium text-ink hover:underline">{c.name}</Link>
                      <p className="text-xs text-subtle">{c.email}</p>
                    </td>
                    <td className="py-3 text-muted">{c.plan === "business" ? "🏢 Empresa" : "👤 Pessoal"}</td>
                    <td className="py-3">
                      <span className={clsx("text-xs px-2 py-0.5 rounded-full border",
                        c.status === "active" ? "bg-blue-soft text-blue-ink border-line" :
                        c.status === "trial" ? "bg-amber-soft text-amber-ink border-line" :
                        c.status === "expired" ? "bg-red-soft text-red-ink border-line" :
                        "bg-surface-muted text-muted border-line"
                      )}>{c.status === "active" ? "Ativo" : c.status === "trial" ? "Trial" : c.status === "expired" ? "Expirado" : "Inativo"}</span>
                    </td>
                    <td className="py-3">
                      <span className="font-semibold text-ink">{fmt(c.price)}</span>
                      {c.isOverride && <span className="ml-1.5 text-[10px] bg-purple-soft text-purple-ink border border-line px-1.5 py-0.5 rounded-full">negociado</span>}
                    </td>
                    <td className="py-3 text-muted text-xs">{c.status === "active" ? fmtDate(c.activatedAt) : c.deactivatedAt ? `Saiu em ${fmtDate(c.deactivatedAt)}` : "—"}</td>
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
