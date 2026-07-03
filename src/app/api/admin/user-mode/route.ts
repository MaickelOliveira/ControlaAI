import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateUser, getUserById } from "@/lib/users";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { mode, wppPhone } = await req.json();

  const patch: Record<string, unknown> = {};
  if (mode) patch.activeMode = mode;
  if (wppPhone !== undefined) patch.wppPhone = wppPhone?.replace(/\D/g, "") || null;

  updateUser(session.sub, patch as Parameters<typeof updateUser>[1]);
  const user = getUserById(session.sub);
  return NextResponse.json({ ok: true, activeMode: user?.activeMode, wppPhone: (user as Record<string,unknown>)?.wppPhone });
}
