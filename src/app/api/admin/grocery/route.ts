import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getStoresByUser, findOrCreateStore, addPurchase, getPurchasesByUser,
  getSpendByStore, getPriceComparison,
  getShoppingList, addToShoppingList, toggleShoppingItem,
  clearCheckedItems, removeShoppingItem, LIST_TEMPLATES, addFromTemplate,
  type GroceryCategory,
} from "@/lib/grocery";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") || "overview";
  const category = searchParams.get("category") as GroceryCategory | undefined;

  if (view === "stores") return NextResponse.json(await getStoresByUser(session.sub));
  if (view === "purchases") return NextResponse.json((await getPurchasesByUser(session.sub)).slice(0, 30));
  if (view === "spend") return NextResponse.json(await getSpendByStore(session.sub));
  if (view === "prices") return NextResponse.json(await getPriceComparison(session.sub));
  if (view === "list") return NextResponse.json(await getShoppingList(session.sub, category));
  if (view === "templates") return NextResponse.json(LIST_TEMPLATES);

  // overview
  const [purchases, spend, list, stores] = await Promise.all([
    getPurchasesByUser(session.sub),
    getSpendByStore(session.sub),
    getShoppingList(session.sub),
    getStoresByUser(session.sub),
  ]);
  return NextResponse.json({
    totalSpent: purchases.reduce((s, p) => s + p.total, 0),
    purchasesCount: purchases.length,
    storesCount: stores.length,
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
    const store = await findOrCreateStore(session.sub, storeName);
    const total = items.reduce((s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity, 0);
    const purchase = await addPurchase({ userId: session.sub, storeId: store.id, storeName: store.name, date: date || new Date().toISOString().slice(0, 10), items, total });
    return NextResponse.json(purchase, { status: 201 });
  }

  if (action === "list_add") {
    const { name, category, quantity } = body;
    const item = await addToShoppingList(session.sub, name, category, quantity);
    return NextResponse.json(item, { status: 201 });
  }

  if (action === "list_toggle") {
    await toggleShoppingItem(body.id, session.sub);
    return NextResponse.json({ ok: true });
  }

  if (action === "list_remove") {
    await removeShoppingItem(body.id, session.sub);
    return NextResponse.json({ ok: true });
  }

  if (action === "list_clear_checked") {
    await clearCheckedItems(session.sub);
    return NextResponse.json({ ok: true });
  }

  if (action === "list_from_template") {
    const added = await addFromTemplate(session.sub, body.template);
    return NextResponse.json({ ok: true, added });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
