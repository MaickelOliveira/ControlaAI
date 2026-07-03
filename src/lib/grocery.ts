import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

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

const FILE = path.join(process.cwd(), "data", "grocery.json");

function load(): GroceryData {
  try {
    if (!existsSync(FILE)) return { stores: [], purchases: [], shoppingList: [] };
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch { return { stores: [], purchases: [], shoppingList: [] }; }
}
function save(d: GroceryData) { writeFileSync(FILE, JSON.stringify(d, null, 2)); }

// ── Stores ──────────────────────────────
export function getStoresByUser(userId: string): GroceryStore[] {
  return load().stores.filter(s => s.userId === userId);
}

export function addStore(userId: string, name: string, location = ""): GroceryStore {
  const d = load();
  // Evita duplicata por nome
  const existing = d.stores.find(s => s.userId === userId && s.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const store: GroceryStore = { id: randomUUID(), userId, name, location };
  d.stores.push(store);
  save(d);
  return store;
}

export function findOrCreateStore(userId: string, name: string): GroceryStore {
  const d = load();
  const found = d.stores.find(s => s.userId === userId && s.name.toLowerCase().includes(name.toLowerCase()));
  if (found) return found;
  return addStore(userId, name);
}

// ── Purchases ────────────────────────────
export function getPurchasesByUser(userId: string): GroceryPurchase[] {
  return load().purchases.filter(p => p.userId === userId).sort((a, b) => b.date.localeCompare(a.date));
}

export function addPurchase(data: Omit<GroceryPurchase, "id" | "createdAt">): GroceryPurchase {
  const d = load();
  const p: GroceryPurchase = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
  d.purchases.push(p);
  save(d);
  return p;
}

// ── Analytics ────────────────────────────
export function getSpendByStore(userId: string): Array<{ storeId: string; storeName: string; total: number; visits: number }> {
  const purchases = getPurchasesByUser(userId);
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

export function getPriceComparison(userId: string): Array<{ productName: string; category: string; prices: Array<{ storeName: string; price: number; date: string }> }> {
  const purchases = getPurchasesByUser(userId);
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
export function getShoppingList(userId: string, category?: GroceryCategory): ShoppingListItem[] {
  return load().shoppingList
    .filter(i => i.userId === userId && (!category || i.category === category))
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function addToShoppingList(userId: string, name: string, category: GroceryCategory, quantity = "1"): ShoppingListItem {
  const d = load();
  const item: ShoppingListItem = { id: randomUUID(), userId, name, category, quantity, checked: false };
  d.shoppingList.push(item);
  save(d);
  return item;
}

export function toggleShoppingItem(id: string, userId: string): boolean {
  const d = load();
  const idx = d.shoppingList.findIndex(i => i.id === id && i.userId === userId);
  if (idx < 0) return false;
  d.shoppingList[idx].checked = !d.shoppingList[idx].checked;
  save(d);
  return true;
}

export function clearCheckedItems(userId: string) {
  const d = load();
  d.shoppingList = d.shoppingList.filter(i => !(i.userId === userId && i.checked));
  save(d);
}

export function removeShoppingItem(id: string, userId: string) {
  const d = load();
  d.shoppingList = d.shoppingList.filter(i => !(i.id === id && i.userId === userId));
  save(d);
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
  ],
  carnes: [
    { name: "Frango", category: "Carnes", quantity: "1 kg" },
    { name: "Carne moída", category: "Carnes", quantity: "500 g" },
    { name: "Linguiça", category: "Carnes", quantity: "500 g" },
    { name: "Presunto", category: "Carnes", quantity: "200 g" },
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
  ],
};
