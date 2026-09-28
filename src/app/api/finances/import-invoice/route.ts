import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { extractInvoiceTransactions } from "@/lib/ai-processor";
import { getInvoiceDuplicateFlags } from "@/lib/finances";
import { isProbableRepeatedInvoice } from "@/lib/invoice-import";
import { MAX_UPLOAD_BYTES, tooLarge, contentLengthTooLarge } from "@/lib/upload-limits";

/** Analisa uma fatura/extrato enviado pelo dashboard e retorna a lista de lançamentos
 *  encontrados (com sinalização de possível duplicado) — não salva nada ainda, é só
 *  a prévia. A confirmação/importação de fato é feita em /import-invoice/confirm. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (contentLengthTooLarge(req)) return NextResponse.json({ error: `Arquivo muito grande — máximo ${MAX_UPLOAD_BYTES / 1024 / 1024}MB` }, { status: 413 });

  const formData = await req.formData();
  const fileObj = formData.get("file") as File | null;
  const mode = (formData.get("mode") as string) === "business" ? "business" : "personal";
  if (!fileObj) return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 });
  if (tooLarge(fileObj.size)) return NextResponse.json({ error: `Arquivo muito grande — máximo ${MAX_UPLOAD_BYTES / 1024 / 1024}MB` }, { status: 413 });

  const buffer = Buffer.from(await fileObj.arrayBuffer());
  const mimeType = fileObj.type || "application/pdf";

  let invoice;
  try {
    invoice = await extractInvoiceTransactions(buffer, mimeType, undefined, session.sub, fileObj.name);
  } catch (error) {
    console.error("[import-invoice] falha ao extrair lançamentos:", error);
    return NextResponse.json({ error: "Não consegui separar os lançamentos com segurança. Nada foi importado; reenvie o arquivo original ou uma imagem mais nítida." }, { status: 422 });
  }
  if (!invoice || invoice.transactions.length === 0) {
    return NextResponse.json({ error: "Não consegui identificar lançamentos nesse arquivo. Confira se é mesmo uma fatura/extrato." }, { status: 422 });
  }
  if (invoice.reconciled === false && invoice.statementTotal !== undefined) {
    const transactionTotal = invoice.transactions.reduce((sum, item) => sum + item.amount, 0);
    return NextResponse.json({
      error: `A soma das compras (${transactionTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) não confere com o total líquido da fatura (${invoice.statementTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Nada foi importado; reenvie o arquivo original ou imagens mais nítidas.`,
    }, { status: 422 });
  }

  const duplicateFlags = await getInvoiceDuplicateFlags(session.sub, mode, invoice.transactions);
  const transactions = invoice.transactions.map((t, index) => ({
    ...t,
    duplicate: duplicateFlags[index] ?? false,
  }));
  const probableRepeat = isProbableRepeatedInvoice(duplicateFlags);

  return NextResponse.json({
    transactions,
    bankName: invoice.bankName,
    closingDay: invoice.closingDay,
    dueDay: invoice.dueDay,
    dueDate: invoice.dueDate,
    billingReferenceMonth: invoice.billingReferenceMonth,
    statementReferenceMonth: invoice.statementReferenceMonth,
    sourceTransactionCount: invoice.sourceTransactionCount,
    ignoredTransactionCount: invoice.ignoredTransactionCount,
    statementTotal: invoice.statementTotal,
    reconciled: invoice.reconciled,
    probableRepeat,
    alreadyRegisteredCount: duplicateFlags.filter(Boolean).length,
  });
}
