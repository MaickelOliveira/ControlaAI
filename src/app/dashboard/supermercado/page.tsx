"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

type ShoppingItem = { id: string; name: string; category: string; quantity: string; checked: boolean };
type PriceComp = { productName: string; category: string; prices: Array<{ storeName: string; price: number; date: string }> };
type SpendByStore = { storeId: string; storeName: string; total: number; visits: number };
type Purchase = { id: string; storeName: string; date: string; total: number; items: Array<{ productName: string; price: number; quantity: number; category: string; unit: string }> };

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

const CATEGORIES = ["Mercearia", "Carnes", "Hortifruti", "Laticínios", "Padaria", "Bebidas", "Limpeza", "Higiene", "Outros"] as const;
const CAT_ICON: Record<string, string> = { Mercearia: "🌾", Carnes: "🥩", Hortifruti: "🥬", Laticínios: "🥛", Padaria: "🍞", Bebidas: "🧃", Limpeza: "🧹", Higiene: "🧴", Outros: "📦" };

const LIST_TEMPLATES = [
  { key: "mercearia", label: "🌾 Mercearia", desc: "Arroz, feijão, óleo, açúcar..." },
  { key: "carnes", label: "🥩 Carnes", desc: "Frango, carne moída, linguiça..." },
  { key: "limpeza", label: "🧹 Limpeza", desc: "Detergente, sabão, água sanitária..." },
];

const LIST_FILTER_CATS = [
  { value: "", label: "📋 Lista Completa" },
  { value: "Mercearia", label: "🌾 Mercearia" },
  { value: "Carnes", label: "🥩 Carnes" },
  { value: "Limpeza", label: "🧹 Limpeza" },
  { value: "Hortifruti", label: "🥬 Hortifruti" },
  { value: "Laticínios", label: "🥛 Laticínios" },
  { value: "Higiene", label: "🧴 Higiene" },
];

