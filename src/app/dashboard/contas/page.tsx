"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";

type Account = { id: string; name: string; isDefault: boolean };

export default function ContasPage() {
  const pathname = usePathname();
  const es = pathname.startsWith("/es/");
  const [mode, setMode] = useState<"personal" | "business">("personal");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function load(selectedMode: "personal" | "business") {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/accounts?mode=${selectedMode}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Erro");
      setAccounts(Array.isArray(data) ? data : []);
    } catch {
      setError(es ? "No se pudieron cargar las cuentas." : "Não foi possível carregar as contas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboardMe().then(data => {
      const selectedMode = data.user?.activeMode === "business" ? "business" : "personal";
      setMode(selectedMode);
      void load(selectedMode);
    }).catch(() => {
      setError(es ? "No se pudieron cargar las cuentas." : "Não foi possível carregar as contas.");
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/accounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? { action: "update", id: editing.id, name } : { action: "create", mode, name, type: "bank" }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) { setError(data?.error || (es ? "No se pudo guardar." : "Não foi possível salvar.")); return; }
    setShowForm(false); setEditing(null); setName(""); await load(mode);
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) setError(data?.error || (es ? "No se pudo completar la acción." : "Não foi possível concluir a ação."));
    else await load(mode);
  }

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-slate-900">🏦 {es ? "Cuentas" : "Contas"}</h1><p className="text-sm text-slate-500 mt-1">{es ? "Organiza tus movimientos en cuentas manuales, sin conexión bancaria." : "Organize seus lançamentos em contas manuais, sem conexão bancária."}</p></div>
      <button onClick={() => { setEditing(null); setName(""); setShowForm(true); }} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold">+ {es ? "Nueva cuenta" : "Nova conta"}</button>
    </div>

    <div className="flex gap-2">{(["personal", "business"] as const).map(value => <button key={value} onClick={() => { setMode(value); void load(value); }} className={`px-4 py-2 rounded-xl text-sm font-medium border ${mode === value ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>{value === "personal" ? (es ? "Personal" : "Pessoal") : "Empresa"}</button>)}</div>
    {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">{error}</div>}
    {loading ? <div className="py-16 text-center text-slate-400">{es ? "Cargando..." : "Carregando..."}</div> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{accounts.map(account => <div key={account.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
      <div className="flex justify-between gap-2"><div><div className="font-semibold text-slate-800">👛 {account.name}</div><div className="text-xs text-slate-400 mt-1">{es ? "Cuenta manual" : "Conta manual"}</div></div>{account.isDefault && <span className="text-xs text-amber-700 bg-amber-100 h-fit px-2 py-1 rounded-full">⭐ {es ? "Predeterminada" : "Padrão"}</span>}</div>
      <div className="flex flex-wrap gap-2 mt-4">
        {!account.isDefault && <button onClick={() => void post({ action: "set_default", id: account.id, mode })} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700">{es ? "Usar como predeterminada" : "Definir como padrão"}</button>}
        <button onClick={() => { setEditing(account); setName(account.name); setShowForm(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700">✏️ {es ? "Editar" : "Editar"}</button>
        {account.name.toLocaleLowerCase() !== "dinheiro" && <button onClick={() => { if (confirm(es ? `¿Eliminar ${account.name}? Los movimientos anteriores se conservarán.` : `Excluir ${account.name}? Os lançamentos antigos serão preservados.`)) void post({ action: "delete", id: account.id }); }} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600">🗑️ {es ? "Eliminar" : "Excluir"}</button>}
      </div>
    </div>)}</div>}

    {showForm && <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-4"><form onSubmit={submit} className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
      <h2 className="font-bold text-lg mb-4">{editing ? (es ? "Editar cuenta" : "Editar conta") : (es ? "Nueva cuenta" : "Nova conta")}</h2>
      <input autoFocus required maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder={es ? "Ej.: Efectivo, Nubank, Caja" : "Ex.: Dinheiro, Nubank, Caixa"} className="w-full border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-200" />
      <p className="text-xs text-slate-400 mt-2">{es ? "No se conecta ni sincroniza con el banco." : "Não conecta nem sincroniza com o banco."}</p>
      <div className="flex gap-3 mt-5"><button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm">Cancelar</button><button type="submit" className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold">{es ? "Guardar" : "Salvar"}</button></div>
    </form></div>}
  </div>;
}
