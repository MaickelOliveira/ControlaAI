import { NextResponse } from "next/server";
import { getAdminSession as getSession } from "@/lib/auth";
import { getAllConversations } from "@/lib/conversations";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  return NextResponse.json({ conversations: getAllConversations() });
}
