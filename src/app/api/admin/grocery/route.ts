import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getStoresByUser, findOrCreateStore, addPurchase, getPurchasesByUser,
  getSpendByStore, getPriceComparison, getStorePriceRanking, getProductsByUser,
  getShoppingList, addToShoppingList, toggleShoppingItem,
  clearCheckedItems, removeShoppingItem, LIST_TEMPLATES, addFromTemplate,
  finalizePurchaseFromChecked, setPurchaseFinanceId,
  type GroceryCategory,
} from "@/lib/grocery";
import { addFinance } from "@/lib/finances";

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
  if (view === "ranking") return NextResponse.json(await getStorePriceRanking(session.sub));
  if (view === "products") return NextResponse.json(await getProductsByUser(session.sub));
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
    const { storeName, items, date, clearChecked } = body;
    if (!storeName || !items?.length) return NextResponse.json({ error: "storeName e items obrigatórios" }, { status: 400 });
    const store = await findOrCreateStore(session.sub, storeName);
    const total = items.reduce((s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity, 0);
    const purchaseDate = date || new Date().toISOString().slice(0, 10);
    const purchase = await addPurchase({ userId: session.sub, storeId: store.id, storeName: store.name, date: purchaseDate, items, total, source: "manual" });
    // Registrar uma compra sempre gerava o histórico do Supermercado, mas
    // nunca aparecia em Finanças — mesmo gap que existia no bot, corrigido
    // junto já que os dois passam por addPurchase.
    const finance = await addFinance({
      userId: session.sub, type: "expense", amount: total, category: "Alimentação",
      description: `Compra no ${store.name}`, date: purchaseDate, mode: "personal", source: "web", registeredBy: session.sub,
    });
    await setPurchaseFinanceId(purchase.id, session.sub, finance.id);
    if (clearChecked) await clearCheckedItems(session.sub);
    return NextResponse.json({ ...purchase, financeId: finance.id }, { status: 201 });
  }

  if (action === "finish_from_checked") {
    const { storeName, total, date } = body;
    if (!storeName || !total) return NextResponse.json({ error: "storeName e total obrigatórios" }, { status: 400 });
    const result = await finalizePurchaseFromChecked(session.sub, "personal", storeName, Number(total), session.sub, date || undefined);
    if (!result) return NextResponse.json({ error: "Nenhum item marcado na lista" }, { status: 400 });
    return NextResponse.json(result.purchase, { status: 201 });
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
