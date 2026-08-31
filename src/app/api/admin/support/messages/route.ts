import { NextRequest, NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { getSupportThread, markSupportReadByAdmin } from "@/lib/support-conversations";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId não informado" }, { status: 400 });

  const thread = await getSupportThread(userId);
  await markSupportReadByAdmin(userId);
  return NextResponse.json(thread);
}
