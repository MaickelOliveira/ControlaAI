"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type Employee = { id: string; name: string; role: string; salary: number; startDate: string; status: string; phone?: string; email?: string; notes?: string };

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

const ROLES = ["Gerente", "Vendedor", "Atendente", "Caixa", "Estoquista", "Técnico", "Administrativo", "Financeiro", "RH", "Marketing", "Outro"];

export default function FuncionariosPage() {
  const [mode, setMode] = useState<string>("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: "", role: "", salary: "", startDate: "", phone: "", email: "", notes: "" });
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");

  function load() {
    fetch("/api/admin/employees").then(r => r.json()).then(d => {
      setEmployees(d.employees || []);
      setTotalPayroll(d.totalPayroll || 0);
      setLoading(false);
    });
  }

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(d => { setMode(d.user?.activeMode || "personal"); });
    load();
  }, []);

  const visibleEmployees = employees.filter(e => filter === "all" || e.status === filter);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      await fetch("/api/admin/employees", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, ...form }) });
    } else {
      await fetch("/api/admin/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    }
    setShowForm(false); setEditing(null); setForm({ name: "", role: "", salary: "", startDate: "", phone: "", email: "", notes: "" }); load();
  }

  function openEdit(emp: Employee) {
    setEditing(emp);
    setForm({ name: emp.name, role: emp.role, salary: String(emp.salary), startDate: emp.startDate, phone: emp.phone || "", email: emp.email || "", notes: emp.notes || "" });
    setShowForm(true);
  }

  async function toggleStatus(emp: Employee) {
    await fetch("/api/admin/employees", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: emp.id, status: emp.status === "active" ? "inactive" : "active" }) });
    load();
  }

  if (mode === "personal") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-4xl mb-3">🏢</p>
          <p className="font-semibold text-slate-700">Disponível no Modo Empresa</p>
          <p className="text-sm text-slate-400 mt-1">Alterne para o modo empresarial na sidebar para gerenciar funcionários.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">👥 Funcionários</h1>
          <p className="text-slate-400 text-sm mt-0.5">🏢 Empresa</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name: "", role: "", salary: "", startDate: "", phone: "", email: "", notes: "" }); setShowForm(true); }}
          className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition">
          + Funcionário
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-600 rounded-2xl p-5 text-white shadow-sm">
          <p className="text-xs text-blue-100 uppercase tracking-wide">Ativos</p>
          <p className="text-2xl font-bold mt-1">{employees.filter(e => e.status === "active").length}</p>
        </div>
        <div className="bg-red-500 rounded-2xl p-5 text-white shadow-sm">
          <p className="text-xs text-red-100 uppercase tracking-wide">Folha Mensal</p>
          <p className="text-2xl font-bold mt-1">{fmt(totalPayroll)}</p>
        </div>
        <div className="bg-slate-800 rounded-2xl p-5 text-white shadow-sm">
          <p className="text-xs text-slate-300 uppercase tracking-wide">Inativos</p>
          <p className="text-2xl font-bold mt-1">{employees.filter(e => e.status === "inactive").length}</p>
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
        visibleEmployees.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
            <p className="text-4xl mb-3">👥</p>
            <p className="font-semibold text-slate-700">Nenhum funcionário cadastrado</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Funcionário", "Cargo", "Salário", "Início", "Status", ""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visibleEmployees.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 text-sm">{emp.name}</p>
                          {emp.phone && <p className="text-xs text-slate-400">{emp.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{emp.role}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-800">{fmt(emp.salary)}</td>
                    <td className="px-5 py-4 text-xs text-slate-400">{new Date(emp.startDate + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                    <td className="px-5 py-4">
                      <span className={clsx("text-xs px-2.5 py-1 rounded-full font-medium border",
                        emp.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200")}>
                        {emp.status === "active" ? "● Ativo" : "○ Inativo"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(emp)} className="text-xs text-blue-600 hover:underline">Editar</button>
                        <button onClick={() => toggleStatus(emp)} className="text-xs text-slate-400 hover:underline">
                          {emp.status === "active" ? "Desativar" : "Ativar"}
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
            <h3 className="font-bold text-slate-900 mb-4">{editing ? "✏️ Editar Funcionário" : "👤 Novo Funcionário"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                placeholder="Nome completo" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} required className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white">
                <option value="">Cargo / Função</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input type="number" step="0.01" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))}
                placeholder="Salário (R$)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Data de admissão</label>
                <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              </div>
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
