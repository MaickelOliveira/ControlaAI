import { NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { getAllSupportConversations } from "@/lib/support-conversations";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  return NextResponse.json({ conversations: await getAllSupportConversations() });
}
