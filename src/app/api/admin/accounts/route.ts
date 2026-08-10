import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getAccountsByUser, createAccount, updateAccount, deleteAccount, setDefaultAccount,
  getInvoicesByAccount, getInvoiceTotal, markInvoicePaid, type AccountType,
} from "@/lib/accounts";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = (searchParams.get("mode") as "personal" | "business" | null) || undefined;
  const view = searchParams.get("view") || "list";

  if (view === "invoices") {
    const accountId = searchParams.get("accountId");
    if (!accountId) return NextResponse.json({ error: "accountId obrigatório" }, { status: 400 });
    const invoices = await getInvoicesByAccount(accountId);
    const withTotals = await Promise.all(invoices.map(async inv => ({ ...inv, total: await getInvoiceTotal(inv.id) })));
    return NextResponse.json(withTotals);
  }

  // list (padrão) — contas do modo, cada uma já com a fatura em aberto/atual resumida (se cartão)
  const accounts = await getAccountsByUser(session.sub, mode);
  const withInvoice = await Promise.all(accounts.map(async a => {
    if (a.type !== "credit_card") return { ...a, currentInvoice: null };
    const invoices = await getInvoicesByAccount(a.id);
    const open = invoices.find(i => i.status !== "paid") || null;
    const currentInvoice = open ? { ...open, total: await getInvoiceTotal(open.id) } : null;
    return { ...a, currentInvoice };
  }));
  return NextResponse.json(withInvoice);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { action, ...body } = await req.json();

  if (action === "create") {
    const { mode, name, type, creditLimit, closingDay, dueDay } = body as {
      mode: "personal" | "business"; name: string; type: AccountType; creditLimit?: number; closingDay?: number; dueDay?: number;
    };
    if (!mode || !name || !type) return NextResponse.json({ error: "mode, name e type obrigatórios" }, { status: 400 });
    if (type === "credit_card" && (!closingDay || !dueDay)) {
      return NextResponse.json({ error: "closingDay e dueDay obrigatórios para cartão de crédito" }, { status: 400 });
    }
    const account = await createAccount({ userId: session.sub, mode, name, type, creditLimit, closingDay, dueDay });
    return NextResponse.json(account, { status: 201 });
  }

  if (action === "update") {
    const { id, name, creditLimit, closingDay, dueDay } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    const account = await updateAccount(id, session.sub, { name, creditLimit, closingDay, dueDay });
    return account ? NextResponse.json(account) : NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  if (action === "delete") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    await deleteAccount(id, session.sub);
    return NextResponse.json({ ok: true });
  }

  if (action === "set_default") {
    const { id, mode } = body;
    if (!id || !mode) return NextResponse.json({ error: "id e mode obrigatórios" }, { status: 400 });
    const ok = await setDefaultAccount(session.sub, mode, id);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  if (action === "pay_invoice") {
    const { invoiceId } = body;
    if (!invoiceId) return NextResponse.json({ error: "invoiceId obrigatório" }, { status: 400 });
    const invoice = await markInvoicePaid(invoiceId, session.sub);
    return invoice ? NextResponse.json(invoice) : NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
