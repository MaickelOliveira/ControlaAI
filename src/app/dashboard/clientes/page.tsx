"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type Customer = { id: string; name: string; phone?: string; email?: string; company?: string; notes?: string; status: string };

export default function ClientesPage() {
  const [mode, setMode] = useState<string>("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", company: "", notes: "" });
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");

  function load() {
    fetch("/api/admin/customers").then(r => r.json()).then(d => {
      setCustomers(d.customers || []);
      setLoading(false);
    });
  }

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(d => { setMode(d.user?.activeMode || "personal"); });
    load();
  }, []);

  const visibleCustomers = customers.filter(c => filter === "all" || c.status === filter);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      await fetch("/api/admin/customers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, ...form }) });
    } else {
      await fetch("/api/admin/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    }
    setShowForm(false); setEditing(null); setForm({ name: "", phone: "", email: "", company: "", notes: "" }); load();
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone || "", email: c.email || "", company: c.company || "", notes: c.notes || "" });
    setShowForm(true);
  }

  async function toggleStatus(c: Customer) {
    await fetch("/api/admin/customers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, status: c.status === "active" ? "inactive" : "active" }) });
    load();
  }

  if (mode === "personal") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-4xl mb-3">🏢</p>
          <p className="font-semibold text-slate-700">Disponível no Modo Empresa</p>
          <p className="text-sm text-slate-400 mt-1">Alterne para o modo empresarial na sidebar para gerenciar clientes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🧾 Clientes</h1>
          <p className="text-slate-400 text-sm mt-0.5">🏢 Empresa</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name: "", phone: "", email: "", company: "", notes: "" }); setShowForm(true); }}
          className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition">
          + Cliente
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-blue-600 rounded-2xl p-5 text-white shadow-sm">
          <p className="text-xs text-blue-100 uppercase tracking-wide">Ativos</p>
          <p className="text-2xl font-bold mt-1">{customers.filter(c => c.status === "active").length}</p>
        </div>
        <div className="bg-slate-800 rounded-2xl p-5 text-white shadow-sm">
          <p className="text-xs text-slate-300 uppercase tracking-wide">Inativos</p>
          <p className="text-2xl font-bold mt-1">{customers.filter(c => c.status === "inactive").length}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(["active","inactive","all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={clsx("px-3 py-1.5 rounded-xl text-xs font-semibold transition border",
              filter === f ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}>
            {f === "active" ? "Ativos" : f === "inactive" ? "Inativos" : "Todos"}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? <p className="text-slate-400 text-sm">Carregando...</p> :
        visibleCustomers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
            <p className="text-4xl mb-3">🧾</p>
            <p className="font-semibold text-slate-700">Nenhum cliente cadastrado</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Cliente", "Empresa", "Contato", "Status", ""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visibleCustomers.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600 shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="font-medium text-slate-800 text-sm">{c.name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{c.company || "—"}</td>
                    <td className="px-5 py-4 text-xs text-slate-400">{[c.phone, c.email].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-5 py-4">
                      <span className={clsx("text-xs px-2.5 py-1 rounded-full font-medium border",
                        c.status === "active" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-500 border-slate-200")}>
                        {c.status === "active" ? "● Ativo" : "○ Inativo"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(c)} className="text-xs text-blue-600 hover:underline">Editar</button>
                        <button onClick={() => toggleStatus(c)} className="text-xs text-slate-400 hover:underline">
                          {c.status === "active" ? "Desativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 mb-4">{editing ? "✏️ Editar Cliente" : "🧾 Novo Cliente"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                placeholder="Nome completo" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                placeholder="Empresa (opcional)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Telefone (opcional)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Email (opcional)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Observações" rows={2} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none resize-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-slate-800 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-slate-700 transition">
                  {editing ? "Salvar" : "Cadastrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
