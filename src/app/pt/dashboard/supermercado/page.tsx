"use client";
import PageTitle from "@/components/PageTitle";
import { useCallback, useEffect, useState } from "react";
import { clsx } from "clsx";
import { fetchDashboardMe } from "@/lib/dashboard-me-client";
import { GroceryTemplatePicker } from "@/components/GroceryTemplatePicker";

type ShoppingItem = { id: string; name: string; category: string; quantity: string; checked: boolean };
type PriceComp = { productName: string; category: string; prices: Array<{ storeName: string; price: number; date: string }> };
type SpendByStore = { storeId: string; storeName: string; total: number; visits: number };
type Purchase = { id: string; storeName: string; date: string; total: number; items: Array<{ productName: string; price: number; quantity: number; category: string; unit: string }> };
type Product = { id: string; name: string; category: string; defaultUnit: string };

function fmt(v: number) { return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" }); }

const CATEGORIES = [
  { value: "Mercearia", label: "Mercearia" }, { value: "Carnes", label: "Carnes" },
  { value: "Hortifruti", label: "Frutas e Legumes" }, { value: "Laticínios", label: "Laticínios" },
  { value: "Padaria", label: "Padaria" }, { value: "Bebidas", label: "Bebidas" },
  { value: "Limpeza", label: "Limpeza" }, { value: "Higiene", label: "Higiene" },
  { value: "Outros", label: "Outros" },
] as const;
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));
const CAT_ICON: Record<string, string> = { Mercearia: "🌾", Carnes: "🥩", Hortifruti: "🥬", Laticínios: "🥛", Padaria: "🍞", Bebidas: "🧃", Limpeza: "🧹", Higiene: "🧴", Outros: "📦" };

const LIST_TEMPLATES = [
  { key: "mercearia", label: "🌾 Mercearia", desc: "Arroz, feijão, óleo, açúcar..." },
  { key: "carnes", label: "🥩 Carnes", desc: "Bife, frango, salsicha, entrecosto..." },
  { key: "hortifruti", label: "🥬 Frutas e Legumes", desc: "Banana, tomate, cebola, batata..." },
  { key: "laticinios", label: "🥛 Laticínios", desc: "Leite, queijo, iogurte, manteiga..." },
  { key: "padaria", label: "🍞 Padaria", desc: "Pão, pão de forma, bolachas..." },
  { key: "bebidas", label: "🧃 Bebidas", desc: "Água, refrigerante, sumo, cerveja..." },
  { key: "higiene", label: "🧴 Higiene", desc: "Sabonete, champô, papel higiénico..." },
  { key: "limpeza", label: "🧹 Limpeza", desc: "Detergente, sabão, lixívia..." },
];

const LIST_FILTER_CATS = [
  { value: "", label: "📋 Lista Completa" },
  { value: "Mercearia", label: "🌾 Mercearia" },
  { value: "Carnes", label: "🥩 Carnes" },
  { value: "Hortifruti", label: "🥬 Frutas e Legumes" },
  { value: "Laticínios", label: "🥛 Laticínios" },
  { value: "Padaria", label: "🍞 Padaria" },
  { value: "Bebidas", label: "🧃 Bebidas" },
  { value: "Higiene", label: "🧴 Higiene" },
  { value: "Limpeza", label: "🧹 Limpeza" },
];

