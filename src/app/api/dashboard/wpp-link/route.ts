import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateWppVerifyCode } from "@/lib/users";
import { getAdminWppConfig } from "@/lib/admin";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const code = generateWppVerifyCode(session.userId);
  const { wppSession } = getAdminWppConfig();
  // Retorna o código e o número do bot (sessão WPPConnect)
  return NextResponse.json({ code, session: wppSession });
}
