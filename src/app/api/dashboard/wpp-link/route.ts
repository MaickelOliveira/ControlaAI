import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateWppVerifyCode, updateUser } from "@/lib/users";
import { getAdminWppConfig } from "@/lib/admin";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const code = generateWppVerifyCode(session.sub);
  const { wppSession } = getAdminWppConfig();
  return NextResponse.json({ code, session: wppSession });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  updateUser(session.sub, { wppPhone: undefined });
  return NextResponse.json({ ok: true });
}
