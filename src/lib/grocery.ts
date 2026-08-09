import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

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

export type GroceryPurchaseItem = {
  productName: string;
  category: GroceryCategory;
  price: number;
  quantity: number;
  unit: string;
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
};

export type ShoppingListItem = {
  id: string;
  userId: string;
  name: string;
  category: GroceryCategory;
  quantity: string;
  checked: boolean;
};

type GroceryData = {
  stores: GroceryStore[];
  purchases: GroceryPurchase[];
  shoppingList: ShoppingListItem[];
};

// grocery.json original era um blob ÚNICO com todos os usuários (cada item
// carrega seu próprio userId) — mantém a mesma forma numa linha só da
// tabela, evitando reescrever a lógica de filtro já existente.
async function load(): Promise<GroceryData> {
  const { data, error } = await getSupabase().from("grocery").select("data").eq("id", 1).maybeSingle();
  if (error || !data) return { stores: [], purchases: [], shoppingList: [] };
  return (data as { data: GroceryData }).data;
}
async function save(d: GroceryData) {
  await getSupabase().from("grocery").upsert({ id: 1, data: d });
}

// ── Stores ──────────────────────────────
export async function getStoresByUser(userId: string): Promise<GroceryStore[]> {
  return (await load()).stores.filter(s => s.userId === userId);
}

export async function addStore(userId: string, name: string, location = ""): Promise<GroceryStore> {
  const d = await load();
  // Evita duplicata por nome
  const existing = d.stores.find(s => s.userId === userId && s.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const store: GroceryStore = { id: randomUUID(), userId, name, location };
  d.stores.push(store);
  await save(d);
  return store;
}

export async function findOrCreateStore(userId: string, name: string): Promise<GroceryStore> {
  const d = await load();
  const found = d.stores.find(s => s.userId === userId && s.name.toLowerCase().includes(name.toLowerCase()));
  if (found) return found;
  return addStore(userId, name);
}

// ── Purchases ────────────────────────────
export async function getPurchasesByUser(userId: string): Promise<GroceryPurchase[]> {
  return (await load()).purchases.filter(p => p.userId === userId).sort((a, b) => b.date.localeCompare(a.date));
}

export async function addPurchase(data: Omit<GroceryPurchase, "id" | "createdAt">): Promise<GroceryPurchase> {
  const d = await load();
  const p: GroceryPurchase = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  d.purchases.push(p);
  await save(d);
  return p;
}

// ── Analytics ────────────────────────────
export async function getSpendByStore(userId: string): Promise<Array<{ storeId: string; storeName: string; total: number; visits: number }>> {
  const purchases = await getPurchasesByUser(userId);
  const map = new Map<string, { storeName: string; total: number; visits: number }>();
  for (const p of purchases) {
    const cur = map.get(p.storeId) ?? { storeName: p.storeName, total: 0, visits: 0 };
    cur.total += p.total;
    cur.visits += 1;
    map.set(p.storeId, cur);
  }
  return Array.from(map.entries())
    .map(([storeId, v]) => ({ storeId, ...v }))
    .sort((a, b) => b.total - a.total);
}

export async function getPriceComparison(userId: string): Promise<Array<{ productName: string; category: string; prices: Array<{ storeName: string; price: number; date: string }> }>> {
  const purchases = await getPurchasesByUser(userId);
  const map = new Map<string, { category: string; prices: Array<{ storeName: string; price: number; date: string }> }>();
  for (const p of purchases) {
    for (const item of p.items) {
      const key = item.productName.toLowerCase();
      const cur = map.get(key) ?? { category: item.category, prices: [] };
      const existing = cur.prices.find(x => x.storeName === p.storeName);
      if (existing) {
        if (p.date > existing.date) { existing.price = item.price; existing.date = p.date; }
      } else {
        cur.prices.push({ storeName: p.storeName, price: item.price, date: p.date });
      }
      map.set(key, cur);
    }
  }
  return Array.from(map.entries())
    .map(([productName, v]) => ({ productName, ...v }))
    .filter(p => p.prices.length > 1)
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

// ── Shopping List ─────────────────────────
export async function getShoppingList(userId: string, category?: GroceryCategory): Promise<ShoppingListItem[]> {
  return (await load()).shoppingList
    .filter(i => i.userId === userId && (!category || i.category === category))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export async function addToShoppingList(userId: string, name: string, category: GroceryCategory, quantity = "1"): Promise<ShoppingListItem> {
  const d = await load();
  const item: ShoppingListItem = { id: randomUUID(), userId, name, category, quantity, checked: false };
  d.shoppingList.push(item);
  await save(d);
  return item;
}

export async function toggleShoppingItem(id: string, userId: string): Promise<boolean> {
  const d = await load();
  const idx = d.shoppingList.findIndex(i => i.id === id && i.userId === userId);
  if (idx < 0) return false;
  d.shoppingList[idx].checked = !d.shoppingList[idx].checked;
  await save(d);
  return true;
}

export async function clearCheckedItems(userId: string) {
  const d = await load();
  d.shoppingList = d.shoppingList.filter(i => !(i.userId === userId && i.checked));
  await save(d);
}

export async function removeShoppingItem(id: string, userId: string) {
  const d = await load();
  d.shoppingList = d.shoppingList.filter(i => !(i.id === id && i.userId === userId));
  await save(d);
}

/** Popula a lista de compras a partir de um template pronto (ex: "mercearia")
 *  — usado pelo painel e pelo bot, pra não duplicar o loop nos dois lugares. */
export async function addFromTemplate(userId: string, templateKey: string): Promise<number> {
  const items = LIST_TEMPLATES[templateKey] ?? [];
  for (const item of items) await addToShoppingList(userId, item.name, item.category, item.quantity);
  return items.length;
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
