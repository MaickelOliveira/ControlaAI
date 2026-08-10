import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";
import { addFinance } from "./finances";

export const GROCERY_CATEGORIES = [
  "Mercearia",      // arroz, feijão, óleo, açúcar, macarrão...
  "Carnes",         // carne, frango, peixe, linguiça...
  "Hortifruti",     // frutas, legumes, verduras
  "Laticínios",     // leite, queijo, iogurte, manteiga
  "Padaria",        // pão, bolacha, biscoito
  "Bebidas",        // suco, refrigerante, água
  "Limpeza",        // detergente, sabão, desinfetante...
  "Higiene",        // shampoo, sabonete, pasta de dente
  "Outros",
] as const;

export type GroceryCategory = typeof GROCERY_CATEGORIES[number];

export type GroceryStore = { id: string; userId: string; name: string; location: string };

export type GroceryProduct = {
  id: string;
  userId: string;
  name: string;
  category: GroceryCategory;
  defaultUnit: string;
};

export type GroceryPurchaseItem = {
  productName: string;
  category: GroceryCategory;
  price: number;
  quantity: number;
  unit: string;
  productId?: string;
  priceEstimated?: boolean;
};

export type GroceryPurchase = {
  id: string;
  userId: string;
  storeId: string;
  storeName: string;
  date: string;
  items: GroceryPurchaseItem[];
  total: number;
  createdAt: string;
  source?: string;
  financeId?: string;
};

export type ShoppingListItem = {
  id: string;
  userId: string;
  name: string;
  category: GroceryCategory;
  quantity: string;
  checked: boolean;
};

// ── Normalização de nome de produto — PRECISA bater exatamente com a
//    fórmula usada na migration SQL (20260810080000), senão produtos
//    migrados do histórico antigo param de casar com itens novos vindos do
//    bot, gerando duplicata silenciosa no catálogo. NFD + remoção de marcas
//    de acentuação produz o mesmo resultado do translate() explícito usado
//    no SQL para os caracteres portugueses comuns (á-ü, ç). ──
function normalizeProductName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Remove sufixos comuns de tamanho/unidade pra gerar uma chave-base de
// comparação (ex: "Arroz 5kg" e "arroz 1kg" caem na mesma base "arroz") —
// só usada pra achar candidatos de fuzzy match, nunca pro nome gravado.
function baseKey(normalized: string): string {
  return normalized.replace(/\s+\d+([.,]\d+)?\s*(kg|g|ml|l|un|und|dz|pct|cx)\.?$/i, "").trim();
}

// Similaridade simples por sobreposição de tokens (0 a 1) — suficiente pra
// decidir "é o mesmo produto" num catálogo pequeno por usuário, sem precisar
// de uma lib de distância de edição.
function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

type StoreRow = { id: string; user_id: string; name: string; location: string };
function storeFromRow(r: StoreRow): GroceryStore {
  return { id: r.id, userId: r.user_id, name: r.name, location: r.location };
}

type ProductRow = { id: string; user_id: string; name: string; normalized_name: string; category: string; default_unit: string };
function productFromRow(r: ProductRow): GroceryProduct {
  return { id: r.id, userId: r.user_id, name: r.name, category: r.category as GroceryCategory, defaultUnit: r.default_unit };
}

// ── Stores ──────────────────────────────
export async function getStoresByUser(userId: string): Promise<GroceryStore[]> {
  const { data, error } = await getSupabase().from("grocery_stores").select("*").eq("user_id", userId).order("name");
  if (error || !data) return [];
  return (data as StoreRow[]).map(storeFromRow);
}

export async function addStore(userId: string, name: string, location = ""): Promise<GroceryStore> {
  const { data: existing } = await getSupabase().from("grocery_stores").select("*")
    .eq("user_id", userId).ilike("name", name).maybeSingle();
  if (existing) return storeFromRow(existing as StoreRow);
  const { data, error } = await getSupabase().from("grocery_stores")
    .insert({ id: randomUUID(), user_id: userId, name, location }).select("*").single();
  if (error) throw new Error(`[grocery] addStore falhou: ${error.message}`);
  return storeFromRow(data as StoreRow);
}

