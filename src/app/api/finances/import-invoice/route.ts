import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { extractInvoiceTransactions } from "@/lib/ai-processor";
import { isLikelyDuplicateExpense } from "@/lib/finances";
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

  const invoice = await extractInvoiceTransactions(buffer, mimeType);
  if (!invoice || invoice.transactions.length === 0) {
    return NextResponse.json({ error: "Não consegui identificar lançamentos nesse arquivo. Confira se é mesmo uma fatura/extrato." }, { status: 422 });
  }

  const transactions = invoice.transactions.map(t => ({
    ...t,
    duplicate: isLikelyDuplicateExpense(session.sub, mode, t.amount, t.date),
  }));

  return NextResponse.json({ transactions });
}
