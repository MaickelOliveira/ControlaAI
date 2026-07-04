import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getUserById, updateUser, getUsers } from "@/lib/users";
import { writeFileSync } from "fs";
import path from "path";

type Params = Promise<{ id: string }>;

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action, trialDays, maxWppPhones } = body;

  const user = getUserById(id);
  if (!user) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  if (action === "activate") {
    updateUser(id, { status: "active" });
  } else if (action === "deactivate") {
    updateUser(id, { status: "inactive" });
  } else if (action === "extend_trial") {
    const days = Number(trialDays) || 14;
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + days);
    updateUser(id, { status: "trial", trialEndsAt: trialEnd.toISOString() });
  } else if (action === "set_wpp_limit") {
    const limit = Math.max(1, Number(maxWppPhones) || 1);
    updateUser(id, { maxWppPhones: limit });
  } else {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const session = await getAdminSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const users = getUsers().filter(u => u.id !== id);
  const FILE = path.join(process.cwd(), "data", "users.json");
  writeFileSync(FILE, JSON.stringify(users, null, 2));

  return NextResponse.json({ ok: true });
}
