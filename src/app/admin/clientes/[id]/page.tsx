"use client";
import PageTitle from "@/components/PageTitle";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type ClienteDetail = {
  id: string; name: string; email: string; phone: string; wppPhone?: string;
  plan: string; status: string; activeMode: string; company?: string;
  financesCount: number; tasksCount: number; lastActivity: string; activeToday: boolean;
  trialEndsAt: string; createdAt: string; priceOverride?: number;
};

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [now] = useState(() => Date.now());
  const [cliente, setCliente] = useState<ClienteDetail | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/clientes").then(r => r.json()).then(d => {
      const found = d.clientes?.find((c: ClienteDetail) => c.id === id);
      if (found) { setCliente(found); setPriceInput(found.priceOverride ? String(found.priceOverride) : ""); }
    });
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function savePriceOverride() {
    setSavingPrice(true);
    await fetch(`/api/admin/clientes/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_price_override", priceOverride: priceInput }),
    });
    setSavingPrice(false);
    load();
  }

  if (!cliente) return <div className="text-subtle p-4">Carregando...</div>;

  const trialDays = Math.max(0, Math.ceil((new Date(cliente.trialEndsAt).getTime() - now) / 86400000));

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/clientes" className="text-subtle hover:text-ink transition">← Voltar</Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-600/20 flex items-center justify-center text-xl font-bold text-amber-400">
          {cliente.name.charAt(0)}
        </div>
        <div>
          <PageTitle icon="client">{cliente.name}</PageTitle>
          <p className="text-subtle text-sm">{cliente.email} · {cliente.plan === "business" ? "🏢 Empresarial" : "👤 Pessoal"}</p>
        </div>
        <div className="ml-auto flex gap-2">
          {cliente.activeToday && <span className="text-xs bg-amber-900/30 text-amber-400 border border-amber-800 px-2 py-1 rounded-full">● Ativo hoje</span>}
          <span className={`text-xs px-2 py-1 rounded-full border ${
            cliente.status === "active" ? "bg-blue-900/30 text-blue-400 border-blue-800" :
            cliente.status === "trial" ? "bg-amber-900/30 text-amber-400 border-amber-800" :
            "bg-red-900/30 text-red-400 border-red-800"
          }`}>
            {cliente.status === "active" ? "Plano Ativo" : cliente.status === "trial" ? `Trial (${trialDays}d)` : "Expirado"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Transações", value: String(cliente.financesCount), icon: "◈" },
          { label: "Tarefas", value: String(cliente.tasksCount), icon: "☑" },
          { label: "WhatsApp", value: cliente.wppPhone || "Não cadastrado", icon: "📱" },
          { label: "Modo Ativo", value: cliente.activeMode === "business" ? "🏢 Empresa" : "👤 Pessoal", icon: "⇄" },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-line rounded-2xl p-4">
            <p className="text-subtle text-xs">{k.label}</p>
            <p className="text-ink font-semibold text-sm mt-1 truncate">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-line rounded-2xl p-5">
        <h2 className="font-semibold text-ink mb-4">Detalhes da Conta</h2>
        <div className="space-y-2 text-sm">
          {[
            { label: "Telefone de cadastro", value: cliente.phone },
            { label: "WhatsApp do bot", value: cliente.wppPhone || "—" },
            { label: "Empresa", value: cliente.company || "—" },
            { label: "Criado em", value: new Date(cliente.createdAt).toLocaleDateString("pt-BR") },
            { label: "Última atividade", value: new Date(cliente.lastActivity).toLocaleDateString("pt-BR") },
            { label: "Trial expira em", value: new Date(cliente.trialEndsAt).toLocaleDateString("pt-BR") },
          ].map(r => (
            <div key={r.label} className="flex justify-between py-2 border-b border-line last:border-0">
              <span className="text-subtle">{r.label}</span>
              <span className="text-slate-200">{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-5">
        <h2 className="font-semibold text-ink mb-1">Valor negociado</h2>
        <p className="text-subtle text-xs mb-4">
          Deixe em branco pra usar o preço padrão do plano ({cliente.plan === "business" ? "Empresa" : "Pessoal"}), definido em{" "}
          <Link href="/admin/faturamento" className="text-amber-ink hover:underline">Faturamento</Link>.
        </p>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs text-muted mb-1 block">R$/mês</label>
            <input type="number" step="0.01" min="0" value={priceInput} onChange={e => setPriceInput(e.target.value)}
              placeholder="Preço padrão do plano"
              className="border border-line rounded-xl px-3 py-2 text-sm outline-none w-48" />
          </div>
          <button onClick={savePriceOverride} disabled={savingPrice}
            className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary transition disabled:opacity-50">
            {savingPrice ? "Salvando..." : "Salvar"}
          </button>
        </div>
        {cliente.priceOverride !== undefined && (
          <p className="text-xs text-purple-ink mt-2">🤝 Atualmente pagando {fmt(cliente.priceOverride)}/mês (negociado)</p>
        )}
      </div>
    </div>
  );
}
