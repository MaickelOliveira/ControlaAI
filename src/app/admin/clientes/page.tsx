"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";

type Cliente = { id: string; name: string; email: string; phone: string; wppPhone?: string; plan: string; status: string; financesCount: number; tasksCount: number; lastActivity: string; activeToday: boolean; trialEndsAt: string };

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/clientes").then(r => r.json()).then(d => { setClientes(d.clientes || []); setLoading(false); });
  }, []);

  const filtered = clientes.filter(c => {
    if (filter !== "all" && c.status !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Clientes ({clientes.length})</h1>
          <p className="text-slate-400 text-sm">Todos os usuários da plataforma</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nome ou email..."
          className="bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2 text-sm outline-none focus:border-emerald-500 flex-1 min-w-48" />
        {["all", "trial", "active", "expired"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={clsx("px-4 py-2 rounded-xl text-sm font-medium transition border",
              filter === f ? "bg-emerald-600/20 text-emerald-400 border-emerald-600/40" : "text-slate-400 border-slate-700 hover:text-white hover:bg-slate-800")}>
            {f === "all" ? "Todos" : f === "trial" ? "Trial" : f === "active" ? "Ativos" : "Expirados"}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Nenhum cliente encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  {["Cliente", "Plano", "WhatsApp", "Uso", "Status", ""].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{c.name}</p>
                          <p className="text-xs text-slate-500">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-slate-300">{c.plan === "business" ? "🏢 Empresa" : "👤 Pessoal"}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {c.wppPhone ? (
                        <span className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-900/40 rounded-lg px-2 py-0.5">✓ {c.wppPhone}</span>
                      ) : (
                        <span className="text-xs text-slate-600">Não cadastrado</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-slate-400">{c.financesCount} transações · {c.tasksCount} tarefas</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={clsx("text-xs px-2 py-0.5 rounded-full border",
                          c.status === "active" ? "bg-blue-900/30 text-blue-400 border-blue-800" :
                          c.status === "trial" ? "bg-amber-900/30 text-amber-400 border-amber-800" :
                          "bg-red-900/30 text-red-400 border-red-800"
                        )}>{c.status === "active" ? "Ativo" : c.status === "trial" ? "Trial" : "Expirado"}</span>
                        {c.activeToday && <span className="text-xs text-emerald-400">● Hoje</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/clientes/${c.id}`} className="text-xs text-emerald-400 hover:underline">Ver →</Link>
                    </td>
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
