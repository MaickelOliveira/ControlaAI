import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createTask, getTasksByUser, updateTaskStatus } from "@/lib/tasks";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") as "personal" | "business" | undefined;
  const tasks = getTasksByUser(session.sub, mode || undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { title, priority, dueDate, mode } = body;
  if (!title) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });

  const task = createTask({
    userId: session.sub,
    title,
    priority: priority || "medium",
    dueDate,
    status: "pending",
    mode: mode || "personal",
  });

  return NextResponse.json(task, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id, status } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id e status obrigatórios" }, { status: 400 });

  const task = updateTaskStatus(id, session.sub, status);
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  return NextResponse.json(task);
}
