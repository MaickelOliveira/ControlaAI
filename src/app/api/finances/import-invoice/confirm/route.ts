import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addFinances, deleteFinance, getBalance, getInvoiceDuplicateFlags, type Finance } from "@/lib/finances";
import { deleteAccount, resolveOrCreateInvoiceAccount } from "@/lib/accounts";
import { invoiceTransactionDescription, type InvoiceTransaction } from "@/lib/invoice-import";
import { upsertImportedInstallmentSchedules } from "@/lib/recurring";

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
  const dueDate = typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : undefined;
  const billingReferenceMonth = typeof body.billingReferenceMonth === "string" && /^\d{4}-\d{2}$/.test(body.billingReferenceMonth)
    ? body.billingReferenceMonth
    : undefined;

  const valid = items.filter(i =>
    i && typeof i.amount === "number" && i.amount > 0 &&
    typeof i.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(i.date) &&
    typeof i.description === "string" && typeof i.category === "string"
  );

  if (valid.length === 0) return NextResponse.json({ error: "Nenhum lançamento válido para importar" }, { status: 400 });

  // A prévia pode ficar aberta enquanto a IA registra a mesma compra pelo
  // WhatsApp. Confere novamente antes de criar conta/cartão ou qualquer gasto.
  const duplicateFlags = await getInvoiceDuplicateFlags(session.sub, mode, valid);
  if (duplicateFlags.some(Boolean)) return NextResponse.json({
    error: "Alguns lançamentos desta fatura já existem. Atualize a prévia e revise antes de confirmar.",
    duplicateIndexes: duplicateFlags.flatMap((duplicate, index) => duplicate ? [index] : []),
  }, { status: 409 });

  const account = await resolveOrCreateInvoiceAccount(session.sub, mode, bankName, {
    closingDay,
    dueDay,
    transactionDate: valid[0].date,
    billingReferenceMonth,
    dueDate,
  });

  let inserted: Finance[] = [];
  let installmentTracking = { created: 0, advanced: 0, completed: 0 };
  try {
    inserted = await addFinances(valid.map(item => ({
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
    installmentTracking = await upsertImportedInstallmentSchedules({
      userId: session.sub,
      mode,
      source: "web",
      items: valid,
      currentStatementDueDate: dueDate,
    });
  } catch (error) {
    await Promise.all(inserted.map(item => deleteFinance(item.id, session.sub).catch(rollbackError => {
      console.error("[import-invoice] falha ao desfazer lançamento:", rollbackError);
    })));
    if (account.created && account.accountId) {
      await deleteAccount(account.accountId, session.sub).catch(rollbackError => {
        console.error("[import-invoice] falha ao desfazer conta criada:", rollbackError);
      });
    }
    throw error;
  }

  const [balanceYear, balanceMonth] = valid[0].date.split("-").map(Number);
  const balance = await getBalance(session.sub, mode, balanceYear, balanceMonth);

  return NextResponse.json({
    imported: inserted.length,
    balance,
    balanceMonth: valid[0].date.slice(0, 7),
    importedFrom: valid.reduce((min, item) => item.date < min ? item.date : min, valid[0].date),
    importedTo: valid.reduce((max, item) => item.date > max ? item.date : max, valid[0].date),
    accountName: account.accountName,
    accountCreated: account.created === true,
    installmentTracking,
    dueDate,
    billingReferenceMonth,
  });
}
