"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";

type Stats = { total: number; activeToday: number; trial: number; active: number; expired: number };
type Cliente = { id: string; name: string; plan: string; status: string; financesCount: number; tasksCount: number; lastActivity: string; activeToday: boolean; wppPhone?: string };

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/clientes").then(r => r.json()).then(d => {
      setStats(d.stats);
      setClientes(d.clientes || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const kpis = [
    { label: "Total de Clientes", value: stats?.total ?? 0, icon: "👥", color: "text-blue-400" },
    { label: "Ativos Hoje", value: stats?.activeToday ?? 0, icon: "🟢", color: "text-amber-400" },
    { label: "Em Trial", value: stats?.trial ?? 0, icon: "⏳", color: "text-amber-400" },
    { label: "Plano Ativo", value: stats?.active ?? 0, icon: "⭐", color: "text-purple-400" },
  ];

  const recentClients = clientes.slice(0, 6);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Visão Geral</h1>
        <p className="text-slate-400 text-sm mt-0.5">Resumo da plataforma</p>
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

      {/* Clientes recentes */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-slate-900">Clientes Recentes</h2>
          <Link href="/admin/clientes" className="text-amber-400 text-sm hover:underline">Ver todos →</Link>
        </div>
        {loading ? (
          <p className="text-slate-400 text-sm">Carregando...</p>
        ) : recentClients.length === 0 ? (
          <p className="text-slate-400 text-sm">Nenhum cliente ainda.</p>
        ) : (
          <div className="space-y-3">
            {recentClients.map(c => (
              <Link href={`/admin/clientes/${c.id}`} key={c.id}
                className="flex items-center justify-between p-3 bg-slate-50/80 hover:bg-slate-100 rounded-xl transition group">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-600/20 flex items-center justify-center text-sm font-bold text-amber-400">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.plan === "business" ? "🏢 Empresa" : "👤 Pessoal"} · {c.financesCount} transações</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {c.activeToday && <span className="text-xs bg-amber-900/50 text-amber-400 border border-amber-800 px-2 py-0.5 rounded-full">Ativo hoje</span>}
                  <span className={clsx("text-xs px-2 py-0.5 rounded-full border",
                    c.status === "active" ? "bg-blue-900/30 text-blue-400 border-blue-800" :
                    c.status === "trial" ? "bg-amber-900/30 text-amber-400 border-amber-800" :
                    "bg-red-900/30 text-red-400 border-red-800"
                  )}>{c.status === "active" ? "Ativo" : c.status === "trial" ? "Trial" : "Expirado"}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Alertas */}
      {stats && stats.expired > 0 && (
        <div className="bg-red-950/30 border border-red-900/50 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="text-red-300 font-medium text-sm">{stats.expired} cliente(s) com trial expirado</p>
            <Link href="/admin/clientes" className="text-red-400 text-xs hover:underline">Ver clientes →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
