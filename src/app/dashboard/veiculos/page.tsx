"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type VehicleExpense = { id: string; date: string; km?: number; type: string; amount: number; description: string };
type Vehicle = { id: string; plate: string; brand: string; model: string; year: number; fuelType: string; currentKm: number; mode: string; expenses: VehicleExpense[]; notes: string };

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
const TYPE_EMOJI: Record<string, string> = { fuel: "⛽", maintenance: "🔧", insurance: "🛡️", tax: "📋", other: "📌" };
const TYPE_LABEL: Record<string, string> = { fuel: "Combustível", maintenance: "Manutenção", insurance: "Seguro", tax: "IPVA/Impostos", other: "Outros" };

export default function VeiculosPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [mode, setMode] = useState<"personal" | "business">("personal");
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [vForm, setVForm] = useState({ brand: "", model: "", plate: "", year: new Date().getFullYear(), fuelType: "flex", currentKm: 0 });
  const [eForm, setEForm] = useState({ type: "fuel", amount: "", description: "", km: "" });

  function load(m: string) {
    setLoading(true);
    fetch(`/api/admin/vehicles?mode=${m}`).then(r => r.json()).then(d => {
      const vs = Array.isArray(d) ? d : [];
      setVehicles(vs);
      if (vs.length > 0 && !selected) setSelected(vs[0]);
      else if (vs.length > 0 && selected) {
        const updated = vs.find((v: Vehicle) => v.id === selected.id);
        if (updated) setSelected(updated);
      }
      setLoading(false);
    });
  }
  useEffect(() => { load(mode); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createVehicle(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/vehicles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", ...vForm, mode }) });
    setShowForm(false); load(mode);
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await fetch("/api/admin/vehicles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "expense", vehicleId: selected.id, ...eForm, amount: parseFloat(eForm.amount), km: eForm.km ? parseInt(eForm.km) : undefined }) });
    setShowExpense(false); setEForm({ type: "fuel", amount: "", description: "", km: "" }); load(mode);
  }

  const totalExpenses = selected ? selected.expenses.reduce((s, e) => s + e.amount, 0) : 0;
  const recentExpenses = selected ? [...selected.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🚗 Veículos</h1>
          <p className="text-slate-400 text-sm mt-0.5">Controle de gastos e manutenção</p>
        </div>
        <div className="flex gap-2">
          {(["personal", "business"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={clsx("px-3 py-1.5 rounded-xl text-xs font-semibold transition border",
                mode === m ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}>
              {m === "personal" ? "👤 Pessoal" : "🏢 Empresa"}
            </button>
          ))}
          <button onClick={() => setShowForm(true)} className="px-3 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 transition">
            + Veículo
          </button>
        </div>
      </div>

      {loading ? <p className="text-slate-400 text-sm">Carregando...</p> :
        vehicles.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
            <p className="text-4xl mb-3">🚗</p>
            <p className="font-semibold text-slate-700">Nenhum veículo cadastrado</p>
            <button onClick={() => setShowForm(true)} className="mt-3 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition">Adicionar veículo</button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-5">
            {/* Lista de veículos */}
            <div className="space-y-2">
              {vehicles.map(v => (
                <button key={v.id} onClick={() => setSelected(v)}
                  className={clsx("w-full text-left bg-white border rounded-2xl p-4 transition shadow-sm hover:shadow",
                    selected?.id === v.id ? "border-slate-700 ring-2 ring-slate-200" : "border-slate-100 hover:border-slate-200")}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🚗</span>
                    <div>
                      <p className="font-semibold text-slate-800">{v.brand} {v.model}</p>
                      <p className="text-xs text-slate-400">{v.year} · {v.plate || "Sem placa"}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-between text-xs text-slate-400">
                    <span>📍 {v.currentKm.toLocaleString()} km</span>
                    <span className="font-medium text-slate-600">{fmt(v.expenses.reduce((s, e) => s + e.amount, 0))}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Detalhe do veículo */}
            {selected && (
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-bold text-slate-800 text-lg">{selected.brand} {selected.model} {selected.year}</h2>
                      <p className="text-sm text-slate-400">Placa: {selected.plate || "—"} · {selected.currentKm.toLocaleString()} km</p>
                    </div>
                    <button onClick={() => setShowExpense(true)} className="px-3 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 transition">
                      + Gasto
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {[
                      { label: "Total Gastos", value: fmt(totalExpenses), color: "text-red-600" },
                      { label: "Combustível", value: fmt(selected.expenses.filter(e => e.type === "fuel").reduce((s, e) => s + e.amount, 0)), color: "text-orange-500" },
                    ].map(k => (
                      <div key={k.label} className="bg-slate-50 rounded-xl p-3">
                        <p className="text-xs text-slate-400">{k.label}</p>
                        <p className={clsx("text-base font-bold mt-0.5", k.color)}>{k.value}</p>
                      </div>
                    ))}
                  </div>

                  <h3 className="font-semibold text-slate-700 text-sm mb-2">Últimos Gastos</h3>
                  {recentExpenses.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-4">Nenhum gasto registrado</p>
                  ) : (
                    <div className="space-y-2">
                      {recentExpenses.map(e => (
                        <div key={e.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">{TYPE_EMOJI[e.type] || "📌"}</span>
                            <div>
                              <p className="text-sm text-slate-700">{e.description || TYPE_LABEL[e.type]}</p>
                              <p className="text-xs text-slate-400">{new Date(e.date + "T12:00:00").toLocaleDateString("pt-BR")}{e.km ? ` · ${e.km.toLocaleString()} km` : ""}</p>
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-red-500">{fmt(e.amount)}</span>
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-900 mb-4">🚗 Novo Veículo</h3>
            <form onSubmit={createVehicle} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input value={vForm.brand} onChange={e => setVForm(f => ({ ...f, brand: e.target.value }))} required placeholder="Marca (ex: Chevrolet)" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none col-span-1" />
                <input value={vForm.model} onChange={e => setVForm(f => ({ ...f, model: e.target.value }))} required placeholder="Modelo (ex: Gol)" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input value={vForm.plate} onChange={e => setVForm(f => ({ ...f, plate: e.target.value }))} placeholder="Placa (ABC-1234)" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input type="number" value={vForm.year} onChange={e => setVForm(f => ({ ...f, year: parseInt(e.target.value) }))} placeholder="Ano" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={vForm.currentKm} onChange={e => setVForm(f => ({ ...f, currentKm: parseInt(e.target.value) || 0 }))} placeholder="KM atual" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                <select value={vForm.fuelType} onChange={e => setVForm(f => ({ ...f, fuelType: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                  {["flex", "gasoline", "ethanol", "diesel", "electric"].map(t => <option key={t} value={t}>{t === "flex" ? "Flex" : t === "gasoline" ? "Gasolina" : t === "ethanol" ? "Etanol" : t === "diesel" ? "Diesel" : "Elétrico"}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600">Cancelar</button>
                <button type="submit" className="flex-1 bg-slate-800 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-slate-700 transition">Cadastrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal adicionar gasto */}
      {showExpense && selected && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-slate-900 mb-1">+ Gasto no {selected.brand} {selected.model}</h3>
            <form onSubmit={addExpense} className="space-y-3 mt-4">
              <select value={eForm.type} onChange={e => setEForm(f => ({ ...f, type: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{TYPE_EMOJI[k]} {v}</option>)}
              </select>
              <input type="number" step="0.01" value={eForm.amount} onChange={e => setEForm(f => ({ ...f, amount: e.target.value }))} required placeholder="Valor (R$)" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              <input value={eForm.description} onChange={e => setEForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição (opcional)" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              <input type="number" value={eForm.km} onChange={e => setEForm(f => ({ ...f, km: e.target.value }))} placeholder="Quilometragem atual (opcional)" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowExpense(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600">Cancelar</button>
                <button type="submit" className="flex-1 bg-slate-800 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-slate-700 transition">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
