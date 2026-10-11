"use client";
import PageTitle from "@/components/PageTitle";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";

type VehicleExpense = { id: string; date: string; km?: number; type: string; amount: number; description: string; financeId?: string };
type Vehicle = { id: string; plate: string; brand: string; model: string; year: number; fuelType: string; currentKm: number; mode: string; expenses: VehicleExpense[] };

function fmt(v: number) { return v.toLocaleString("es-419", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" }); }
const TYPE_EMOJI: Record<string, string> = { fuel: "⛽", maintenance: "🔧", insurance: "🛡️", tax: "📋", other: "📌" };
const TYPE_LABEL: Record<string, string> = { fuel: "Combustible", maintenance: "Mantenimiento", insurance: "Seguro", tax: "Impuestos", other: "Otros" };

export default function VeiculosPageEs() {
  const [mode, setMode] = useState<string>("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<VehicleExpense | null>(null);
  const [vForm, setVForm] = useState({ brand: "", model: "", plate: "", year: new Date().getFullYear(), fuelType: "flex", currentKm: 0 });
  const [eForm, setEForm] = useState({ type: "fuel", amount: "", description: "", km: "", date: "" });

  function load(m: string) {
    setLoading(true);
    fetch(`/api/admin/vehicles?mode=${m}`)
      .then(r => r.json())
      .then(d => {
        const vs: Vehicle[] = Array.isArray(d) ? d : [];
        setVehicles(vs);
        setSelected(prev => {
          if (!prev && vs.length > 0) return vs[0];
          const updated = vs.find(v => v.id === prev?.id);
          return updated ?? (vs.length > 0 ? vs[0] : null);
        });
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchDashboardMe()
      .then(d => {
        const m = d.user?.activeMode || "personal";
        setMode(m);
        load(m);
      });
  }, []);

  async function createVehicle(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/vehicles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", ...vForm, mode }) });
    setShowForm(false); load(mode);
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const isEditing = !!editingExpense;
    const action = isEditing ? "update_expense" : "expense";
    const body = isEditing
      ? { action, vehicleId: selected.id, expenseId: editingExpense!.id, type: eForm.type, amount: parseFloat(eForm.amount), description: eForm.description, km: eForm.km ? parseInt(eForm.km) : undefined, date: eForm.date || undefined }
      : { action, vehicleId: selected.id, type: eForm.type, amount: parseFloat(eForm.amount), description: eForm.description, km: eForm.km ? parseInt(eForm.km) : undefined, date: eForm.date || undefined };
    await fetch("/api/admin/vehicles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setShowExpense(false); setEditingExpense(null); setEForm({ type: "fuel", amount: "", description: "", km: "", date: "" }); load(mode);
  }

  function openEdit(exp: VehicleExpense) {
    setEditingExpense(exp);
    setEForm({ type: exp.type, amount: String(exp.amount), description: exp.description, km: exp.km ? String(exp.km) : "", date: exp.date });
    setShowExpense(true);
  }

  async function deleteExpense(exp: VehicleExpense) {
    if (!selected || !confirm(`¿Eliminar "${exp.description}" (${fmt(exp.amount)})?`)) return;
    await fetch("/api/admin/vehicles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_expense", vehicleId: selected.id, expenseId: exp.id }) });
    load(mode);
  }

  const totalExpenses = selected ? selected.expenses.reduce((s, e) => s + e.amount, 0) : 0;
  const recentExpenses = selected ? [...selected.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8) : [];
  const modeLabel = mode === "business" ? "🏢 Empresa" : "👤 Personal";

  return (
    <div className="z-page">
      <div className="z-page-heading flex items-center justify-between">
        <div>
          <PageTitle icon="car">Vehículos</PageTitle>
          <p className="text-subtle text-sm mt-0.5">{modeLabel}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary-hover transition">
          + Vehículo
        </button>
      </div>

      {loading ? <p className="text-subtle text-sm">Cargando...</p> :
        vehicles.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-line p-12 text-center shadow-sm">
            <p className="text-4xl mb-3">🚗</p>
            <p className="font-semibold text-ink">Ningún vehículo registrado</p>
            <button onClick={() => setShowForm(true)} className="mt-3 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-medium hover:bg-primary-hover transition">Agregar vehículo</button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-5">
            {/* Lista */}
            <div className="space-y-2">
              {vehicles.map(v => (
                <button key={v.id} onClick={() => setSelected(v)}
                  className={clsx("w-full text-left bg-surface border rounded-2xl p-4 transition shadow-sm",
                    selected?.id === v.id ? "border-slate-700 ring-2 ring-slate-100" : "border-line hover:border-line")}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">🚗</span>
                    <div>
                      <p className="font-semibold text-ink text-sm">{v.brand} {v.model}</p>
                      <p className="text-xs text-subtle">{v.year}{v.plate ? ` · ${v.plate}` : ""}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex justify-between text-xs text-subtle">
                    <span>{v.currentKm.toLocaleString()} km</span>
                    <span className="font-medium text-muted">{fmt(v.expenses.reduce((s, e) => s + e.amount, 0))}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Detalhe */}
            {selected && (
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-surface rounded-2xl border border-line shadow-sm p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="font-bold text-ink">{selected.brand} {selected.model} {selected.year}</h2>
                      <p className="text-sm text-subtle">Placa: {selected.plate || "—"} · {selected.currentKm.toLocaleString()} km</p>
                    </div>
                    <button onClick={() => setShowExpense(true)} className="px-3 py-1.5 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:bg-primary-hover transition shrink-0">
                      + Gasto
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="bg-red-soft border border-line rounded-xl p-3">
                      <p className="text-xs text-subtle">Total Gastos</p>
                      <p className="text-lg font-bold text-red-500 mt-0.5">{fmt(totalExpenses)}</p>
                    </div>
                    <div className="bg-orange-soft border border-line rounded-xl p-3">
                      <p className="text-xs text-subtle">Combustible</p>
                      <p className="text-lg font-bold text-orange-500 mt-0.5">{fmt(selected.expenses.filter(e => e.type === "fuel").reduce((s, e) => s + e.amount, 0))}</p>
                    </div>
                  </div>

                  <h3 className="font-semibold text-ink text-sm mb-3">Historial de Gastos</h3>
                  {recentExpenses.length === 0 ? (
                    <p className="text-subtle text-sm text-center py-4">Ningún gasto registrado</p>
                  ) : (
                    <div className="space-y-1">
                      {recentExpenses.map(e => (
                        <div key={e.id} className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-surface-muted group transition">
                          <div className="flex items-center gap-2.5">
                            <span>{TYPE_EMOJI[e.type] || "📌"}</span>
                            <div>
                              <p className="text-sm text-ink">{e.description || TYPE_LABEL[e.type]}</p>
                              <p className="text-xs text-subtle">{new Date(e.date + "T12:00:00").toLocaleDateString("es-419")}{e.km ? ` · ${e.km.toLocaleString()} km` : ""}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-red-500">{fmt(e.amount)}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button onClick={() => openEdit(e)} className="p-1 rounded-lg text-subtle hover:text-muted hover:bg-surface-muted text-xs transition" title="Editar">✏️</button>
                              <button onClick={() => deleteExpense(e)} className="p-1 rounded-lg text-subtle hover:text-red-500 hover:bg-red-soft text-xs transition" title="Eliminar">🗑️</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      }

      {/* Modal criar veículo */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-ink mb-4">🚗 Nuevo Vehículo</h3>
            <form onSubmit={createVehicle} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input value={vForm.brand} onChange={e => setVForm(f => ({ ...f, brand: e.target.value }))} required placeholder="Marca" className="border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input value={vForm.model} onChange={e => setVForm(f => ({ ...f, model: e.target.value }))} required placeholder="Modelo" className="border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={vForm.plate} onChange={e => setVForm(f => ({ ...f, plate: e.target.value }))} placeholder="Placa (ABC-1234)" className="border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input type="number" value={vForm.year} onChange={e => setVForm(f => ({ ...f, year: parseInt(e.target.value) }))} placeholder="Año" className="border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={vForm.currentKm} onChange={e => setVForm(f => ({ ...f, currentKm: parseInt(e.target.value) || 0 }))} placeholder="KM actual" className="border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
                <select value={vForm.fuelType} onChange={e => setVForm(f => ({ ...f, fuelType: e.target.value }))} className="border border-line rounded-xl px-3 py-2.5 text-sm outline-none bg-surface">
                  {[["flex","Flex"],["gasoline","Gasolina"],["ethanol","Etanol"],["diesel","Diésel"],["electric","Eléctrico"]].map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-hover transition">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal gasto / edição */}
      {showExpense && selected && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-ink mb-1">{editingExpense ? "✏️ Editar gasto" : "+ Gasto del vehículo"}</h3>
            <p className="text-sm text-subtle mb-4">{selected.brand} {selected.model}</p>
            <form onSubmit={addExpense} className="space-y-3">
              <select value={eForm.type} onChange={e => setEForm(f => ({ ...f, type: e.target.value }))} className="w-full border border-line rounded-xl px-3 py-2.5 text-sm outline-none bg-surface">
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{TYPE_EMOJI[k]} {v}</option>)}
              </select>
              <input type="number" step="0.01" value={eForm.amount} onChange={e => setEForm(f => ({ ...f, amount: e.target.value }))} required placeholder="Monto ($)" className="w-full border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
              <input value={eForm.description} onChange={e => setEForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción" className="w-full border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={eForm.date} onChange={e => setEForm(f => ({ ...f, date: e.target.value }))} className="w-full border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input type="number" value={eForm.km} onChange={e => setEForm(f => ({ ...f, km: e.target.value }))} placeholder="KM (opcional)" className="w-full border border-line rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowExpense(false); setEditingExpense(null); setEForm({ type: "fuel", amount: "", description: "", km: "", date: "" }); }}
                  className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-hover transition">
                  {editingExpense ? "Guardar" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