export default function SupermercadoPagePt() {
  const [mode, setMode] = useState<string>("");
  const [tab, setTab] = useState<"lista" | "whatsapp" | "compras" | "comparar" | "gastos" | "catalogo">("lista");
  const [list, setList] = useState<ShoppingItem[]>([]);
  const [listFilter, setListFilter] = useState("");
  const [prices, setPrices] = useState<PriceComp[]>([]);
  const [spend, setSpend] = useState<SpendByStore[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [overview, setOverview] = useState<{ totalSpent: number; purchasesCount: number; topStore: SpendByStore | null; shoppingListCount: number } | null>(null);

  const [showAddItem, setShowAddItem] = useState(false);
  const [templatePicker, setTemplatePicker] = useState<{ key: string; label: string } | null>(null);
  const [newItem, setNewItem] = useState({ name: "", category: "Mercearia", quantity: "1" });
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({ storeName: "", date: "", items: [{ productName: "", category: "Mercearia", price: "", quantity: "1", unit: "und" }] });
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [finishForm, setFinishForm] = useState({ storeName: "", date: "" });
  const [finishPrices, setFinishPrices] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState(false);

  const loadList = useCallback((cat?: string) => {
    fetch(`/api/admin/grocery?view=list${cat ? `&category=${cat}` : ""}`)
      .then(r => r.json()).then(setList);
  }, []);

  const loadOverview = useCallback(() => {
    fetch("/api/admin/grocery?view=overview").then(r => r.json()).then(setOverview);
  }, []);

  useEffect(() => {
    fetchDashboardMe().then(d => setMode(d.user?.activeMode || "personal"));
    loadOverview();
    loadList();
  }, [loadList, loadOverview]);

  useEffect(() => {
    if (tab === "lista") loadList(listFilter);
    if (tab === "whatsapp") loadList();
    // "compras" (Histórico) e "gastos" (Por mercado) mostram a mesma lista
    // de purchases — antes só "gastos" buscava, então Histórico ficava
    // vazio até o usuário clicar em Por mercado primeiro.
    if (tab === "compras" || tab === "gastos") fetch("/api/admin/grocery?view=purchases").then(r => r.json()).then(setPurchases);
    if (tab === "comparar") fetch("/api/admin/grocery?view=prices").then(r => r.json()).then(setPrices);
    if (tab === "gastos") fetch("/api/admin/grocery?view=spend").then(r => r.json()).then(setSpend);
    if (tab === "catalogo") fetch("/api/admin/grocery?view=products").then(r => r.json()).then(setProducts);
  }, [tab, listFilter, loadList]);

  useEffect(() => {
    if (tab !== "lista" && tab !== "whatsapp") return;
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      loadList(tab === "whatsapp" ? undefined : listFilter);
      loadOverview();
    };
    const timer = window.setInterval(sync, 30_000);
    const onVisibility = () => { if (document.visibilityState === "visible") sync(); };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tab, listFilter, loadList, loadOverview]);

  async function toggleItem(id: string) {
    await fetch("/api/admin/grocery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_toggle", id }) });
    loadList(tab === "whatsapp" ? undefined : listFilter); loadOverview();
  }
  async function removeItem(id: string) {
    await fetch("/api/admin/grocery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_remove", id }) });
    loadList(tab === "whatsapp" ? undefined : listFilter); loadOverview();
  }
  async function clearChecked() {
    await fetch("/api/admin/grocery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_clear_checked" }) });
    loadList(tab === "whatsapp" ? undefined : listFilter); loadOverview();
  }
  async function setAllChecked(checked: boolean) {
    await fetch("/api/admin/grocery", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list_check_all", checked, category: listFilter || undefined }),
    });
    loadList(listFilter); loadOverview();
  }
  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/grocery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_add", ...newItem }) });
    setShowAddItem(false); setNewItem({ name: "", category: "Mercearia", quantity: "1" }); loadList(listFilter); loadOverview();
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
      setPurchaseError(d.error || "Não consegui registar a compra");
      return;
    }
    setShowAddPurchase(false);
    setPurchaseForm({ storeName: "", date: "", items: [{ productName: "", category: "Mercearia", price: "", quantity: "1", unit: "und" }] });
    loadOverview();
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
      loadOverview();
    }
  }

  const checkedCount = list.filter(i => i.checked).length;
  const grouped = list.reduce((acc, i) => { (acc[i.category] = acc[i.category] || []).push(i); return acc; }, {} as Record<string, ShoppingItem[]>);
  const whatsappItems = list.filter(i => !i.checked);

  if (mode === "business") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-4xl mb-3">🛒</p>
          <p className="font-semibold text-ink">Disponível no Modo Pessoal</p>
          <p className="text-sm text-subtle mt-1">Muda para o modo pessoal na barra lateral para usares o controlo de supermercado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="z-page">
      <div className="z-page-heading flex items-center justify-between">
        <div>
          <PageTitle icon="cart">Supermercado</PageTitle>
          <p className="text-subtle text-sm mt-0.5">👤 Pessoal</p>
        </div>
        <div className="flex gap-2">
          {checkedCount > 0 && (
            <button onClick={openFinish}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition">
              ✅ Finalizar compra ({checkedCount})
            </button>
          )}
          <button onClick={() => setShowAddPurchase(true)}
            className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary-hover transition">
            + Registar do zero
          </button>
        </div>
      </div>

      {/* Overview */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-amber-soft flex items-center justify-center text-lg shrink-0">💸</span>
            <div className="min-w-0">
              <p className="text-xs text-subtle">Total gasto</p>
              <p className="text-lg font-bold text-ink mt-0.5 truncate">{fmt(overview.totalSpent)}</p>
            </div>
          </div>
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-surface-muted flex items-center justify-center text-lg shrink-0">🧾</span>
            <div className="min-w-0">
              <p className="text-xs text-subtle">Compras</p>
              <p className="text-lg font-bold text-ink mt-0.5">{overview.purchasesCount}</p>
            </div>
          </div>
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-emerald-soft flex items-center justify-center text-lg shrink-0">🏆</span>
            <div className="min-w-0">
              <p className="text-xs text-subtle">Mercado favorito</p>
              <p className="text-sm font-bold text-ink mt-0.5 truncate">{overview.topStore?.storeName || "—"}</p>
            </div>
          </div>
          <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-soft flex items-center justify-center text-lg shrink-0">📋</span>
            <div className="min-w-0">
              <p className="text-xs text-subtle">Na lista</p>
              <p className="text-lg font-bold text-ink mt-0.5">{overview.shoppingListCount} itens</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-muted p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
        {[
          { key: "lista", label: "📋 Lista" },
          { key: "whatsapp", label: "💬 Lista WhatsApp" },
          { key: "compras", label: "🧾 Histórico" },
          { key: "comparar", label: "💰 Preços" },
          { key: "gastos", label: "📊 Por mercado" },
          { key: "catalogo", label: "📦 Catálogo" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition shrink-0",
              tab === t.key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── LISTA DE COMPRAS ── */}
      {tab === "lista" && (
        <div className="space-y-4">
          {/* Filtros de categoria */}
          <div>
            <p className="text-xs font-semibold text-muted mb-2">Filtrar os itens que já estão na tua lista</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {LIST_FILTER_CATS.map(f => (
                <button key={f.value} onClick={() => setListFilter(f.value)}
                  className={clsx("px-3 py-1.5 rounded-xl text-xs font-semibold transition border shrink-0",
                    listFilter === f.value ? "bg-slate-800 text-white border-slate-800" : "bg-surface border-line text-muted hover:bg-surface-muted")}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Templates */}
          {!listFilter && (
            <div className="bg-surface rounded-2xl border border-line shadow-sm p-4">
              <p className="text-sm font-semibold text-ink">Escolhe produtos por categoria</p>
              <p className="text-xs text-subtle mt-1 mb-3">Abre uma categoria, marca os produtos pretendidos e confirma. Nada é adicionado automaticamente.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {LIST_TEMPLATES.map(t => (
                  <button key={t.key} onClick={() => setTemplatePicker({ key: t.key, label: t.label })}
                    className="flex flex-col items-start gap-1 px-3 py-2.5 bg-surface-muted border border-line rounded-xl text-left hover:bg-amber-soft hover:border-line transition">
                    <span className="font-semibold text-xs text-ink">{t.label}</span>
                    <span className="text-subtle text-[11px] leading-snug">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowAddItem(true)}
                className="px-3 py-1.5 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:bg-primary-hover transition">
                + Item
              </button>
              {list.some(item => !item.checked) && (
                <button onClick={() => setAllChecked(true)}
                  className="px-3 py-1.5 bg-amber-soft text-amber-ink border border-line rounded-xl text-xs font-semibold hover:bg-amber-soft transition">
                  ✓ Marcar todos ({list.filter(item => !item.checked).length})
                </button>
              )}
              {checkedCount > 0 && (
                <>
                  <button onClick={() => setAllChecked(false)}
                    className="px-3 py-1.5 bg-surface text-muted border border-line rounded-xl text-xs font-semibold hover:bg-surface-muted transition">
                    Desmarcar todos
                  </button>
                  <button onClick={openFinish}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 transition">
                    ✅ Finalizar compra ({checkedCount})
                  </button>
                  <button onClick={clearChecked}
                    className="px-3 py-1.5 bg-red-soft text-red-ink border border-line rounded-xl text-xs font-semibold hover:bg-red-soft transition">
                    🗑 Remover marcados ({checkedCount})
                  </button>
                </>
              )}
            </div>
            <p className="text-xs text-subtle">{list.filter(i => !i.checked).length} pendentes · {checkedCount} marcados</p>
          </div>

          {/* Lista agrupada por categoria */}
          {list.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-line p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📋</p>
              <p className="font-semibold text-ink">Lista vazia</p>
              <p className="text-sm text-subtle mt-1">Adiciona itens ou gera uma lista por categoria</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
                <div key={cat} className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
                  <div className="px-4 py-2.5 bg-surface-muted border-b border-line flex items-center gap-2">
                    <span>{CAT_ICON[cat] || "📦"}</span>
                    <span className="text-sm font-semibold text-ink">{CATEGORY_LABEL[cat] || cat}</span>
                    <span className="text-xs text-subtle ml-auto">{items.filter(i => !i.checked).length} itens</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {items.map(item => (
                      <div key={item.id}
                        role="button" tabIndex={0}
                        onClick={() => toggleItem(item.id)}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleItem(item.id); } }}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted active:bg-surface-muted transition cursor-pointer select-none">
                        <span
                          className={clsx("w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition",
                            item.checked ? "bg-amber-500 border-amber-500" : "border-line")}>
                          {item.checked && <span className="text-white text-xs">✓</span>}
                        </span>
                        <span className={clsx("text-sm flex-1", item.checked ? "line-through text-subtle" : "text-ink")}>{item.name}</span>
                        <span className={clsx("text-xs", item.checked ? "text-subtle" : "text-subtle")}>{item.quantity}</span>
                        <button onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                          className="text-subtle hover:text-red-400 transition text-xs p-1 -m-1">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── LISTA PARTILHADA COM O WHATSAPP ── */}
      {tab === "whatsapp" && (
        <div className="space-y-4">
          <div className="bg-emerald-soft border border-line rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <p className="font-semibold text-emerald-ink">💬 Lista sincronizada com o WhatsApp</p>
              <p className="text-sm text-emerald-ink mt-1">Os itens pedidos ao Zelo aparecem aqui e também no separador Lista. A atualização acontece automaticamente.</p>
            </div>
            <button onClick={() => loadList()} className="px-3 py-2 bg-surface border border-line rounded-xl text-xs font-semibold text-emerald-ink hover:bg-emerald-soft transition">
              Atualizar agora
            </button>
          </div>

          {whatsappItems.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-line p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">💬</p>
              <p className="font-semibold text-ink">Nenhum item pendente</p>
              <p className="text-sm text-subtle mt-1">Envia no WhatsApp: “Criar lista supermercado com arroz, leite e pão”.</p>
            </div>
          ) : (
            <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-surface-muted border-b border-line flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Itens para comprar</span>
                <span className="text-xs text-subtle">{whatsappItems.length} itens</span>
              </div>
              <div className="divide-y divide-slate-50">
                {whatsappItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => toggleItem(item.id)} aria-label={`Marcar ${item.name} como comprado`}
                      className="w-5 h-5 rounded-md border-2 border-line hover:border-amber-500 shrink-0" />
                    <span>{CAT_ICON[item.category] || "📦"}</span>
                    <span className="text-sm text-ink flex-1">{item.name}</span>
                    <span className="text-xs text-subtle">{item.quantity}</span>
                    <button onClick={() => removeItem(item.id)} aria-label={`Remover ${item.name}`}
                      className="text-subtle hover:text-red-400 transition text-xs p-1">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── HISTÓRICO ── */}
      {tab === "compras" && (
        <div className="space-y-3">
          {purchases.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-line p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">🧾</p>
              <p className="font-semibold text-ink">Nenhuma compra registada</p>
            </div>
          ) : purchases.map(p => (
            <div key={p.id} className="bg-surface rounded-2xl border border-line shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-ink">🛒 {p.storeName}</p>
                  <p className="text-xs text-subtle">{new Date(p.date + "T12:00:00").toLocaleDateString("pt-PT")} · {p.items.length} itens</p>
                </div>
                <span className="text-base font-bold text-amber-ink">{fmt(p.total)}</span>
              </div>
              <div className="space-y-0.5">
                {p.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-50">
                    <span className="text-muted">{item.productName}</span>
                    <span className="text-muted shrink-0 ml-2">
                      {fmt(item.price)} × {item.quantity} = <span className="font-medium text-ink">{fmt(item.price * item.quantity)}</span>
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
            <div className="bg-surface rounded-2xl border border-line p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">💰</p>
              <p className="font-semibold text-ink">Regista compras em pelo menos 2 mercados</p>
              <p className="text-sm text-subtle mt-1">A comparação aparece para produtos comprados em mais de um mercado</p>
            </div>
          ) : prices.map(p => {
            const sorted = [...p.prices].sort((a, b) => a.price - b.price);
            const min = sorted[0];
            const max = sorted[sorted.length - 1];
            const diff = max.price - min.price;
            return (
              <div key={p.productName} className="bg-surface rounded-2xl border border-line shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-ink">{p.productName}</p>
                    <p className="text-xs text-subtle">{CAT_ICON[p.category]} {CATEGORY_LABEL[p.category] || p.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-amber-ink font-semibold">Poupa {fmt(diff)}</p>
                    <p className="text-xs text-subtle">comprando no {min.storeName}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {sorted.map(s => (
                    <div key={s.storeName} className={clsx("flex items-center justify-between px-3 py-2 rounded-xl text-sm", s.storeName === min.storeName ? "bg-amber-soft border border-line" : "bg-surface-muted")}>
                      <span className="font-medium text-ink">{s.storeName}</span>
                      <div className="flex items-center gap-2">
                        <span className={clsx("font-bold", s.storeName === min.storeName ? "text-amber-ink" : "text-red-500")}>{fmt(s.price)}</span>
                        {s.storeName === min.storeName && <span className="text-xs bg-primary text-on-primary px-1.5 py-0.5 rounded-full">Mais barato</span>}
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
            <div className="bg-surface rounded-2xl border border-line p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📊</p>
              <p className="font-semibold text-ink">Nenhuma compra registada ainda</p>
            </div>
          ) : (
            <div className="bg-surface rounded-2xl border border-line shadow-sm p-5">
              <h3 className="font-semibold text-ink mb-4">Onde gastas mais</h3>
              <div className="space-y-4">
                {spend.map((s, i) => {
                  const totalAll = spend.reduce((acc, x) => acc + x.total, 0);
                  const pct = totalAll > 0 ? Math.round(s.total / totalAll * 100) : 0;
                  return (
                    <div key={s.storeId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
                          <span className="font-medium text-ink">{s.storeName}</span>
                          <span className="text-xs text-subtle">{s.visits} visitas</span>
                        </div>
                        <span className="font-bold text-ink">{fmt(s.total)}</span>
                      </div>
                      <div className="h-2 bg-surface-muted rounded-full">
                        <div className="h-2 bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-subtle mt-0.5 text-right">{pct}% do total</p>
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
          <p className="text-xs text-subtle">O Catálogo não é a lista de compras. É a memória dos produtos que já compraste e serve para organizar o histórico e comparar preços entre mercados.</p>
          {products.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-line p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📦</p>
              <p className="font-semibold text-ink">Nenhum produto registado ainda</p>
              <p className="text-sm text-subtle mt-1">Aparece aqui conforme registas compras</p>
            </div>
          ) : (
            <div className="bg-surface rounded-2xl border border-line shadow-sm divide-y divide-slate-50">
              {products.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span>{CAT_ICON[p.category] || "📦"}</span>
                  <span className="text-sm text-ink flex-1">{p.name}</span>
                  <span className="text-xs text-subtle">{CATEGORY_LABEL[p.category] || p.category}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {templatePicker && (
        <GroceryTemplatePicker
          templateKey={templatePicker.key}
          templateLabel={templatePicker.label}
          existingNames={list.map(item => item.name)}
          locale="pt-PT"
          onClose={() => setTemplatePicker(null)}
          onAdded={() => {
            setTemplatePicker(null);
            loadList(listFilter);
            loadOverview();
          }}
        />
      )}

      {/* Modal: adicionar item */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-ink mb-4">+ Adicionar à lista</h3>
            <form onSubmit={addItem} className="space-y-3">
              <input value={newItem.name} onChange={e => setNewItem(f => ({ ...f, name: e.target.value }))} required
                placeholder="Nome do produto" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <select value={newItem.category} onChange={e => setNewItem(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none bg-surface">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{CAT_ICON[c.value]} {c.label}</option>)}
              </select>
              <input value={newItem.quantity} onChange={e => setNewItem(f => ({ ...f, quantity: e.target.value }))}
                placeholder="Quantidade (ex: 2 kg, 1 caixa)" className="w-full border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddItem(false)} className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                <button type="submit" className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-hover transition">Adicionar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: finalizar compra a partir da lista marcada */}
      {showFinish && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-ink mb-1">✅ Finalizar compra</h3>
            <p className="text-xs text-subtle mb-4">Fecha os {checkedCount} itens marcados como uma compra, lança em Finanças e limpa a lista. Coloca o preço de cada item para entrar certo na comparação de preços.</p>
            <form onSubmit={finishFromChecked} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input value={finishForm.storeName} onChange={e => setFinishForm(f => ({ ...f, storeName: e.target.value }))} required
                  placeholder="Nome do mercado" className="border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
                <input type="date" value={finishForm.date} onChange={e => setFinishForm(f => ({ ...f, date: e.target.value }))}
                  className="border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">Preço de cada item</p>
                {list.filter(i => i.checked).map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className="text-sm text-ink flex-1 truncate">{item.name} <span className="text-subtle">({item.quantity})</span></span>
                    <input type="number" step="0.01" min="0" required
                      value={finishPrices[item.id] ?? ""}
                      onChange={e => setFinishPrices(p => ({ ...p, [item.id]: e.target.value }))}
                      placeholder="€" className="w-24 border border-line rounded-xl px-3 py-1.5 text-sm outline-none" />
                  </div>
                ))}
              </div>

              <div className="text-right text-sm font-semibold text-ink pt-1 border-t border-line">
                Total: {fmt(finishTotal)}
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowFinish(false)} className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                <button type="submit" disabled={finishing || !finishAllFilled} className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50">{finishing ? "..." : "Finalizar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: registrar compra */}
      {showAddPurchase && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-ink mb-4">🧾 Registar Compra</h3>
            <form onSubmit={addPurchase} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <input value={purchaseForm.storeName} onChange={e => setPurchaseForm(f => ({ ...f, storeName: e.target.value }))} required
                  placeholder="Nome do mercado" className="border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
                <input type="date" value={purchaseForm.date} onChange={e => setPurchaseForm(f => ({ ...f, date: e.target.value }))}
                  className="border border-line rounded-xl px-4 py-2.5 text-sm outline-none" />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">Itens comprados</p>
                {purchaseForm.items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start">
                    <input value={item.productName} onChange={e => { const its = [...purchaseForm.items]; its[i] = { ...its[i], productName: e.target.value }; setPurchaseForm(f => ({ ...f, items: its })); }}
                      placeholder="Produto" className="col-span-12 sm:col-span-4 w-full border border-line rounded-xl px-3 py-2 text-xs outline-none" />
                    <select value={item.category} onChange={e => { const its = [...purchaseForm.items]; its[i] = { ...its[i], category: e.target.value }; setPurchaseForm(f => ({ ...f, items: its })); }}
                      className="col-span-6 sm:col-span-3 w-full border border-line rounded-xl px-2 py-2 text-xs outline-none bg-surface">
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <input type="number" step="0.01" value={item.price} onChange={e => { const its = [...purchaseForm.items]; its[i] = { ...its[i], price: e.target.value }; setPurchaseForm(f => ({ ...f, items: its })); }}
                      placeholder="€" className="col-span-3 sm:col-span-2 w-full border border-line rounded-xl px-2 py-2 text-xs outline-none" />
                    <input type="number" value={item.quantity} onChange={e => { const its = [...purchaseForm.items]; its[i] = { ...its[i], quantity: e.target.value }; setPurchaseForm(f => ({ ...f, items: its })); }}
                      placeholder="Qtd" className="col-span-2 w-full border border-line rounded-xl px-2 py-2 text-xs outline-none" />
                    <button type="button" onClick={() => setPurchaseForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                      className="col-span-1 text-red-400 hover:text-red-ink text-sm py-2">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setPurchaseForm(f => ({ ...f, items: [...f.items, { productName: "", category: "Mercearia", price: "", quantity: "1", unit: "und" }] }))}
                  className="text-xs text-amber-ink hover:underline font-medium">+ Adicionar produto</button>
              </div>

              <div className="text-right text-sm font-semibold text-ink">
                Total: {fmt(purchaseForm.items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.quantity) || 1), 0))}
              </div>

              {purchaseError && (
                <div className="bg-red-soft border border-line rounded-xl p-3 text-xs text-red-ink">{purchaseError}</div>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowAddPurchase(false); setPurchaseError(null); }} className="flex-1 border border-line rounded-xl py-2.5 text-sm text-muted hover:bg-surface-muted transition">Cancelar</button>
                <button type="submit" disabled={savingPurchase} className="flex-1 bg-primary text-on-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary-hover transition disabled:opacity-50">{savingPurchase ? "..." : "Registar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
