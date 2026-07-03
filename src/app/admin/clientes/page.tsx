"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";

type Cliente = { id: string; name: string; email: string; phone: string; wppPhone?: string; plan: string; status: string; financesCount: number; tasksCount: number; lastActivity: string; activeToday: boolean; trialEndsAt: string };

const EMPTY_FORM = { name: "", email: "", password: "", phone: "", plan: "personal", company: "", isTrial: true, trialDays: "14" };

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const d = await fetch("/api/admin/clientes").then(r => r.json());
    setClientes(d.clientes || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = clientes.filter(c => {
    if (filter !== "all" && c.status !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const r = await fetch("/api/admin/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, trialDays: Number(form.trialDays) }),
    });
    const d = await r.json();
    if (!r.ok) { setError(d.error || "Erro ao criar cliente"); setSaving(false); return; }
    setModal(false);
    setForm(EMPTY_FORM);
    setSaving(false);
    load();
  }

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Clientes ({clientes.length})</h1>
          <p className="text-slate-400 text-sm">Todos os usuários da plataforma</p>
        </div>
        <button onClick={() => { setModal(true); setError(""); setForm(EMPTY_FORM); }}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Novo Cliente
        </button>
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

      {/* Modal Novo Cliente */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h2 className="font-bold text-white text-base">Novo Cliente</h2>
              <button onClick={() => setModal(false)} className="text-slate-500 hover:text-white transition text-xl leading-none">×</button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              {error && <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-xl px-3 py-2">{error}</p>}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Nome completo *</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="João Silva"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Email *</label>
                  <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="joao@email.com"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Senha *</label>
                  <input required type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">WhatsApp</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="5544999999999"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Plano</label>
                  <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500">
                    <option value="personal">👤 Pessoal</option>
                    <option value="business">🏢 Empresa</option>
                  </select>
                </div>
                {form.plan === "business" && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Nome da empresa</label>
                    <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                      placeholder="Empresa Ltda"
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                  </div>
                )}
              </div>

              {/* Tipo de acesso */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-300">Tipo de acesso</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setForm(f => ({ ...f, isTrial: true }))}
                    className={clsx("rounded-xl px-3 py-2.5 text-sm font-medium border transition text-left",
                      form.isTrial ? "bg-amber-600/20 text-amber-300 border-amber-600/40" : "text-slate-400 border-slate-700 hover:bg-slate-800")}>
                    <p>⏱ Período de teste</p>
                    <p className="text-[10px] opacity-70 mt-0.5">Trial com prazo definido</p>
                  </button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, isTrial: false }))}
                    className={clsx("rounded-xl px-3 py-2.5 text-sm font-medium border transition text-left",
                      !form.isTrial ? "bg-emerald-600/20 text-emerald-300 border-emerald-600/40" : "text-slate-400 border-slate-700 hover:bg-slate-800")}>
                    <p>✅ Acesso ativo</p>
                    <p className="text-[10px] opacity-70 mt-0.5">Sem restrição de prazo</p>
                  </button>
                </div>
                {form.isTrial && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Dias de trial</label>
                    <input type="number" min="1" max="365" value={form.trialDays}
                      onChange={e => setForm(f => ({ ...f, trialDays: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setModal(false)}
                  className="flex-1 border border-slate-700 text-slate-400 hover:text-white rounded-xl py-2.5 text-sm font-medium transition">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-50">
                  {saving ? "Criando..." : "Criar Cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
