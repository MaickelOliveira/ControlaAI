import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { getHistory, markAsRead } from "@/lib/conversations";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "Telefone não informado" }, { status: 400 });

  const messages = getHistory(phone);
  markAsRead(phone);
  return NextResponse.json({ messages });
}
