"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";

type ShoppingItem = { id: string; name: string; category: string; quantity: string; checked: boolean };
type PriceComp = { productName: string; category: string; prices: Array<{ storeName: string; price: number; date: string }> };
type SpendByStore = { storeId: string; storeName: string; total: number; visits: number };
type Purchase = { id: string; storeName: string; date: string; total: number; items: Array<{ productName: string; price: number; quantity: number; category: string; unit: string }> };
type Product = { id: string; name: string; category: string; defaultUnit: string };

function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

const CATEGORIES = ["Abarrotes", "Carnes", "Frutas y Verduras", "Lácteos", "Panadería", "Bebidas", "Limpieza", "Higiene", "Otros"] as const;
const CAT_ICON: Record<string, string> = { Abarrotes: "🌾", Carnes: "🥩", "Frutas y Verduras": "🥬", Lácteos: "🥛", Panadería: "🍞", Bebidas: "🧃", Limpieza: "🧹", Higiene: "🧴", Otros: "📦" };

const LIST_TEMPLATES = [
  { key: "mercearia", label: "🌾 Abarrotes", desc: "Arroz, frijoles, aceite, azúcar..." },
  { key: "carnes", label: "🥩 Carnes", desc: "Bistec, pollo, chorizo, carne molida..." },
  { key: "hortifruti", label: "🥬 Frutas y Verduras", desc: "Plátano, tomate, cebolla, papa..." },
  { key: "laticinios", label: "🥛 Lácteos", desc: "Leche, queso, yogur, mantequilla..." },
  { key: "padaria", label: "🍞 Panadería", desc: "Pan, pan de molde, galletas..." },
  { key: "bebidas", label: "🧃 Bebidas", desc: "Agua, refresco, jugo, cerveza..." },
  { key: "higiene", label: "🧴 Higiene", desc: "Jabón, champú, papel higiénico..." },
  { key: "limpeza", label: "🧹 Limpieza", desc: "Detergente, jabón, cloro..." },
];

const LIST_FILTER_CATS = [
  { value: "", label: "📋 Lista Completa" },
  { value: "Abarrotes", label: "🌾 Abarrotes" },
  { value: "Carnes", label: "🥩 Carnes" },
  { value: "Frutas y Verduras", label: "🥬 Frutas y Verduras" },
  { value: "Lácteos", label: "🥛 Lácteos" },
  { value: "Panadería", label: "🍞 Panadería" },
  { value: "Bebidas", label: "🧃 Bebidas" },
  { value: "Higiene", label: "🧴 Higiene" },
  { value: "Limpieza", label: "🧹 Limpieza" },
];

