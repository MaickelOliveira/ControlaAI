"use client";
import PageTitle from "@/components/PageTitle";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";
import OpenFinanceAccounts from "@/components/OpenFinanceAccounts";

type Account = {
  id: string;
  name: string;
  type: "bank" | "credit_card";
  isDefault: boolean;
  currentInvoice?: {
    id: string;
    dueDate: string;
    periodStart: string;
    periodEnd: string;
    status: "open" | "closed" | "paid";
    total: number;
  } | null;
};

export default function ContasPage() {
  const pathname = usePathname();
  const es = pathname.startsWith("/es/");
  const [mode, setMode] = useState<"personal" | "business" | null>(null);
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
      const selectedMode = data.user?.activeMode;
      if(selectedMode!=="business"&&selectedMode!=="personal")throw Error("ACCOUNT_MODE_UNAVAILABLE");
      setMode(selectedMode);
      void load(selectedMode);
    }).catch(() => {
      setError(es ? "No se pudieron cargar las cuentas." : "Não foi possível carregar as contas.");
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if(!mode)return;
    const response = await fetch("/api/admin/accounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing ? { action: "update", id: editing.id, name } : { action: "create", mode, name, type: "bank" }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) { setError(data?.error || (es ? "No se pudo guardar." : "Não foi possível salvar.")); return; }
    setShowForm(false); setEditing(null); setName(""); await load(mode);
  }

  async function post(body: Record<string, unknown>) {
    if(!mode)return;
    const response = await fetch("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) setError(data?.error || (es ? "No se pudo completar la acción." : "Não foi possível concluir a ação."));
    else await load(mode);
  }

  return <div className="z-page z-accounts-page">
    <div className="z-page-heading flex items-center justify-between gap-3">
      <div><PageTitle icon="wallet">{es ? "Cuentas" : "Contas"}</PageTitle><p className="text-sm text-muted mt-1">{es ? "Organiza tus cuentas manuales y conecta bancos de Brasil para consultar saldos, tarjetas y movimientos." : "Saldos, cartões e investimentos dos seus bancos, em uma visão simples."}</p></div>
      <button disabled={!mode} onClick={() => { setEditing(null); setName(""); setShowForm(true); }} className="px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50">+ {es ? "Nueva cuenta" : "Conta manual"}</button>
    </div>

    {!es&&mode&&<OpenFinanceAccounts key={mode} mode={mode}/>}
    {error && <div className="rounded-xl bg-red-soft border border-line p-3 text-sm text-red-ink">{error}</div>}
    <div className="flex items-center justify-between gap-3 border-t border-line pt-6"><div><h2 className="text-base font-semibold">{es ? "Cuentas registradas" : "Contas registradas"}</h2><p className="mt-1 text-xs text-muted">{es ? "Cuentas organizadas por ti para tus movimientos." : "Contas organizadas por você para os seus lançamentos."}</p></div><span className="z-badge">{accounts.length}</span></div>
    {loading ? <div className="py-16 text-center text-subtle">{es ? "Cargando..." : "Carregando..."}</div> : accounts.length === 0 ? <div className="z-empty">{es ? "Añade una cuenta para organizar tus movimientos." : "Adicione uma conta para organizar seus lançamentos manuais."}</div> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{accounts.map(account => <div key={account.id} className="bg-surface border border-line rounded-2xl p-5 shadow-sm">
      <div className="flex justify-between gap-2"><div><div className="font-semibold text-ink">{account.currentInvoice || account.type === "credit_card" ? "💳" : "👛"} {account.name}</div><div className="text-xs text-subtle mt-1">{account.currentInvoice || account.type === "credit_card" ? (es ? "Tarjeta/factura" : "Cartão/fatura") : (es ? "Cuenta manual" : "Conta manual")}</div></div>{account.isDefault && <span className="text-xs text-amber-ink bg-amber-soft h-fit px-2 py-1 rounded-full">⭐ {es ? "Predeterminada" : "Padrão"}</span>}</div>
      {account.currentInvoice && <div className="mt-4 rounded-xl border border-line bg-blue-soft p-3">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-[11px] font-semibold uppercase tracking-wide text-blue-500">{es ? "Factura pendiente" : "Fatura pendente"}</p><p className="mt-1 text-lg font-bold text-ink">{account.currentInvoice.total.toLocaleString(es ? "es-419" : "pt-BR", { style: "currency", currency: "BRL" })}</p></div>
          <span className="rounded-full bg-surface px-2 py-1 text-[10px] font-semibold text-blue-ink">{new Date(account.currentInvoice.dueDate + "T12:00:00").toLocaleDateString(es ? "es-419" : "pt-BR")}</span>
        </div>
        <button onClick={() => void post({ action: "pay_invoice", invoiceId: account.currentInvoice!.id })} className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary hover:bg-primary">{es ? "Marcar factura como pagada" : "Marcar fatura como paga"}</button>
        <p className="mt-2 text-[10px] leading-relaxed text-blue-ink">{es ? "La baja no crea otro gasto; las compras ya están contabilizadas." : "A baixa não cria outra despesa; as compras já estão contabilizadas."}</p>
      </div>}
      <div className="flex flex-wrap gap-2 mt-4">
        {!account.isDefault && <button onClick={() => void post({ action: "set_default", id: account.id, mode })} className="text-xs px-3 py-1.5 rounded-lg bg-indigo-soft text-indigo-ink">{es ? "Usar como predeterminada" : "Definir como padrão"}</button>}
        <button onClick={() => { setEditing(account); setName(account.name); setShowForm(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-surface-muted text-ink">✏️ {es ? "Editar" : "Editar"}</button>
        {account.name.toLocaleLowerCase() !== "dinheiro" && <button onClick={() => { if (confirm(es ? `¿Eliminar ${account.name}? Los movimientos anteriores se conservarán.` : `Excluir ${account.name}? Os lançamentos antigos serão preservados.`)) void post({ action: "delete", id: account.id }); }} className="text-xs px-3 py-1.5 rounded-lg bg-red-soft text-red-ink">🗑️ {es ? "Eliminar" : "Excluir"}</button>}
      </div>
    </div>)}</div>}

    {showForm && <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-4"><form onSubmit={submit} className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl">
      <h2 className="font-bold text-lg mb-4">{editing ? (es ? "Editar cuenta" : "Editar conta") : (es ? "Nueva cuenta" : "Nova conta")}</h2>
      <input autoFocus required maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder={es ? "Ej.: Efectivo, Nubank, Caja" : "Ex.: Dinheiro, Nubank, Caixa"} className="w-full border border-line rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-200" />
      <p className="text-xs text-subtle mt-2">{es ? "Esta cuenta organiza tus movimientos manuales." : "Esta conta organiza seus lançamentos manuais. Para importar dados bancários, use Conectar banco."}</p>
      <div className="flex gap-3 mt-5"><button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-line rounded-xl py-2.5 text-sm">Cancelar</button><button type="submit" className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold">{es ? "Guardar" : "Salvar"}</button></div>
    </form></div>}
  </div>;
}