export default function SupermercadoPage() {
  const [mode, setMode] = useState<string>("");
  const [tab, setTab] = useState<"lista" | "compras" | "comparar" | "gastos">("lista");
  const [list, setList] = useState<ShoppingItem[]>([]);
  const [listFilter, setListFilter] = useState("");
  const [prices, setPrices] = useState<PriceComp[]>([]);
  const [spend, setSpend] = useState<SpendByStore[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [overview, setOverview] = useState<{ totalSpent: number; purchasesCount: number; topStore: SpendByStore | null; shoppingListCount: number } | null>(null);

  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category: "Mercearia", quantity: "1" });
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({ storeName: "", date: "", items: [{ productName: "", category: "Mercearia", price: "", quantity: "1", unit: "und" }] });

  const loadList = (cat?: string) => {
    fetch(`/api/admin/grocery?view=list${cat ? `&category=${cat}` : ""}`)
      .then(r => r.json()).then(setList);
  };

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(d => setMode(d.user?.activeMode || "personal"));
    fetch("/api/admin/grocery?view=overview").then(r => r.json()).then(setOverview);
    loadList();
  }, []);

  useEffect(() => {
    if (tab === "lista") loadList(listFilter);
    if (tab === "comparar") fetch("/api/admin/grocery?view=prices").then(r => r.json()).then(setPrices);
    if (tab === "gastos") {
      fetch("/api/admin/grocery?view=spend").then(r => r.json()).then(setSpend);
      fetch("/api/admin/grocery?view=purchases").then(r => r.json()).then(setPurchases);
    }
  }, [tab, listFilter]);

  async function toggleItem(id: string) {
    await fetch("/api/admin/grocery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_toggle", id }) });
    loadList(listFilter);
  }
  async function removeItem(id: string) {
    await fetch("/api/admin/grocery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_remove", id }) });
    loadList(listFilter);
  }
  async function clearChecked() {
    await fetch("/api/admin/grocery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_clear_checked" }) });
    loadList(listFilter);
  }
  async function addFromTemplate(key: string) {
    await fetch("/api/admin/grocery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_from_template", template: key }) });
    loadList(listFilter);
  }
  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/grocery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_add", ...newItem }) });
    setShowAddItem(false); setNewItem({ name: "", category: "Mercearia", quantity: "1" }); loadList(listFilter);
  }
  async function addPurchase(e: React.FormEvent) {
    e.preventDefault();
    const items = purchaseForm.items.filter(i => i.productName && i.price).map(i => ({ ...i, price: parseFloat(i.price), quantity: parseInt(i.quantity) || 1 }));
    await fetch("/api/admin/grocery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "purchase", storeName: purchaseForm.storeName, date: purchaseForm.date || undefined, items }) });
    setShowAddPurchase(false);
    setPurchaseForm({ storeName: "", date: "", items: [{ productName: "", category: "Mercearia", price: "", quantity: "1", unit: "und" }] });
    fetch("/api/admin/grocery?view=overview").then(r => r.json()).then(setOverview);
    if (tab === "gastos") { fetch("/api/admin/grocery?view=spend").then(r => r.json()).then(setSpend); fetch("/api/admin/grocery?view=purchases").then(r => r.json()).then(setPurchases); }
  }

  const checkedCount = list.filter(i => i.checked).length;
  const grouped = list.reduce((acc, i) => { (acc[i.category] = acc[i.category] || []).push(i); return acc; }, {} as Record<string, ShoppingItem[]>);

  if (mode === "business") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-semibold text-slate-700">Disponível no Modo Pessoal</p>
          <p className="text-sm text-slate-400 mt-1">Alterne para o modo pessoal na sidebar para usar o controle de supermercado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🛒 Supermercado</h1>
          <p className="text-slate-400 text-sm mt-0.5">👤 Pessoal</p>
        </div>
        <button onClick={() => setShowAddPurchase(true)}
          className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition">
          + Registrar Compra
        </button>
      </div>

      {/* Overview */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-amber-600 rounded-2xl p-4 text-white shadow-sm">
            <p className="text-xs text-amber-100">Total Gasto</p>
            <p className="text-lg font-bold mt-1">{fmt(overview.totalSpent)}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Compras</p>
            <p className="text-lg font-bold text-slate-800 mt-1">{overview.purchasesCount}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-400">Mercado favorito</p>
            <p className="text-sm font-bold text-slate-800 mt-1 truncate">{overview.topStore?.storeName || "—"}</p>
          </div>
          <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-sm">
            <p className="text-xs text-blue-100">Na lista</p>
            <p className="text-lg font-bold mt-1">{overview.shoppingListCount} itens</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { key: "lista", label: "📋 Lista" },
          { key: "compras", label: "🧾 Histórico" },
          { key: "comparar", label: "💰 Preços" },
          { key: "gastos", label: "📊 Por mercado" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition",
              tab === t.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── LISTA DE COMPRAS ── */}
      {tab === "lista" && (
        <div className="space-y-4">
          {/* Filtros de categoria */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {LIST_FILTER_CATS.map(f => (
              <button key={f.value} onClick={() => setListFilter(f.value)}
                className={clsx("px-3 py-1.5 rounded-xl text-xs font-semibold transition border shrink-0",
                  listFilter === f.value ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Templates */}
          {!listFilter && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">Gerar lista por categoria:</p>
              <div className="flex gap-2 flex-wrap">
                {LIST_TEMPLATES.map(t => (
                  <button key={t.key} onClick={() => addFromTemplate(t.key)}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs hover:bg-slate-100 transition">
                    <span className="font-medium">{t.label}</span>
                    <span className="text-slate-400">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button onClick={() => setShowAddItem(true)}
                className="px-3 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-700 transition">
                + Item
              </button>
              {checkedCount > 0 && (
                <button onClick={clearChecked}
                  className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold hover:bg-red-100 transition">
                  🗑 Remover marcados ({checkedCount})
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400">{list.filter(i => !i.checked).length} pendentes · {checkedCount} marcados</p>
          </div>

          {/* Lista agrupada por categoria */}
          {list.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📋</p>
              <p className="font-semibold text-slate-700">Lista vazia</p>
              <p className="text-sm text-slate-400 mt-1">Adicione itens ou gere uma lista por categoria</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
                <div key={cat} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                    <span>{CAT_ICON[cat] || "📦"}</span>
                    <span className="text-sm font-semibold text-slate-700">{cat}</span>
                    <span className="text-xs text-slate-400 ml-auto">{items.filter(i => !i.checked).length} itens</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {items.map(item => (
                      <div key={item.id} className={clsx("flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition", item.checked && "opacity-50")}>
                        <button onClick={() => toggleItem(item.id)}
                          className={clsx("w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition",
                            item.checked ? "bg-amber-500 border-amber-500" : "border-slate-300 hover:border-amber-400")}>
                          {item.checked && <span className="text-white text-xs">✓</span>}
                        </button>
                        <span className={clsx("text-sm flex-1", item.checked && "line-through text-slate-400")}>{item.name}</span>
                        <span className="text-xs text-slate-400">{item.quantity}</span>
                        <button onClick={() => removeItem(item.id)} className="text-slate-300 hover:text-red-400 transition text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── HISTÓRICO ── */}
      {tab === "compras" && (
        <div className="space-y-3">
          {purchases.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">🧾</p>
              <p className="font-semibold text-slate-700">Nenhuma compra registrada</p>
            </div>
          ) : purchases.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-slate-800">🛒 {p.storeName}</p>
                  <p className="text-xs text-slate-400">{new Date(p.date + "T12:00:00").toLocaleDateString("pt-BR")} · {p.items.length} itens</p>
                </div>
                <span className="text-base font-bold text-amber-600">{fmt(p.total)}</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {p.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-50">
                    <span className="text-slate-600">{item.productName} × {item.quantity}</span>
                    <span className="font-medium text-slate-700">{fmt(item.price)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── COMPARAR PREÇOS ── */}
      {tab === "comparar" && (
        <div className="space-y-3">
          {prices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">💰</p>
              <p className="font-semibold text-slate-700">Registre compras em pelo menos 2 mercados</p>
              <p className="text-sm text-slate-400 mt-1">A comparação aparece para produtos comprados em mais de um mercado</p>
            </div>
          ) : prices.map(p => {
            const sorted = [...p.prices].sort((a, b) => a.price - b.price);
            const min = sorted[0];
            const max = sorted[sorted.length - 1];
            const diff = max.price - min.price;
            return (
              <div key={p.productName} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-slate-800">{p.productName}</p>
                    <p className="text-xs text-slate-400">{CAT_ICON[p.category]} {p.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-amber-600 font-semibold">Economize {fmt(diff)}</p>
                    <p className="text-xs text-slate-400">comprando no {min.storeName}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {sorted.map(s => (
                    <div key={s.storeName} className={clsx("flex items-center justify-between px-3 py-2 rounded-xl text-sm", s.storeName === min.storeName ? "bg-amber-50 border border-amber-200" : "bg-slate-50")}>
                      <span className="font-medium text-slate-700">{s.storeName}</span>
                      <div className="flex items-center gap-2">
                        <span className={clsx("font-bold", s.storeName === min.storeName ? "text-amber-600" : "text-red-500")}>{fmt(s.price)}</span>
                        {s.storeName === min.storeName && <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full">Mais barato</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── GASTOS POR MERCADO ── */}
      {tab === "gastos" && (
        <div className="space-y-3">
          {spend.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📊</p>
              <p className="font-semibold text-slate-700">Nenhuma compra registrada ainda</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Onde você mais gasta</h3>
              <div className="space-y-4">
                {spend.map((s, i) => {
                  const totalAll = spend.reduce((acc, x) => acc + x.total, 0);
                  const pct = totalAll > 0 ? Math.round(s.total / totalAll * 100) : 0;
                  return (
                    <div key={s.storeId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
                          <span className="font-medium text-slate-800">{s.storeName}</span>
                          <span className="text-xs text-slate-400">{s.visits} visitas</span>
                        </div>
                        <span className="font-bold text-slate-800">{fmt(s.total)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full">
                        <div className="h-2 bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 text-right">{pct}% do total</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: adicionar item */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-slate-900 mb-4">+ Adicionar à lista</h3>
            <form onSubmit={addItem} className="space-y-3">
              <input value={newItem.name} onChange={e => setNewItem(f => ({ ...f, name: e.target.value }))} required
                placeholder="Nome do produto" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <select value={newItem.category} onChange={e => setNewItem(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white">
                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
              </select>
              <input value={newItem.quantity} onChange={e => setNewItem(f => ({ ...f, quantity: e.target.value }))}
                placeholder="Quantidade (ex: 2 kg, 1 caixa)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddItem(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-slate-800 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-slate-700 transition">Adicionar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: registrar compra */}
      {showAddPurchase && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 mb-4">🧾 Registrar Compra</h3>
            <form onSubmit={addPurchase} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <input value={purchaseForm.storeName} onChange={e => setPurchaseForm(f => ({ ...f, storeName: e.target.value }))} required
                  placeholder="Nome do mercado" className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
                <input type="date" value={purchaseForm.date} onChange={e => setPurchaseForm(f => ({ ...f, date: e.target.value }))}
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Itens comprados</p>
                {purchaseForm.items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start">
                    <input value={item.productName} onChange={e => { const its = [...purchaseForm.items]; its[i] = { ...its[i], productName: e.target.value }; setPurchaseForm(f => ({ ...f, items: its })); }}
                      placeholder="Produto" className="col-span-4 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none" />
                    <select value={item.category} onChange={e => { const its = [...purchaseForm.items]; its[i] = { ...its[i], category: e.target.value }; setPurchaseForm(f => ({ ...f, items: its })); }}
                      className="col-span-3 border border-slate-200 rounded-xl px-2 py-2 text-xs outline-none bg-white">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" step="0.01" value={item.price} onChange={e => { const its = [...purchaseForm.items]; its[i] = { ...its[i], price: e.target.value }; setPurchaseForm(f => ({ ...f, items: its })); }}
                      placeholder="R$" className="col-span-2 border border-slate-200 rounded-xl px-2 py-2 text-xs outline-none" />
                    <input type="number" value={item.quantity} onChange={e => { const its = [...purchaseForm.items]; its[i] = { ...its[i], quantity: e.target.value }; setPurchaseForm(f => ({ ...f, items: its })); }}
                      placeholder="Qtd" className="col-span-2 border border-slate-200 rounded-xl px-2 py-2 text-xs outline-none" />
                    <button type="button" onClick={() => setPurchaseForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                      className="col-span-1 text-red-400 hover:text-red-600 text-sm py-2">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setPurchaseForm(f => ({ ...f, items: [...f.items, { productName: "", category: "Mercearia", price: "", quantity: "1", unit: "und" }] }))}
                  className="text-xs text-amber-600 hover:underline font-medium">+ Adicionar produto</button>
              </div>

              <div className="text-right text-sm font-semibold text-slate-800">
                Total: {fmt(purchaseForm.items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.quantity) || 1), 0))}
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddPurchase(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-amber-700 transition">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
