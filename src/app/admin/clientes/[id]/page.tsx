"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type ClienteDetail = {
  id: string; name: string; email: string; phone: string; wppPhone?: string;
  plan: string; status: string; activeMode: string; company?: string;
  financesCount: number; tasksCount: number; lastActivity: string; activeToday: boolean;
  trialEndsAt: string; createdAt: string;
};

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [cliente, setCliente] = useState<ClienteDetail | null>(null);

  useEffect(() => {
    fetch("/api/admin/clientes").then(r => r.json()).then(d => {
      const found = d.clientes?.find((c: ClienteDetail) => c.id === id);
      if (found) setCliente(found);
    });
  }, [id]);

  if (!cliente) return <div className="text-slate-400 p-4">Carregando...</div>;

  const trialDays = Math.max(0, Math.ceil((new Date(cliente.trialEndsAt).getTime() - Date.now()) / 86400000));

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/clientes" className="text-slate-400 hover:text-white transition">← Voltar</Link>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 flex items-center justify-center text-xl font-bold text-emerald-400">
          {cliente.name.charAt(0)}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{cliente.name}</h1>
          <p className="text-slate-400 text-sm">{cliente.email} · {cliente.plan === "business" ? "🏢 Empresarial" : "👤 Pessoal"}</p>
        </div>
        <div className="ml-auto flex gap-2">
          {cliente.activeToday && <span className="text-xs bg-emerald-900/30 text-emerald-400 border border-emerald-800 px-2 py-1 rounded-full">● Ativo hoje</span>}
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
          <div key={k.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <p className="text-slate-500 text-xs">{k.label}</p>
            <p className="text-white font-semibold text-sm mt-1 truncate">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="font-semibold text-white mb-4">Detalhes da Conta</h2>
        <div className="space-y-2 text-sm">
          {[
            { label: "Telefone de cadastro", value: cliente.phone },
            { label: "WhatsApp do bot", value: cliente.wppPhone || "—" },
            { label: "Empresa", value: cliente.company || "—" },
            { label: "Criado em", value: new Date(cliente.createdAt).toLocaleDateString("pt-BR") },
            { label: "Última atividade", value: new Date(cliente.lastActivity).toLocaleDateString("pt-BR") },
            { label: "Trial expira em", value: new Date(cliente.trialEndsAt).toLocaleDateString("pt-BR") },
          ].map(r => (
            <div key={r.label} className="flex justify-between py-2 border-b border-slate-800 last:border-0">
              <span className="text-slate-500">{r.label}</span>
              <span className="text-slate-200">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
