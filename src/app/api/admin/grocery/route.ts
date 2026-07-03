import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getStoresByUser, findOrCreateStore, addPurchase, getPurchasesByUser,
  getSpendByStore, getPriceComparison,
  getShoppingList, addToShoppingList, toggleShoppingItem,
  clearCheckedItems, removeShoppingItem, LIST_TEMPLATES,
  type GroceryCategory,
} from "@/lib/grocery";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") || "overview";
  const category = searchParams.get("category") as GroceryCategory | undefined;

  if (view === "stores") return NextResponse.json(getStoresByUser(session.sub));
  if (view === "purchases") return NextResponse.json(getPurchasesByUser(session.sub).slice(0, 30));
  if (view === "spend") return NextResponse.json(getSpendByStore(session.sub));
  if (view === "prices") return NextResponse.json(getPriceComparison(session.sub));
  if (view === "list") return NextResponse.json(getShoppingList(session.sub, category));
  if (view === "templates") return NextResponse.json(LIST_TEMPLATES);

  // overview
  const purchases = getPurchasesByUser(session.sub);
  const spend = getSpendByStore(session.sub);
  const list = getShoppingList(session.sub);
  return NextResponse.json({
    totalSpent: purchases.reduce((s, p) => s + p.total, 0),
    purchasesCount: purchases.length,
    storesCount: getStoresByUser(session.sub).length,
    topStore: spend[0] ?? null,
    recentPurchases: purchases.slice(0, 5),
    shoppingListCount: list.filter(i => !i.checked).length,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { action, ...body } = await req.json();

  if (action === "purchase") {
    const { storeName, items, date } = body;
    if (!storeName || !items?.length) return NextResponse.json({ error: "storeName e items obrigatórios" }, { status: 400 });
    const store = findOrCreateStore(session.sub, storeName);
    const total = items.reduce((s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity, 0);
    const purchase = addPurchase({ userId: session.sub, storeId: store.id, storeName: store.name, date: date || new Date().toISOString().slice(0, 10), items, total });
    return NextResponse.json(purchase, { status: 201 });
  }

  if (action === "list_add") {
    const { name, category, quantity } = body;
    const item = addToShoppingList(session.sub, name, category, quantity);
    return NextResponse.json(item, { status: 201 });
  }

  if (action === "list_toggle") {
    toggleShoppingItem(body.id, session.sub);
    return NextResponse.json({ ok: true });
  }

  if (action === "list_remove") {
    removeShoppingItem(body.id, session.sub);
    return NextResponse.json({ ok: true });
  }

  if (action === "list_clear_checked") {
    clearCheckedItems(session.sub);
    return NextResponse.json({ ok: true });
  }

  if (action === "list_from_template") {
    const { template } = body;
    const items = LIST_TEMPLATES[template] ?? [];
    for (const item of items) {
      addToShoppingList(session.sub, item.name, item.category, item.quantity);
    }
    return NextResponse.json({ ok: true, added: items.length });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
