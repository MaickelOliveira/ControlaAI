import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addFinances, getBalance } from "@/lib/finances";
import { resolveOrCreateInvoiceAccount } from "@/lib/accounts";
import { invoiceTransactionDescription, type InvoiceTransaction } from "@/lib/invoice-import";

type ImportItem = InvoiceTransaction;

/** Registra de fato os lançamentos da fatura que o usuário confirmou na prévia
 *  (/api/finances/import-invoice) — cada um vira uma despesa avulsa. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const mode = body.mode === "business" ? "business" : "personal";
  const items: ImportItem[] = Array.isArray(body.items) ? body.items : [];
  const bankName = typeof body.bankName === "string" ? body.bankName.trim() : undefined;
  const closingDay = Number.isInteger(body.closingDay) ? body.closingDay : undefined;
  const dueDay = Number.isInteger(body.dueDay) ? body.dueDay : undefined;

  const valid = items.filter(i =>
    i && typeof i.amount === "number" && i.amount > 0 &&
    typeof i.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.date) &&
    typeof i.description === "string" && typeof i.category === "string"
  );

  if (valid.length === 0) return NextResponse.json({ error: "Nenhum lançamento válido para importar" }, { status: 400 });

  const account = await resolveOrCreateInvoiceAccount(session.sub, mode, bankName, {
    closingDay,
    dueDay,
    transactionDate: valid[0].date,
  });

  const inserted = await addFinances(valid.map(item => ({
      userId: session.sub,
      type: "expense",
      amount: item.amount,
      category: item.category || "Outros",
      description: invoiceTransactionDescription(item),
      date: item.date,
      mode,
      source: "web",
      accountId: account.accountId,
      cardInvoiceId: account.cardInvoiceId,
  })));

  const now = new Date();
  const balance = await getBalance(session.sub, mode, now.getFullYear(), now.getMonth() + 1);

  return NextResponse.json({
    imported: inserted.length,
    balance,
    importedFrom: valid.reduce((min, item) => item.date < min ? item.date : min, valid[0].date),
    importedTo: valid.reduce((max, item) => item.date > max ? item.date : max, valid[0].date),
    accountName: account.accountName,
    accountCreated: account.created === true,
  });
}