export default function SupermercadoPageEs() {
  const [mode, setMode] = useState<string>("");
  const [tab, setTab] = useState<"lista" | "compras" | "comparar" | "gastos" | "catalogo">("lista");
  const [list, setList] = useState<ShoppingItem[]>([]);
  const [listFilter, setListFilter] = useState("");
  const [prices, setPrices] = useState<PriceComp[]>([]);
  const [spend, setSpend] = useState<SpendByStore[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [overview, setOverview] = useState<{ totalSpent: number; purchasesCount: number; topStore: SpendByStore | null; shoppingListCount: number } | null>(null);

  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", category: "Abarrotes", quantity: "1" });
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({ storeName: "", date: "", items: [{ productName: "", category: "Abarrotes", price: "", quantity: "1", unit: "und" }] });
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [finishForm, setFinishForm] = useState({ storeName: "", date: "" });
  const [finishPrices, setFinishPrices] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState(false);

  const loadList = (cat?: string) => {
    fetch(`/api/admin/grocery?view=list${cat ? `&category=${cat}` : ""}`)
      .then(r => r.json()).then(setList);
  };

  useEffect(() => {
    fetchDashboardMe().then(d => setMode(d.user?.activeMode || "personal"));
    fetch("/api/admin/grocery?view=overview").then(r => r.json()).then(setOverview);
    loadList();
  }, []);

  useEffect(() => {
    if (tab === "lista") loadList(listFilter);
    // "compras" (Histórico) e "gastos" (Por mercado) mostram a mesma lista
    // de purchases — antes só "gastos" buscava, então Histórico ficava
    // vazio até o usuário clicar em Por mercado primeiro.
    if (tab === "compras" || tab === "gastos") fetch("/api/admin/grocery?view=purchases").then(r => r.json()).then(setPurchases);
    if (tab === "comparar") fetch("/api/admin/grocery?view=prices").then(r => r.json()).then(setPrices);
    if (tab === "gastos") fetch("/api/admin/grocery?view=spend").then(r => r.json()).then(setSpend);
    if (tab === "catalogo") fetch("/api/admin/grocery?view=products").then(r => r.json()).then(setProducts);
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
    setShowAddItem(false); setNewItem({ name: "", category: "Abarrotes", quantity: "1" }); loadList(listFilter);
  }
  async function addPurchase(e: React.FormEvent) {
    e.preventDefault();
    setPurchaseError(null);
    setSavingPurchase(true);
    const items = purchaseForm.items.filter(i => i.productName && i.price).map(i => ({ ...i, price: parseFloat(i.price), quantity: parseInt(i.quantity) || 1 }));
    const r = await fetch("/api/admin/grocery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "purchase", storeName: purchaseForm.storeName, date: purchaseForm.date || undefined, items }) });
    setSavingPurchase(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setPurchaseError(d.error || "No pude registrar la compra");
      return;
    }
    setShowAddPurchase(false);
    setPurchaseForm({ storeName: "", date: "", items: [{ productName: "", category: "Abarrotes", price: "", quantity: "1", unit: "und" }] });
    fetch("/api/admin/grocery?view=overview").then(r2 => r2.json()).then(setOverview);
    if (tab === "gastos") { fetch("/api/admin/grocery?view=spend").then(r2 => r2.json()).then(setSpend); fetch("/api/admin/grocery?view=purchases").then(r2 => r2.json()).then(setPurchases); }
  }

  function openFinish() {
    const prices: Record<string, string> = {};
    for (const item of list.filter(i => i.checked)) prices[item.id] = "";
    setFinishPrices(prices);
    setShowFinish(true);
  }

  const finishTotal = Object.values(finishPrices).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const finishAllFilled = Object.values(finishPrices).length > 0 && Object.values(finishPrices).every(v => parseFloat(v) > 0);

  async function finishFromChecked(e: React.FormEvent) {
    e.preventDefault();
    setFinishing(true);
    const itemPrices: Record<string, number> = {};
    for (const [id, v] of Object.entries(finishPrices)) itemPrices[id] = parseFloat(v) || 0;
    const r = await fetch("/api/admin/grocery", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finish_from_checked", storeName: finishForm.storeName, itemPrices, date: finishForm.date || undefined }),
    });
    setFinishing(false);
    if (r.ok) {
      setShowFinish(false);
      setFinishForm({ storeName: "", date: "" });
      setFinishPrices({});
      loadList(listFilter);
      fetch("/api/admin/grocery?view=overview").then(r2 => r2.json()).then(setOverview);
    }
  }

  const checkedCount = list.filter(i => i.checked).length;
  const grouped = list.reduce((acc, i) => { (acc[i.category] = acc[i.category] || []).push(i); return acc; }, {} as Record<string, ShoppingItem[]>);

  if (mode === "business") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-semibold text-slate-700">Disponible en Modo Personal</p>
          <p className="text-sm text-slate-400 mt-1">Cambia al modo personal en la barra lateral para usar el control de supermercado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🛒 Supermercado</h1>
          <p className="text-slate-400 text-sm mt-0.5">👤 Personal</p>
        </div>
        <div className="flex gap-2">
          {checkedCount > 0 && (
            <button onClick={openFinish}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition">
              ✅ Finalizar compra ({checkedCount})
            </button>
          )}
          <button onClick={() => setShowAddPurchase(true)}
            className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 transition">
            + Registrar desde cero
          </button>
        </div>
      </div>

      {/* Overview */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-lg shrink-0">💸</span>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Total gastado</p>
              <p className="text-lg font-bold text-slate-800 mt-0.5 truncate">{fmt(overview.totalSpent)}</p>
            </div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-lg shrink-0">🧾</span>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Compras</p>
              <p className="text-lg font-bold text-slate-800 mt-0.5">{overview.purchasesCount}</p>
            </div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-lg shrink-0">🏆</span>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">Mercado favorito</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5 truncate">{overview.topStore?.storeName || "—"}</p>
            </div>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-lg shrink-0">📋</span>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">En la lista</p>
              <p className="text-lg font-bold text-slate-800 mt-0.5">{overview.shoppingListCount} artículos</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { key: "lista", label: "📋 Lista" },
          { key: "compras", label: "🧾 Historial" },
          { key: "comparar", label: "💰 Precios" },
          { key: "gastos", label: "📊 Por mercado" },
          { key: "catalogo", label: "📦 Catálogo" },
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
              <p className="text-sm font-semibold text-slate-700 mb-3">Generar lista por categoría</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {LIST_TEMPLATES.map(t => (
                  <button key={t.key} onClick={() => addFromTemplate(t.key)}
                    className="flex flex-col items-start gap-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-left hover:bg-amber-50 hover:border-amber-200 transition">
                    <span className="font-semibold text-xs text-slate-800">{t.label}</span>
                    <span className="text-slate-400 text-[11px] leading-snug">{t.desc}</span>
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
                + Artículo
              </button>
              {checkedCount > 0 && (
                <>
                  <button onClick={openFinish}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition">
                    ✅ Finalizar compra ({checkedCount})
                  </button>
                  <button onClick={clearChecked}
                    className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold hover:bg-red-100 transition">
                    🗑 Eliminar marcados ({checkedCount})
                  </button>
                </>
              )}
            </div>
            <p className="text-xs text-slate-400">{list.filter(i => !i.checked).length} pendientes · {checkedCount} marcados</p>
          </div>

          {/* Lista agrupada por categoria */}
          {list.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📋</p>
              <p className="font-semibold text-slate-700">Lista vacía</p>
              <p className="text-sm text-slate-400 mt-1">Agrega artículos o genera una lista por categoría</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
                <div key={cat} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                    <span>{CAT_ICON[cat] || "📦"}</span>
                    <span className="text-sm font-semibold text-slate-700">{cat}</span>
                    <span className="text-xs text-slate-400 ml-auto">{items.filter(i => !i.checked).length} artículos</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {items.map(item => (
                      <div key={item.id}
                        role="button" tabIndex={0}
                        onClick={() => toggleItem(item.id)}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleItem(item.id); } }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer select-none">
                        <span
                          className={clsx("w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition",
                            item.checked ? "bg-amber-500 border-amber-500" : "border-slate-300")}>
                          {item.checked && <span className="text-white text-xs">✓</span>}
                        </span>
                        <span className={clsx("text-sm flex-1", item.checked ? "line-through text-slate-400" : "text-slate-700")}>{item.name}</span>
                        <span className={clsx("text-xs", item.checked ? "text-slate-300" : "text-slate-400")}>{item.quantity}</span>
                        <button onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                          className="text-slate-300 hover:text-red-400 transition text-xs p-1 -m-1">✕</button>
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
              <p className="font-semibold text-slate-700">Ninguna compra registrada</p>
            </div>
          ) : purchases.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-slate-800">🛒 {p.storeName}</p>
                  <p className="text-xs text-slate-400">{new Date(p.date + "T12:00:00").toLocaleDateString("es-419")} · {p.items.length} artículos</p>
                </div>
                <span className="text-base font-bold text-amber-600">{fmt(p.total)}</span>
              </div>
              <div className="space-y-0.5">
                {p.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-50">
                    <span className="text-slate-600">{item.productName}</span>
                    <span className="text-slate-500 shrink-0 ml-2">
                      {fmt(item.price)} × {item.quantity} = <span className="font-medium text-slate-700">{fmt(item.price * item.quantity)}</span>
                    </span>
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
              <p className="font-semibold text-slate-700">Registra compras en al menos 2 mercados</p>
              <p className="text-sm text-slate-400 mt-1">La comparación aparece para productos comprados en más de un mercado</p>
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
                    <p className="text-xs text-amber-600 font-semibold">Ahorra {fmt(diff)}</p>
                    <p className="text-xs text-slate-400">comprando en {min.storeName}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {sorted.map(s => (
                    <div key={s.storeName} className={clsx("flex items-center justify-between px-3 py-2 rounded-xl text-sm", s.storeName === min.storeName ? "bg-amber-50 border border-amber-200" : "bg-slate-50")}>
                      <span className="font-medium text-slate-700">{s.storeName}</span>
                      <div className="flex items-center gap-2">
                        <span className={clsx("font-bold", s.storeName === min.storeName ? "text-amber-600" : "text-red-500")}>{fmt(s.price)}</span>
                        {s.storeName === min.storeName && <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full">Más barato</span>}
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
              <p className="font-semibold text-slate-700">Ninguna compra registrada todavía</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-semibold text-slate-800 mb-4">Dónde gastas más</h3>
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
                      <p className="text-xs text-slate-400 mt-0.5 text-right">{pct}% del total</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CATÁLOGO ── */}
      {tab === "catalogo" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Productos registrados automáticamente conforme registras compras. Si algo aparece duplicado o agrupado mal, avísame.</p>
          {products.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📦</p>
              <p className="font-semibold text-slate-700">Ningún producto registrado todavía</p>
              <p className="text-sm text-slate-400 mt-1">Aparece aquí conforme registras compras</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
              {products.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span>{CAT_ICON[p.category] || "📦"}</span>
                  <span className="text-sm text-slate-700 flex-1">{p.name}</span>
                  <span className="text-xs text-slate-400">{p.category}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: adicionar item */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-slate-900 mb-4">+ Agregar a la lista</h3>
            <form onSubmit={addItem} className="space-y-3">
              <input value={newItem.name} onChange={e => setNewItem(f => ({ ...f, name: e.target.value }))} required
                placeholder="Nombre del producto" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <select value={newItem.category} onChange={e => setNewItem(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white">
                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
              </select>
              <input value={newItem.quantity} onChange={e => setNewItem(f => ({ ...f, quantity: e.target.value }))}
                placeholder="Cantidad (ej: 2 kg, 1 caja)" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddItem(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-slate-800 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-slate-700 transition">Agregar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: finalizar compra a partir da lista marcada */}
      {showFinish && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 mb-1">✅ Finalizar compra</h3>
            <p className="text-xs text-slate-400 mb-4">Cierra los {checkedCount} artículos marcados como una compra, los registra en Finanzas y limpia la lista. Coloca el precio de cada artículo para que entre correctamente en la comparación de precios.</p>
            <form onSubmit={finishFromChecked} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input value={finishForm.storeName} onChange={e => setFinishForm(f => ({ ...f, storeName: e.target.value }))} required
                  placeholder="Nombre del mercado" className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
                <input type="date" value={finishForm.date} onChange={e => setFinishForm(f => ({ ...f, date: e.target.value }))}
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Precio de cada artículo</p>
                {list.filter(i => i.checked).map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className="text-sm text-slate-700 flex-1 truncate">{item.name} <span className="text-slate-400">({item.quantity})</span></span>
                    <input type="number" step="0.01" min="0" required
                      value={finishPrices[item.id] ?? ""}
                      onChange={e => setFinishPrices(p => ({ ...p, [item.id]: e.target.value }))}
                      placeholder="R$" className="w-24 border border-slate-200 rounded-xl px-3 py-1.5 text-sm outline-none" />
                  </div>
                ))}
              </div>

              <div className="text-right text-sm font-semibold text-slate-800 pt-1 border-t border-slate-100">
                Total: {fmt(finishTotal)}
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowFinish(false)} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" disabled={finishing || !finishAllFilled} className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50">{finishing ? "..." : "Finalizar"}</button>
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
                  placeholder="Nombre del mercado" className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
                <input type="date" value={purchaseForm.date} onChange={e => setPurchaseForm(f => ({ ...f, date: e.target.value }))}
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Artículos comprados</p>
                {purchaseForm.items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start">
                    <input value={item.productName} onChange={e => { const its = [...purchaseForm.items]; its[i] = { ...its[i], productName: e.target.value }; setPurchaseForm(f => ({ ...f, items: its })); }}
                      placeholder="Producto" className="col-span-12 sm:col-span-4 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none" />
                    <select value={item.category} onChange={e => { const its = [...purchaseForm.items]; its[i] = { ...its[i], category: e.target.value }; setPurchaseForm(f => ({ ...f, items: its })); }}
                      className="col-span-6 sm:col-span-3 w-full border border-slate-200 rounded-xl px-2 py-2 text-xs outline-none bg-white">
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" step="0.01" value={item.price} onChange={e => { const its = [...purchaseForm.items]; its[i] = { ...its[i], price: e.target.value }; setPurchaseForm(f => ({ ...f, items: its })); }}
                      placeholder="R$" className="col-span-3 sm:col-span-2 w-full border border-slate-200 rounded-xl px-2 py-2 text-xs outline-none" />
                    <input type="number" value={item.quantity} onChange={e => { const its = [...purchaseForm.items]; its[i] = { ...its[i], quantity: e.target.value }; setPurchaseForm(f => ({ ...f, items: its })); }}
                      placeholder="Cant." className="col-span-2 w-full border border-slate-200 rounded-xl px-2 py-2 text-xs outline-none" />
                    <button type="button" onClick={() => setPurchaseForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                      className="col-span-1 text-red-400 hover:text-red-600 text-sm py-2">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setPurchaseForm(f => ({ ...f, items: [...f.items, { productName: "", category: "Abarrotes", price: "", quantity: "1", unit: "und" }] }))}
                  className="text-xs text-amber-600 hover:underline font-medium">+ Agregar producto</button>
              </div>

              <div className="text-right text-sm font-semibold text-slate-800">
                Total: {fmt(purchaseForm.items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.quantity) || 1), 0))}
              </div>

              {purchaseError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600">{purchaseError}</div>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowAddPurchase(false); setPurchaseError(null); }} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" disabled={savingPurchase} className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-amber-700 transition disabled:opacity-50">{savingPurchase ? "..." : "Registrar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
