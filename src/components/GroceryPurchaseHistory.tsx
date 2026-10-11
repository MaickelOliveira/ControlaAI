"use client";
import { useState, useEffect, useRef } from "react";
type Item = { productName: string; category: string; price: number; quantity: number; unit: string; priceEstimated?: boolean };
export type PurchaseHistoryRecord = { id: string; storeName: string; date: string; total: number; financeId?: string; items: Item[] };
const categories = ["Mercearia", "Carnes", "Hortifruti", "Laticínios", "Padaria", "Bebidas", "Limpeza", "Higiene", "Outros"];
const itemTotal = (items: Item[]) => items.reduce((sum, item) => sum + Math.round(item.price * item.quantity * 100), 0) / 100;
export function GroceryPurchaseHistory({ purchases, onChanged, locale = "pt-BR" }: { purchases: PurchaseHistoryRecord[]; onChanged: () => void; locale?: "pt-BR" | "pt-PT" | "es" }) {
 const es = locale === "es";
 const [editing, setEditing] = useState<PurchaseHistoryRecord | null>(null);
 const [removing, setRemoving] = useState<PurchaseHistoryRecord | null>(null);
 const [adjustment, setAdjustment] = useState("0");
 const [busy, setBusy] = useState(false), [error, setError] = useState("");
 const returnFocus = useRef<HTMLElement | null>(null);
 const modalOpen = !!editing || !!removing;
 useEffect(() => {
  if (!modalOpen) return;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => { document.body.style.overflow = previousOverflow; returnFocus.current?.focus(); };
 }, [modalOpen]);
 const fmt = (value: number) => value.toLocaleString(es ? "es-419" : locale, { style: "currency", currency: es ? "USD" : locale === "pt-BR" ? "BRL" : "EUR", ...(es ? { currencyDisplay: "narrowSymbol" as const } : {}) });
 const categoryLabel = (category: string) => es ? ({ Mercearia: "Abarrotes", Carnes: "Carnes", Hortifruti: "Frutas y verduras", Laticínios: "Lácteos", Padaria: "Panadería", Bebidas: "Bebidas", Limpeza: "Limpieza", Higiene: "Higiene", Outros: "Otros" } as Record<string, string>)[category] || category : locale === "pt-PT" && category === "Hortifruti" ? "Frutas e legumes" : category;
 const copy = (pt: string, spanish: string) => es ? spanish : pt;
 function openEditor(purchase: PurchaseHistoryRecord) {
  returnFocus.current = document.activeElement as HTMLElement;
  setEditing({ ...purchase, items: purchase.items.map(item => ({ ...item })) });
  setAdjustment((purchase.total - itemTotal(purchase.items)).toFixed(2)); setError("");
 }
 async function mutate(body: unknown) {
  setBusy(true); setError("");
  try {
   const response = await fetch("/api/admin/grocery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
   const result = await response.json();
   if (!response.ok) throw Error(result.error || copy("Não foi possível salvar.", "No se pudo guardar."));
   setEditing(null); setRemoving(null); onChanged();
  } catch (error) { setError(error instanceof Error ? error.message : copy("Confira sua conexão e tente novamente.", "Comprueba tu conexión e inténtalo de nuevo.")); }
  finally { setBusy(false); }
 }
 function updateItem(index: number, patch: Partial<Item>) {
  setEditing(current => current && { ...current, items: current.items.map((item, i) => i === index ? { ...item, ...patch } : item) });
 }
 return <div className="space-y-3">
  <p className="text-sm text-subtle">{copy("Abra uma compra para ver os produtos. As alterações também atualizam a despesa em Finanças.", "Abre una compra para ver sus artículos. Los cambios también actualizan el gasto en Finanzas.")}</p>
  {!purchases.length && <p className="rounded-2xl border border-line bg-surface p-10 text-center text-subtle">{copy("Nenhuma compra registrada", "No hay compras registradas")}</p>}
  {purchases.map(purchase => <article key={purchase.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0"><h3 className="break-words font-semibold text-ink">{purchase.storeName}</h3><p className="mt-1 text-xs text-subtle">{new Date(`${purchase.date}T12:00:00`).toLocaleDateString(locale)} · {purchase.items.length} {copy("produtos", "artículos")}</p></div>
    <strong className="text-lg text-ink">{fmt(purchase.total)}</strong>
   </div>
   <details className="mt-3 rounded-xl bg-surface-muted p-3"><summary className="cursor-pointer text-sm font-medium text-ink">{copy("Ver compra", "Ver compra")}</summary>
    <ul className="mt-3 divide-y divide-line">{purchase.items.map((item, index) => <li key={index} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><div className="min-w-0"><p className="break-words text-ink">{item.productName}</p><p className="text-xs text-subtle">{categoryLabel(item.category)} · {item.quantity} {item.unit}{item.priceEstimated ? ` · ${copy("valor estimado", "valor estimado")}` : ""}</p></div><span className="text-muted">{fmt(item.price)} × {item.quantity} · <strong className="text-ink">{fmt(item.price * item.quantity)}</strong></span></li>)}</ul>
    {Math.abs(purchase.total - itemTotal(purchase.items)) >= .005 && <p className="mt-2 text-xs text-subtle">{copy("Desconto/acréscimo no total", "Descuento/recargo en el total")}: {fmt(purchase.total - itemTotal(purchase.items))}</p>}
    <p className="mt-3 text-xs text-subtle">{purchase.financeId ? copy("Despesa vinculada em Finanças.", "Gasto vinculado en Finanzas.") : copy("Compra antiga: salvar a edição também cria sua despesa em Finanças.", "Compra antigua: guardar los cambios también crea su gasto en Finanzas.")}</p>
   </details>
   <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink" onClick={() => openEditor(purchase)}>{copy("Editar", "Editar")}</button><button className="rounded-lg px-3 py-2 text-sm font-medium text-red-ink" onClick={() => { returnFocus.current = document.activeElement as HTMLElement; setRemoving(purchase); setError(""); }}>{copy("Excluir", "Eliminar")}</button><a className="rounded-lg px-3 py-2 text-sm text-subtle" href={`${locale === "pt-PT" ? "/pt" : es ? "/es" : ""}/dashboard/financas?from=${purchase.date}&to=${purchase.date}`}>{copy("Ver em Finanças", "Ver en Finanzas")} →</a></div>
  </article>)}
  {(editing || removing) && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3" onKeyDown={event => {
    if (event.key === "Tab") {
     const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'));
     const first = focusable[0], last = focusable.at(-1);
     if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
     if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key === "Escape" && !busy) { setEditing(null); setRemoving(null); } }}>
   <section role="dialog" aria-modal="true" aria-labelledby="grocery-dialog-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-xl sm:p-6">
    <h2 id="grocery-dialog-title" className="text-lg font-bold text-ink">{editing ? copy("Editar compra", "Editar compra") : copy("Excluir compra", "Eliminar compra")}</h2>
    {editing && <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); void mutate({ action: "purchase_update", ...editing, adjustment: Number(adjustment) }); }}>
     <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-muted">{copy("Mercado", "Supermercado")}<input autoFocus required maxLength={120} value={editing.storeName} onChange={event => setEditing({ ...editing, storeName: event.target.value })} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink" /></label><label className="text-sm text-muted">{copy("Data da compra", "Fecha de compra")}<input required type="date" value={editing.date} onChange={event => setEditing({ ...editing, date: event.target.value })} className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink" /></label></div>
     <div className="space-y-3">{editing.items.map((item, index) => <fieldset key={index} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3 sm:grid-cols-6"><legend className="px-1 text-xs text-subtle">{copy("Produto", "Artículo")} {index + 1}</legend>
      <label className="col-span-2 text-xs text-muted">{copy("Nome", "Nombre")}<input required maxLength={160} value={item.productName} onChange={event => updateItem(index, { productName: event.target.value })} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-ink" /></label>
      <label className="col-span-2 text-xs text-muted">{copy("Categoria", "Categoría")}<select value={item.category} onChange={event => updateItem(index, { category: event.target.value })} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-ink">{categories.map(category => <option key={category} value={category}>{categoryLabel(category)}</option>)}</select></label>
      <label className="text-xs text-muted">{copy("Preço unitário", "Precio unitario")}<input required type="number" step="any" min="0" value={Number.isFinite(item.price) ? item.price : ""} onChange={event => updateItem(index, { price: event.target.value === "" ? NaN : Number(event.target.value), priceEstimated: false })} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-ink" /></label>
      <label className="text-xs text-muted">{copy("Quantidade", "Cantidad")}<input required type="number" step="any" min="0.000001" value={Number.isFinite(item.quantity) ? item.quantity : ""} onChange={event => updateItem(index, { quantity: event.target.value === "" ? NaN : Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-ink" /></label>
      <label className="text-xs text-muted">{copy("Unidade", "Unidad")}<input required maxLength={30} value={item.unit} onChange={event => updateItem(index, { unit: event.target.value })} className="mt-1 w-full rounded-lg border border-line bg-surface px-2 py-2 text-ink" /></label>
      <button type="button" className="self-end rounded-lg px-2 py-2 text-xs text-red-ink" onClick={() => setEditing({ ...editing, items: editing.items.filter((_, i) => i !== index) })}>{copy("Remover", "Quitar")}</button>
     </fieldset>)}</div>
     <button type="button" disabled={editing.items.length >= 200} className="text-sm font-medium text-amber-ink" onClick={() => setEditing({ ...editing, items: [...editing.items, { productName: "", category: "Outros", price: 0, quantity: 1, unit: "un" }] })}>+ {copy("Produto", "Artículo")}</button>
     <label className="block text-sm text-muted">{copy("Desconto ou acréscimo no total", "Descuento o recargo en el total")}<input type="number" step="0.01" value={adjustment} onChange={event => setAdjustment(event.target.value)} className="ml-2 max-w-32 rounded-lg border border-line bg-surface px-2 py-2 text-ink" /><span className="mt-1 block text-xs text-subtle">{copy("Desconto: valor negativo. Acréscimo: valor positivo.", "Descuento: valor negativo. Recargo: valor positivo.")}</span></label>
     <p className="text-right font-semibold text-ink">{copy("Total pago", "Total pagado")}: {fmt(itemTotal(editing.items) + Number(adjustment))}</p>
     {error && <p role="alert" className="rounded-xl bg-red-soft p-3 text-sm text-red-ink">{error}</p>}
     <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => setEditing(null)} className="flex-1 rounded-xl border border-line py-2.5 text-sm text-muted">{copy("Cancelar", "Cancelar")}</button><button disabled={busy || !editing.items.length} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-on-primary">{busy ? "…" : copy("Salvar alterações", "Guardar cambios")}</button></div>
    </form>}
    {removing && <div className="mt-4 space-y-4"><p className="break-words text-sm text-muted">{copy("Excluir a compra no", "Eliminar la compra en")} <strong className="text-ink">{removing.storeName}</strong> · {fmt(removing.total)}?</p><p className="text-sm text-muted">{copy("Os produtos desta compra e a despesa vinculada em Finanças serão excluídos. Esta ação não pode ser desfeita.", "Se eliminarán los artículos de esta compra y el gasto vinculado en Finanzas. Esta acción no se puede deshacer.")}</p>{error && <p role="alert" className="text-sm text-red-ink">{error}</p>}<div className="flex gap-2"><button autoFocus disabled={busy} onClick={() => setRemoving(null)} className="flex-1 rounded-xl border border-line py-2.5 text-sm text-muted">{copy("Cancelar", "Cancelar")}</button><button disabled={busy} onClick={() => void mutate({ action: "purchase_delete", id: removing.id, confirm: true })} className="flex-1 rounded-xl bg-red-soft py-2.5 text-sm font-semibold text-red-ink">{busy ? "…" : copy("Excluir compra", "Eliminar compra")}</button></div></div>}
   </section>
  </div>}
 </div>;
}
