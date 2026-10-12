import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionWithUser } from "@/lib/auth";
import {
  getStoresByUser, findOrCreateStore, saveGroceryPurchase, getGroceryPurchase, deleteGroceryPurchase, getPurchasesByUser, getPurchasesInRange,
  getSpendByStore, getPriceComparison, getStorePriceRanking, getProductsByUser,
  getShoppingList, addToShoppingList, toggleShoppingItem,
  clearCheckedItems, removeShoppingItem, setShoppingItemsChecked, LIST_TEMPLATES, addFromTemplate,
  finalizePurchaseFromChecked,
  GROCERY_CATEGORIES, type GroceryCategory,
} from "@/lib/grocery";
import { validateGroceryPurchase } from "@/lib/grocery-validation";
import { isSameOrigin } from "@/lib/request-origin";
import { checkRateLimit } from "@/lib/rate-limit";
import { boundedFiscalRequest } from "@/lib/nfse-request";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") || "overview";
  const category = searchParams.get("category") as GroceryCategory | undefined;

  try {
  if (view === "stores") return NextResponse.json(await getStoresByUser(session.sub));
  if (view === "purchases") {
    const offset = Number(searchParams.get("offset") || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) return NextResponse.json({ error: "Página inválida." }, { status: 400 });
    return NextResponse.json(await getPurchasesByUser(session.sub, 100, offset), { headers: { "Cache-Control": "private, no-store" } });
  }
  if (view === "spend") return NextResponse.json(await getSpendByStore(session.sub));
  if (view === "prices") return NextResponse.json(await getPriceComparison(session.sub));
  if (view === "ranking") return NextResponse.json(await getStorePriceRanking(session.sub));
  if (view === "products") return NextResponse.json(await getProductsByUser(session.sub));
  if (view === "list") return NextResponse.json(await getShoppingList(session.sub, category));
  if (view === "templates") return NextResponse.json(LIST_TEMPLATES);

  // overview
  const [purchases, spend, list, stores] = await Promise.all([
    getPurchasesInRange(session.sub),
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
  } catch { return NextResponse.json({ error: "Não foi possível carregar os dados do supermercado. Tente novamente." }, { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}

export async function POST(req: NextRequest) {
  const auth = await getSessionWithUser();
  const session = auth?.session;
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (auth?.user.activeMode !== "personal") return NextResponse.json({ error: "Acesse o modo Pessoal para gerenciar o supermercado." }, { status: 403 });
  if (!isSameOrigin(req, process.env.OPEN_FINANCE_APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  if (!await checkRateLimit(`grocery:${session.sub}`, 60, 60_000)) return NextResponse.json({ error: "Aguarde um pouco antes de continuar." }, { status: 429 });
  let input: Record<string, unknown>;
  try { input = await (await boundedFiscalRequest(req, 100_000)).json(); if (!input || typeof input !== "object" || Array.isArray(input)) throw Error(); }
  catch { return NextResponse.json({ error: "Dados inválidos ou acima do tamanho permitido." }, { status: 400 }); }
  const { action, ...body } = input;
  try {

  if (action === "purchase" || action === "purchase_update") {
    const { storeName, date, items, total } = validateGroceryPurchase(body);
    const id = action === "purchase_update" && typeof body.id === "string" ? body.id : undefined;
    if (action === "purchase_update" && (!id || !await getGroceryPurchase(session.sub, id))) return NextResponse.json({ error: "Compra não encontrada." }, { status: 404 });
    const store = await findOrCreateStore(session.sub, storeName);
    const purchase = await saveGroceryPurchase({ userId: session.sub, storeId: store.id, storeName: store.name, date, items, total, source: "manual" }, { mode: "personal", source: "web", registeredBy: session.sub }, id, typeof body.operationKey === "string" && /^[0-9a-f-]{36}$/i.test(body.operationKey) ? { key: `web:${body.operationKey}` } : undefined);
    return NextResponse.json(purchase, { status: id ? 200 : 201 });
  }
  if (action === "purchase_delete") {
    if (typeof body.id !== "string" || body.confirm !== true) return NextResponse.json({ error: "Confirme a exclusão da compra e da despesa vinculada." }, { status: 400 });
    if (!await deleteGroceryPurchase(session.sub, body.id)) return NextResponse.json({ error: "Compra não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (action === "finish_from_checked") {
    const { storeName, total, date, itemPrices } = body as { storeName?: string; total?: number; date?: string; itemPrices?: Record<string, number> };
    if (!storeName || (!total && !itemPrices)) return NextResponse.json({ error: "storeName e total (ou preço por item) obrigatórios" }, { status: 400 });
    if (typeof body.operationKey !== "string" || !/^[0-9a-f-]{36}$/i.test(body.operationKey) || !Array.isArray(body.checkedIds) || !body.checkedIds.length || body.checkedIds.length > 200 || !body.checkedIds.every(id => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))) return NextResponse.json({ error: "Atualize a página e selecione os produtos da compra novamente." }, { status: 400 });
    const result = await finalizePurchaseFromChecked(
      session.sub, "personal", storeName, Number(total) || 0, session.sub, date || undefined, itemPrices || undefined, "web", { key: `web-list:${body.operationKey}`, checkedIds: body.checkedIds as string[] },
    );
    if (!result) return NextResponse.json({ error: "Nenhum item marcado na lista" }, { status: 400 });
    return NextResponse.json(result.purchase, { status: 201 });
  }

  if (action === "list_add") {
    const { name, category, quantity } = body as { name: string; category: GroceryCategory; quantity: string };
    const item = await addToShoppingList(session.sub, name, category, quantity);
    return NextResponse.json(item, { status: 201 });
  }

  if (action === "list_toggle") {
    await toggleShoppingItem(String(body.id), session.sub);
    return NextResponse.json({ ok: true });
  }

  if (action === "list_check_all") {
    const category = typeof body.category === "string" && (GROCERY_CATEGORIES as readonly string[]).includes(body.category)
      ? body.category as GroceryCategory
      : undefined;
    const changed = await setShoppingItemsChecked(session.sub, body.checked !== false, category);
    return NextResponse.json({ ok: true, changed });
  }

  if (action === "list_remove") {
    await removeShoppingItem(String(body.id), session.sub);
    return NextResponse.json({ ok: true });
  }

  if (action === "list_clear_checked") {
    await clearCheckedItems(session.sub);
    return NextResponse.json({ ok: true });
  }

  if (action === "list_from_template") {
    const selectedNames = Array.isArray(body.selectedNames)
      ? body.selectedNames.filter((name: unknown): name is string => typeof name === "string")
      : undefined;
    const added = await addFromTemplate(session.sub, String(body.template), selectedNames);
    return NextResponse.json({ ok: true, added });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Não foi possível concluir esta ação. Confira os dados e tente novamente." }, { status: 400 }); }
}
