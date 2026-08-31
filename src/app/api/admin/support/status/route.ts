import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { setSupportStatus, type SupportStatus } from "@/lib/support-conversations";

const VALID_STATUSES: SupportStatus[] = ["none", "needs_attention", "attended"];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const userId = body?.userId as string | undefined;
  const status = body?.status as SupportStatus | undefined;
  if (!userId || !status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "userId e status válidos são obrigatórios" }, { status: 400 });
  }

  await setSupportStatus(userId, status);
  return NextResponse.json({ ok: true });
}
