"use client";
import PageTitle from "@/components/PageTitle";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";

type Employee = { id: string; name: string; role: string; salary: number; startDate: string; status: string; phone?: string; email?: string; notes?: string };
type EmployeePayment = { id: string; amount: number; description: string; date: string; status: "posted" | "pending" };

function fmt(v: number) { return v.toLocaleString("es-419", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" }); }

const ROLES = ["Gerente", "Vendedor", "Atención al Cliente", "Cajero", "Almacenista", "Técnico", "Administrativo", "Financiero", "RRHH", "Marketing", "Otro"];

export default function FuncionariosPageEs() {
  const [mode, setMode] = useState<string>("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [paymentsByEmployee, setPaymentsByEmployee] = useState<Record<string, EmployeePayment[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: "", role: "", salary: "", startDate: "", phone: "", email: "", notes: "" });
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");

  function load() {
    fetch("/api/admin/employees").then(r => r.json()).then(d => {
      setEmployees(d.employees || []);
      setTotalPayroll(d.totalPayroll || 0);
      setPaymentsByEmployee(d.paymentsByEmployee || {});
      setLoading(false);
    });
  }

  useEffect(() => {
    fetchDashboardMe().then(d => { setMode(d.user?.activeMode || "personal"); });
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
          <p className="font-semibold text-ink">Disponible en Modo Empresa</p>
          <p className="text-sm text-subtle mt-1">Cambia al modo empresa en la barra lateral para gestionar empleados.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="z-page">
      <div className="z-page-heading flex items-center justify-between">
        <div>
          <PageTitle icon="users">Empleados</PageTitle>
          <p className="text-subtle text-sm mt-0.5">🏢 Empresa</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name: "", role: "", salary: "", startDate: "", phone: "", email: "", notes: "" }); setShowForm(true); }}
          className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary-hover transition">
          + Empleado
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-line rounded-2xl p-5 text-ink shadow-sm">
          <p className="text-xs text-blue-ink uppercase tracking-wide">Activos</p>
          <p className="text-2xl font-bold mt-1">{employees.filter(e => e.status === "active").length}</p>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-5 text-ink shadow-sm">
          <p className="text-xs text-red-ink uppercase tracking-wide">Nómina Mensual</p>
          <p className="text-2xl font-bold mt-1">{fmt(totalPayroll)}</p>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-5 text-ink shadow-sm">
          <p className="text-xs text-subtle uppercase tracking-wide">Inactivos</p>
          <p className="text-2xl font-bold mt-1">{employees.filter(e => e.status === "inactive").length}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(["active","inactive","all"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={clsx("px-3 py-1.5 rounded-xl text-xs font-semibold transition border",
              filter === f ? "bg-slate-800 text-white border-slate-800" : "bg-surface border-line text-muted hover:bg-surface-muted")}>
            {f === "active" ? "Activos" : f === "inactive" ? "Inactivos" : "Todos"}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? <p className="text-subtle text-sm">Cargando...</p> :
        visibleEmployees.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-line p-12 text-center shadow-sm">
            <p className="text-4xl mb-3">👥</p>
            <p className="font-semibold text-ink">Ningún empleado registrado</p>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-surface-muted border-b border-line">
                <tr>
                  {["Empleado", "Cargo", "Salario", "Pagos recibidos", "Inicio", "Estado", ""].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-muted uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visibleEmployees.map(emp => (
                  <tr key={emp.id} className="hover:bg-surface-muted transition">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-soft flex items-center justify-center text-sm font-bold text-blue-ink shrink-0">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-ink text-sm">{emp.name}</p>
                          {emp.phone && <p className="text-xs text-subtle">{emp.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted">{emp.role}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-ink">{fmt(emp.salary)}</td>
                    <td className="px-5 py-4 text-xs text-muted min-w-[190px]">
                      {(paymentsByEmployee[emp.id] || []).length === 0 ? "Ningún pago vinculado" : (
                        <div className="space-y-1">
                          {(paymentsByEmployee[emp.id] || []).slice(0, 3).map(payment => (
                            <p key={payment.id}>
                              <span className="font-semibold text-ink">{fmt(payment.amount)}</span>
                              {" · "}{new Date(payment.date + "T12:00:00").toLocaleDateString("es-419")}
                              {payment.status === "pending" ? " · Pendiente" : ""}
                            </p>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-subtle">{new Date(emp.startDate + "T12:00:00").toLocaleDateString("es-419")}</td>
                    <td className="px-5 py-4">
                      <span className={clsx("text-xs px-2.5 py-1 rounded-full font-medium border",
                        emp.status === "active" ? "bg-amber-soft text-amber-ink border-line" : "bg-surface-muted text-muted border-line")}>
                        {emp.status === "active" ? "● Activo" : "○ Inactivo"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(emp)} className="text-xs text-blue-ink hover:underline">Editar</button>
                        <button onClick={() => toggleStatus(emp)} className="text-xs text-subtle hover:underline">
                          {emp.status === "active" ? "Desactivar" : "Activar"}
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
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-ink mb-4">{editing ? "✏️ Editar Empleado" : "👤 Nuevo Empleado"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                placeholder="Nombre completo" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} required className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none bg-surface">
                <option value="">Cargo / Función</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <input type="number" step="0.01" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))}
                placeholder="Salario ($)" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div>
                <label className="text-xs text-muted mb-1 block">Fecha de contratación</label>
                <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              </div>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Teléfono (opcional)" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="Email (opcional)" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Notas" rows={2} className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none resize-none" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-hover transition">
                  {editing ? "Guardar" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
