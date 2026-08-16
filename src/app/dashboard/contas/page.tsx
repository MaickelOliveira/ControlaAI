"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";

type Invoice = { id: string; periodStart: string; periodEnd: string; dueDate: string; status: "open" | "closed" | "paid"; total: number };
type Account = {
  id: string; name: string; type: "bank" | "credit_card"; isDefault: boolean;
  creditLimit?: number; closingDay?: number; dueDay?: number; currentInvoice: Invoice | null;
};

function fmt(v: number | null | undefined) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("pt-BR");
}

const EMPTY_FORM = { name: "", type: "bank" as "bank" | "credit_card", creditLimit: "", closingDay: "", dueDay: "" };

// Feature em standby (usuário ainda não decidiu como quer usar contas
// bancárias/cartões dentro do Zelo) — página fica no código pra retomar
// depois, mas some do menu e não é mais acessível direto pela URL.
export default function ContasPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard"); }, [router]);
  return null;
}

function DisabledContasPage() {
  const [mode, setMode] = useState<string>("personal");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadAccounts(m: string) {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/accounts?mode=${m}`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboardMe()
      .then(d => {
        const m = d.user?.activeMode || "personal";
        setMode(m);
        loadAccounts(m);
      })
      .catch(() => { setError("Erro ao carregar dados"); setLoading(false); });
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditTarget(null);
    setShowForm(true);
  }

  function openEdit(account: Account) {
    setForm({
      name: account.name, type: account.type,
      creditLimit: account.creditLimit ? String(account.creditLimit) : "",
      closingDay: account.closingDay ? String(account.closingDay) : "",
      dueDay: account.dueDay ? String(account.dueDay) : "",
    });
    setFormError(null);
    setEditTarget(account);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (form.type === "credit_card" && (!form.closingDay || !form.dueDay)) {
      setFormError("Informe o dia de fechamento e vencimento do cartão.");
      return;
    }
    const body = editTarget
      ? {
          action: "update", id: editTarget.id, name: form.name,
          creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined,
          closingDay: form.closingDay ? parseInt(form.closingDay) : undefined,
          dueDay: form.dueDay ? parseInt(form.dueDay) : undefined,
        }
      : {
          action: "create", mode, name: form.name, type: form.type,
          creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined,
          closingDay: form.closingDay ? parseInt(form.closingDay) : undefined,
          dueDay: form.dueDay ? parseInt(form.dueDay) : undefined,
        };
    const res = await fetch("/api/admin/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setFormError(data?.error || "Não foi possível salvar.");
      return;
    }
    setShowForm(false);
    loadAccounts(mode);
  }

  async function handleSetDefault(account: Account) {
    await fetch("/api/admin/accounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_default", id: account.id, mode }),
    });
    loadAccounts(mode);
  }

  async function handlePayInvoice(account: Account) {
    if (!account.currentInvoice) return;
    await fetch("/api/admin/accounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pay_invoice", invoiceId: account.currentInvoice.id }),
    });
    loadAccounts(mode);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await fetch("/api/admin/accounts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: deleteTarget.id }),
    });
    setDeleteTarget(null);
    loadAccounts(mode);
  }

  const modeLabel = mode === "business" ? "🏢 Empresa" : "👤 Pessoal";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🏦 Contas</h1>
          <p className="text-slate-400 text-sm mt-0.5">{modeLabel}</p>
        </div>
        <button onClick={openCreate}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition shadow-sm">
          + Nova Conta
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-red-600 font-medium">Erro ao carregar contas</p>
          <p className="text-sm text-red-400 mt-1">{error}</p>
          <button onClick={() => loadAccounts(mode)} className="mt-3 text-sm text-red-600 underline">Tentar novamente</button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
          <p className="text-5xl mb-3">🏦</p>
          <p className="font-semibold text-slate-700">Nenhuma conta cadastrada</p>
          <p className="text-sm text-slate-400 mt-1">Cadastre uma conta bancária ou cartão de crédito pra separar seus gastos por onde saem de verdade.</p>
          <button onClick={openCreate} className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition">
            Cadastrar primeira conta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map(a => (
            <div key={a.id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl shrink-0">{a.type === "credit_card" ? "💳" : "🏦"}</span>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{a.name}</h3>
                    <p className="text-xs text-slate-400">{a.type === "credit_card" ? "Cartão de crédito" : "Conta bancária"}</p>
                  </div>
                </div>
                {a.isDefault && (
                  <span className="text-xs rounded-full px-2.5 py-0.5 font-semibold border bg-amber-100 text-amber-700 border-amber-200 shrink-0">
                    ⭐ Padrão
                  </span>
                )}
              </div>

              {a.type === "credit_card" && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                  {a.closingDay && a.dueDay && (
                    <p className="text-xs text-slate-400 mb-1">Fecha dia {a.closingDay}, vence dia {a.dueDay}</p>
                  )}
                  {a.creditLimit ? <p className="text-xs text-slate-400 mb-1">Limite: {fmt(a.creditLimit)}</p> : null}
                  {a.currentInvoice ? (
                    <>
                      <p className="font-bold text-slate-800">{fmt(a.currentInvoice.total)}</p>
                      <p className="text-xs text-slate-400">
                        {a.currentInvoice.status === "open" ? "🟢 Aberta" : a.currentInvoice.status === "closed" ? "🔴 Fechada" : "✅ Paga"} · vence {fmtDate(a.currentInvoice.dueDate)}
                      </p>
                      {a.currentInvoice.status !== "paid" && (
                        <button onClick={() => handlePayInvoice(a)}
                          className="mt-2 text-xs px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition font-medium">
                          ✓ Marcar fatura como paga
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-slate-400">Sem fatura em aberto</p>
                  )}
                </div>
              )}

              <div className="flex gap-2 mt-3 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                {!a.isDefault && (
                  <button onClick={() => handleSetDefault(a)}
                    className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition font-medium">
                    Definir como padrão
                  </button>
                )}
                <button onClick={() => openEdit(a)}
                  className="text-xs px-3 py-1.5 bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition font-medium">
                  ✏️ Editar
                </button>
                <button onClick={() => setDeleteTarget(a)}
                  className="text-xs px-3 py-1.5 bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100 transition font-medium">
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal — Nova/Editar conta */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-900 mb-4">{editTarget ? "✏️ Editar conta" : "🏦 Nova conta"}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                placeholder="Ex: Nubank, Itaú, Cartão Inter" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />

              {!editTarget && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setForm(f => ({ ...f, type: "bank" }))}
                    className={clsx("flex-1 rounded-xl py-2.5 text-sm font-medium border transition", form.type === "bank" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                    🏦 Conta bancária
                  </button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, type: "credit_card" }))}
                    className={clsx("flex-1 rounded-xl py-2.5 text-sm font-medium border transition", form.type === "credit_card" ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                    💳 Cartão de crédito
                  </button>
                </div>
              )}

              {form.type === "credit_card" && (
                <>
                  <input type="number" step="0.01" value={form.creditLimit} onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))}
                    placeholder="Limite (R$) — opcional" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
                  <div className="flex gap-2">
                    <input type="number" min="1" max="28" value={form.closingDay} onChange={e => setForm(f => ({ ...f, closingDay: e.target.value }))} required
                      placeholder="Dia de fechamento (1-28)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
                    <input type="number" min="1" max="28" value={form.dueDay} onChange={e => setForm(f => ({ ...f, dueDay: e.target.value }))} required
                      placeholder="Dia de vencimento (1-28)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
                  </div>
                </>
              )}

              {formError && <p className="text-sm text-red-500">{formError}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-indigo-700 transition">{editTarget ? "Salvar" : "Criar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Confirmar exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <p className="text-3xl mb-3">🗑️</p>
            <h3 className="font-bold text-slate-900 mb-1">Excluir conta?</h3>
            <p className="text-sm text-slate-500 mb-5">{deleteTarget.name}<br /><span className="text-xs text-slate-400">Lançamentos já registrados continuam no histórico, só ficam sem conta associada.</span></p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={handleDelete} className="flex-1 bg-red-500 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-600 transition">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