export async function findOrCreateStore(userId: string, name: string): Promise<GroceryStore> {
  const { data } = await getSupabase().from("grocery_stores").select("*")
    .eq("user_id", userId).ilike("name", `%${name}%`).limit(1).maybeSingle();
  if (data) return storeFromRow(data as StoreRow);
  return addStore(userId, name);
}

// ── Catálogo de produtos ──────────────────
/** Acha um produto já cadastrado que combina com rawName, ou cadastra um
 *  novo — ponto único de entrada, chamado sempre que um item de compra é
 *  gravado (foto de cupom ou texto), garantindo que o catálogo cresça
 *  sozinho sem duplicar "Arroz" e "arroz 5kg" como produtos diferentes.
 *  Threshold conservador (0.6): prioriza NÃO fundir produtos diferentes
 *  por engano em vez de evitar toda duplicata parecida. */
export async function findOrCreateProduct(
  userId: string, rawName: string, category: GroceryCategory = "Outros", unit = "un"
): Promise<GroceryProduct> {
  const normalized = normalizeProductName(rawName);
  const base = baseKey(normalized);

  const { data: exact } = await getSupabase().from("grocery_products").select("*")
    .eq("user_id", userId).eq("normalized_name", normalized).maybeSingle();
  if (exact) return productFromRow(exact as ProductRow);

  const { data: candidates } = await getSupabase().from("grocery_products").select("*")
    .eq("user_id", userId).ilike("normalized_name", `%${base}%`);
  let best: ProductRow | null = null;
  let bestScore = 0;
  for (const c of (candidates as ProductRow[] | null) ?? []) {
    const score = tokenSimilarity(normalized, c.normalized_name);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (best && bestScore >= 0.6) return productFromRow(best);

  const { data: created, error } = await getSupabase().from("grocery_products")
    .insert({ id: randomUUID(), user_id: userId, name: rawName, normalized_name: normalized, category, default_unit: unit })
    .select("*").single();
  if (error) throw new Error(`[grocery] findOrCreateProduct falhou: ${error.message}`);
  return productFromRow(created as ProductRow);
}

export async function getProductsByUser(userId: string): Promise<GroceryProduct[]> {
  const { data, error } = await getSupabase().from("grocery_products").select("*").eq("user_id", userId).order("name");
  if (error || !data) return [];
  return (data as ProductRow[]).map(productFromRow);
}

// ── Purchases ────────────────────────────
type PurchaseRow = { id: string; user_id: string; store_id: string; date: string; total: string | number; source: string; finance_id: string | null; created_at: string; grocery_stores?: { name: string } | null };
type ItemRow = { id: string; purchase_id: string; product_id: string | null; product_name: string; category: string; price: string | number; quantity: string | number; unit: string; price_estimated: boolean };

export async function getPurchasesByUser(userId: string, limit = 100): Promise<GroceryPurchase[]> {
  const { data: purchases, error } = await getSupabase().from("grocery_purchases")
    .select("*, grocery_stores(name)").eq("user_id", userId).order("date", { ascending: false }).limit(limit);
  if (error || !purchases?.length) return [];
  const rows = purchases as PurchaseRow[];
  const ids = rows.map(r => r.id);
  const { data: items } = await getSupabase().from("grocery_purchase_items").select("*").in("purchase_id", ids);
  const itemsByPurchase = new Map<string, GroceryPurchaseItem[]>();
  for (const it of (items as ItemRow[] | null) ?? []) {
    const list = itemsByPurchase.get(it.purchase_id) ?? [];
    list.push({
      productName: it.product_name, category: it.category as GroceryCategory,
      price: Number(it.price), quantity: Number(it.quantity), unit: it.unit,
      productId: it.product_id ?? undefined, priceEstimated: it.price_estimated,
    });
    itemsByPurchase.set(it.purchase_id, list);
  }
  return rows.map(r => ({
    id: r.id, userId: r.user_id, storeId: r.store_id, storeName: r.grocery_stores?.name ?? "Mercado",
    date: r.date, items: itemsByPurchase.get(r.id) ?? [], total: Number(r.total),
    createdAt: r.created_at, source: r.source, financeId: r.finance_id ?? undefined,
  }));
}

/** Único ponto de gravação de itens de compra — cada item passa por
 *  findOrCreateProduct antes de inserir, então tanto o fluxo de foto quanto
 *  o de texto (slot-filling) ganham cadastro automático de catálogo sem
 *  duplicar lógica. */
export async function addPurchase(
  data: Omit<GroceryPurchase, "id" | "createdAt"> & { source?: string; financeId?: string }
): Promise<GroceryPurchase> {
  const { data: inserted, error } = await getSupabase().from("grocery_purchases").insert({
    id: randomUUID(), user_id: data.userId, store_id: data.storeId, date: data.date,
    total: data.total, source: data.source ?? "manual", finance_id: data.financeId ?? null,
  }).select("*").single();
  if (error) throw new Error(`[grocery] addPurchase falhou: ${error.message}`);
  const purchaseId = (inserted as { id: string }).id;

  const itemRows = [];
  for (const item of data.items) {
    const product = await findOrCreateProduct(data.userId, item.productName, item.category, item.unit);
    itemRows.push({
      id: randomUUID(), purchase_id: purchaseId, product_id: product.id,
      product_name: item.productName, category: item.category, price: item.price,
      quantity: item.quantity, unit: item.unit, price_estimated: item.priceEstimated ?? false,
    });
  }
  if (itemRows.length) {
    const { error: itemsError } = await getSupabase().from("grocery_purchase_items").insert(itemRows);
    if (itemsError) throw new Error(`[grocery] addPurchase (items) falhou: ${itemsError.message}`);
  }

  return {
    id: purchaseId, userId: data.userId, storeId: data.storeId, storeName: data.storeName,
    date: data.date, items: data.items, total: data.total, createdAt: new Date().toISOString(),
    source: data.source, financeId: data.financeId,
  };
}

export async function setPurchaseFinanceId(purchaseId: string, userId: string, financeId: string): Promise<void> {
  await getSupabase().from("grocery_purchases").update({ finance_id: financeId }).eq("id", purchaseId).eq("user_id", userId);
}

// ── Analytics ────────────────────────────
export async function getSpendByStore(userId: string): Promise<Array<{ storeId: string; storeName: string; total: number; visits: number }>> {
  const { data, error } = await getSupabase().from("grocery_purchases")
    .select("store_id, total, grocery_stores(name)").eq("user_id", userId);
  if (error || !data) return [];
  const map = new Map<string, { storeName: string; total: number; visits: number }>();
  for (const row of data as unknown as Array<{ store_id: string; total: string | number; grocery_stores?: { name: string } | null }>) {
    const cur = map.get(row.store_id) ?? { storeName: row.grocery_stores?.name ?? "Mercado", total: 0, visits: 0 };
    cur.total += Number(row.total);
    cur.visits += 1;
    map.set(row.store_id, cur);
  }
  return Array.from(map.entries()).map(([storeId, v]) => ({ storeId, ...v })).sort((a, b) => b.total - a.total);
}

/** Preço mais recente de cada produto por loja, ordenado do mais barato pro
 *  mais caro. Passe productName pra filtrar um item específico ("quanto
 *  pago no detergente"); omitido, devolve todos os produtos com preço em
 *  2+ lojas (comparação geral, usada pelo dashboard). Itens com preço
 *  estimado (rateio de "finalizar compra") são excluídos — não são preço
 *  real, poluiriam a comparação. */
export async function getPriceComparison(
  userId: string, productName?: string
): Promise<Array<{ productName: string; category: string; prices: Array<{ storeName: string; price: number; date: string }> }>> {
  let query = getSupabase().from("grocery_purchase_items")
    .select("product_name, category, price, price_estimated, grocery_purchases!inner(user_id, date, store_id, grocery_stores(name))")
    .eq("grocery_purchases.user_id", userId).eq("price_estimated", false);
  if (productName) query = query.ilike("product_name", `%${productName}%`);
  const { data, error } = await query;
  if (error || !data) return [];

  type Row = { product_name: string; category: string; price: string | number; grocery_purchases: { date: string; store_id: string; grocery_stores?: { name: string } | null } };
  const map = new Map<string, { category: string; prices: Map<string, { storeName: string; price: number; date: string }> }>();
  for (const row of data as unknown as Row[]) {
    const key = row.product_name.toLowerCase();
    const cur = map.get(key) ?? { category: row.category, prices: new Map() };
    const storeName = row.grocery_purchases.grocery_stores?.name ?? "Mercado";
    const date = row.grocery_purchases.date;
    const existing = cur.prices.get(storeName);
    if (!existing || date > existing.date) cur.prices.set(storeName, { storeName, price: Number(row.price), date });
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({ productName: name, category: v.category, prices: Array.from(v.prices.values()).sort((a, b) => a.price - b.price) }))
    .filter(p => p.prices.length > (productName ? 0 : 1))
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

/** Ranking de mercados do mais barato pro mais caro. Métrica principal:
 *  preço relativo médio (por produto comprado em 2+ mercados, cada loja
 *  ganha preço/menor_preço; a loja com média mais próxima de 1.0 é a mais
 *  barata). Sem itens em comum suficientes (usuário novo ou só compra em 1
 *  mercado), cai no fallback de ticket médio (getSpendByStore) — menos
 *  preciso, mas funciona sem histórico cruzado. */
export async function getStorePriceRanking(userId: string): Promise<{ ranking: Array<{ storeName: string; score: number }>; method: "relative_price" | "avg_ticket" }> {
  const comparison = await getPriceComparison(userId);
  const comparable = comparison.filter(p => p.prices.length > 1);
  if (comparable.length >= 2) {
    const ratios = new Map<string, number[]>();
    for (const item of comparable) {
      const min = Math.min(...item.prices.map(p => p.price));
      for (const p of item.prices) {
        const list = ratios.get(p.storeName) ?? [];
        list.push(p.price / min);
        ratios.set(p.storeName, list);
      }
    }
    const ranking = Array.from(ratios.entries())
      .map(([storeName, list]) => ({ storeName, score: list.reduce((s, v) => s + v, 0) / list.length }))
      .sort((a, b) => a.score - b.score);
    return { ranking, method: "relative_price" };
  }
  const spend = await getSpendByStore(userId);
  const ranking = spend
    .map(s => ({ storeName: s.storeName, score: s.visits ? s.total / s.visits : 0 }))
    .sort((a, b) => a.score - b.score);
  return { ranking, method: "avg_ticket" };
}

/** Itens mais comprados pelo usuário (opcionalmente filtrado por
 *  categorias), últimos ~180 dias — base da lista sugerida personalizada.
 *  Retorna vazio se não há histórico suficiente; o caller decide cair no
 *  fallback de LIST_TEMPLATES nesse caso. */
export async function getSuggestedListItems(
  userId: string, categories?: GroceryCategory[], limit = 15
): Promise<Array<{ productName: string; category: GroceryCategory }>> {
  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let query = getSupabase().from("grocery_purchase_items")
    .select("product_name, category, grocery_purchases!inner(user_id, date)")
    .eq("grocery_purchases.user_id", userId).gte("grocery_purchases.date", since);
  if (categories?.length) query = query.in("category", categories);
  const { data, error } = await query;
  if (error || !data?.length) return [];

  type Row = { product_name: string; category: string };
  const freq = new Map<string, { productName: string; category: GroceryCategory; count: number }>();
  for (const row of data as unknown as Row[]) {
    const key = row.product_name.toLowerCase();
    const cur = freq.get(key) ?? { productName: row.product_name, category: row.category as GroceryCategory, count: 0 };
    cur.count++;
    freq.set(key, cur);
  }
  return Array.from(freq.values()).sort((a, b) => b.count - a.count).slice(0, limit)
    .map(({ productName, category }) => ({ productName, category }));
}

// ── Shopping List ─────────────────────────
type ListRow = { id: string; user_id: string; name: string; category: string; quantity: string; checked: boolean };
function listItemFromRow(r: ListRow): ShoppingListItem {
  return { id: r.id, userId: r.user_id, name: r.name, category: r.category as GroceryCategory, quantity: r.quantity, checked: r.checked };
}

export async function getShoppingList(userId: string, category?: GroceryCategory): Promise<ShoppingListItem[]> {
  let query = getSupabase().from("grocery_shopping_list_items").select("*").eq("user_id", userId);
  if (category) query = query.eq("category", category);
  const { data, error } = await query.order("category");
  if (error || !data) return [];
  return (data as ListRow[]).map(listItemFromRow);
}

export async function getCheckedShoppingItems(userId: string): Promise<ShoppingListItem[]> {
  const { data, error } = await getSupabase().from("grocery_shopping_list_items")
    .select("*").eq("user_id", userId).eq("checked", true);
  if (error || !data) return [];
  return (data as ListRow[]).map(listItemFromRow);
}

export async function addToShoppingList(userId: string, name: string, category: GroceryCategory, quantity = "1"): Promise<ShoppingListItem> {
  const { data, error } = await getSupabase().from("grocery_shopping_list_items")
    .insert({ id: randomUUID(), user_id: userId, name, category, quantity, checked: false }).select("*").single();
  if (error) throw new Error(`[grocery] addToShoppingList falhou: ${error.message}`);
  return listItemFromRow(data as ListRow);
}

export async function toggleShoppingItem(id: string, userId: string): Promise<boolean> {
  const { data } = await getSupabase().from("grocery_shopping_list_items").select("checked").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) return false;
  const { error } = await getSupabase().from("grocery_shopping_list_items")
    .update({ checked: !(data as { checked: boolean }).checked }).eq("id", id).eq("user_id", userId);
  return !error;
}

export async function clearCheckedItems(userId: string): Promise<void> {
  await getSupabase().from("grocery_shopping_list_items").delete().eq("user_id", userId).eq("checked", true);
}

export async function removeShoppingItem(id: string, userId: string): Promise<void> {
  await getSupabase().from("grocery_shopping_list_items").delete().eq("id", id).eq("user_id", userId);
}

/** Converte uma chave de LIST_TEMPLATES (ex: "carnes") na categoria de
 *  exibição correspondente (ex: "Carnes") — usado quando a IA extrai
 *  categorias como chave de template, mas getSuggestedListItems precisa do
 *  nome de categoria real (como fica gravado em grocery_purchase_items). */
export function categoryForTemplateKey(key: string): GroceryCategory | undefined {
  return LIST_TEMPLATES[key]?.[0]?.category;
}

/** Popula a lista de compras a partir de um template pronto (ex: "mercearia")
 *  — usado pelo painel e pelo bot, pra não duplicar o loop nos dois lugares. */
export async function addFromTemplate(userId: string, templateKey: string): Promise<number> {
  const items = LIST_TEMPLATES[templateKey] ?? [];
  for (const item of items) await addToShoppingList(userId, item.name, item.category, item.quantity);
  return items.length;
}

/** Marca os itens já comprados (checked) como uma compra de fato: grava a
 *  compra + itens, lança a despesa correspondente em Finanças, linka os
 *  dois e limpa a lista marcada. Resolve a "vagueza" original — marcar
 *  itens na lista sem nunca virar uma compra registrada.
 *
 *  Preço: se itemPrices vier (painel, onde dá pra digitar item a item),
 *  usa o preço real de cada um (price_estimated: false — entra nas
 *  comparações de preço). Sem itemPrices (WhatsApp, onde só o total é
 *  perguntado por praticidade), rateia o total entre os itens
 *  (price_estimated: true — fica de fora das comparações de preço, já que
 *  não é o valor real de cada produto). */
export async function finalizePurchaseFromChecked(
  userId: string, mode: "personal" | "business", storeName: string, total: number, registeredBy: string,
  date?: string, itemPrices?: Record<string, number>, source = "whatsapp_quick"
): Promise<{ purchase: GroceryPurchase; financeId: string } | null> {
  const checked = await getCheckedShoppingItems(userId);
  if (!checked.length) return null;

  const store = await findOrCreateStore(userId, storeName);
  const hasRealPrices = !!itemPrices && checked.every(i => typeof itemPrices[i.id] === "number");
  const items: GroceryPurchaseItem[] = hasRealPrices
    ? checked.map(i => ({ productName: i.name, category: i.category, price: itemPrices![i.id], quantity: 1, unit: i.quantity, priceEstimated: false }))
    : checked.map(i => ({ productName: i.name, category: i.category, price: total / checked.length, quantity: 1, unit: i.quantity, priceEstimated: true }));
  const purchaseTotal = hasRealPrices ? items.reduce((s, i) => s + i.price, 0) : total;
  const purchaseDate = date || new Date().toISOString().slice(0, 10);

  const purchase = await addPurchase({
    userId, storeId: store.id, storeName: store.name, date: purchaseDate, items, total: purchaseTotal, source,
  });

  const finance = await addFinance({
    userId, type: "expense", amount: total, category: "Alimentação",
    description: `Compra no ${store.name}`, date: purchaseDate, mode, source: "whatsapp", registeredBy,
  });
  await setPurchaseFinanceId(purchase.id, userId, finance.id);
  await clearCheckedItems(userId);

  return { purchase: { ...purchase, financeId: finance.id }, financeId: finance.id };
}

// Templates pré-configurados de lista por categoria
export const LIST_TEMPLATES: Record<string, Array<{ name: string; category: GroceryCategory; quantity: string }>> = {
  mercearia: [
    { name: "Arroz", category: "Mercearia", quantity: "5 kg" },
    { name: "Feijão", category: "Mercearia", quantity: "1 kg" },
    { name: "Óleo de soja", category: "Mercearia", quantity: "900 ml" },
    { name: "Açúcar", category: "Mercearia", quantity: "1 kg" },
    { name: "Sal", category: "Mercearia", quantity: "1 kg" },
    { name: "Macarrão", category: "Mercearia", quantity: "500 g" },
    { name: "Farinha de trigo", category: "Mercearia", quantity: "1 kg" },
    { name: "Café", category: "Mercearia", quantity: "500 g" },
    { name: "Molho de tomate", category: "Mercearia", quantity: "2 und" },
    { name: "Vinagre", category: "Mercearia", quantity: "1 und" },
    { name: "Farofa pronta", category: "Mercearia", quantity: "500 g" },
    { name: "Azeite", category: "Mercearia", quantity: "500 ml" },
    { name: "Aveia", category: "Mercearia", quantity: "500 g" },
    { name: "Granola", category: "Mercearia", quantity: "500 g" },
  ],
  carnes: [
    { name: "Picanha", category: "Carnes", quantity: "1 kg" },
    { name: "Alcatra", category: "Carnes", quantity: "1 kg" },
    { name: "Contra-filé", category: "Carnes", quantity: "1 kg" },
    { name: "Coxão mole", category: "Carnes", quantity: "1 kg" },
    { name: "Patinho", category: "Carnes", quantity: "1 kg" },
    { name: "Fraldinha", category: "Carnes", quantity: "1 kg" },
    { name: "Costela bovina", category: "Carnes", quantity: "1 kg" },
    { name: "Cupim", category: "Carnes", quantity: "1 kg" },
    { name: "Maminha", category: "Carnes", quantity: "1 kg" },
    { name: "Filé mignon", category: "Carnes", quantity: "1 kg" },
    { name: "Carne moída", category: "Carnes", quantity: "500 g" },
    { name: "Frango inteiro", category: "Carnes", quantity: "1 kg" },
    { name: "Peito de frango", category: "Carnes", quantity: "1 kg" },
    { name: "Coxa e sobrecoxa", category: "Carnes", quantity: "1 kg" },
    { name: "Linguiça toscana", category: "Carnes", quantity: "500 g" },
    { name: "Linguiça calabresa", category: "Carnes", quantity: "500 g" },
    { name: "Bacon", category: "Carnes", quantity: "300 g" },
    { name: "Presunto", category: "Carnes", quantity: "200 g" },
    { name: "Costelinha suína", category: "Carnes", quantity: "1 kg" },
    { name: "Tilápia", category: "Carnes", quantity: "1 kg" },
    { name: "Camarão", category: "Carnes", quantity: "500 g" },
  ],
  hortifruti: [
    { name: "Banana", category: "Hortifruti", quantity: "1 dz" },
    { name: "Maçã", category: "Hortifruti", quantity: "1 kg" },
    { name: "Laranja", category: "Hortifruti", quantity: "1 kg" },
    { name: "Mamão", category: "Hortifruti", quantity: "1 und" },
    { name: "Abacate", category: "Hortifruti", quantity: "1 und" },
    { name: "Limão", category: "Hortifruti", quantity: "1 kg" },
    { name: "Tomate", category: "Hortifruti", quantity: "1 kg" },
    { name: "Cebola", category: "Hortifruti", quantity: "1 kg" },
    { name: "Alho", category: "Hortifruti", quantity: "1 und" },
    { name: "Batata", category: "Hortifruti", quantity: "1 kg" },
    { name: "Cenoura", category: "Hortifruti", quantity: "1 kg" },
    { name: "Alface", category: "Hortifruti", quantity: "1 und" },
    { name: "Pepino", category: "Hortifruti", quantity: "1 kg" },
    { name: "Pimentão", category: "Hortifruti", quantity: "1 kg" },
  ],
  laticinios: [
    { name: "Leite", category: "Laticínios", quantity: "1 lt" },
    { name: "Queijo mussarela", category: "Laticínios", quantity: "300 g" },
    { name: "Queijo prato", category: "Laticínios", quantity: "300 g" },
    { name: "Iogurte", category: "Laticínios", quantity: "4 und" },
    { name: "Manteiga", category: "Laticínios", quantity: "200 g" },
    { name: "Requeijão", category: "Laticínios", quantity: "1 und" },
    { name: "Creme de leite", category: "Laticínios", quantity: "2 und" },
    { name: "Leite condensado", category: "Laticínios", quantity: "1 und" },
  ],
  padaria: [
    { name: "Pão francês", category: "Padaria", quantity: "500 g" },
    { name: "Pão de forma", category: "Padaria", quantity: "1 und" },
    { name: "Pão de queijo", category: "Padaria", quantity: "500 g" },
    { name: "Bolacha recheada", category: "Padaria", quantity: "2 und" },
    { name: "Bolacha água e sal", category: "Padaria", quantity: "1 und" },
    { name: "Torrada", category: "Padaria", quantity: "1 und" },
  ],
  bebidas: [
    { name: "Água mineral", category: "Bebidas", quantity: "1 fardo" },
    { name: "Refrigerante", category: "Bebidas", quantity: "2 lt" },
    { name: "Suco", category: "Bebidas", quantity: "1 lt" },
    { name: "Cerveja", category: "Bebidas", quantity: "1 fardo" },
    { name: "Achocolatado", category: "Bebidas", quantity: "1 und" },
  ],
  higiene: [
    { name: "Sabonete", category: "Higiene", quantity: "3 und" },
    { name: "Shampoo", category: "Higiene", quantity: "1 und" },
    { name: "Condicionador", category: "Higiene", quantity: "1 und" },
    { name: "Pasta de dente", category: "Higiene", quantity: "2 und" },
    { name: "Papel higiênico", category: "Higiene", quantity: "1 fardo" },
    { name: "Fio dental", category: "Higiene", quantity: "1 und" },
    { name: "Desodorante", category: "Higiene", quantity: "1 und" },
  ],
  limpeza: [
    { name: "Detergente", category: "Limpeza", quantity: "2 und" },
    { name: "Sabão em pó", category: "Limpeza", quantity: "1 kg" },
    { name: "Água sanitária", category: "Limpeza", quantity: "1 lt" },
    { name: "Desinfetante", category: "Limpeza", quantity: "1 lt" },
    { name: "Amaciante", category: "Limpeza", quantity: "2 lt" },
    { name: "Esponja de louça", category: "Limpeza", quantity: "3 und" },
    { name: "Papel toalha", category: "Limpeza", quantity: "2 rolos" },
    { name: "Sabão em barra", category: "Limpeza", quantity: "4 und" },
    { name: "Saco de lixo", category: "Limpeza", quantity: "1 rolo" },
    { name: "Álcool", category: "Limpeza", quantity: "1 und" },
  ],
};
