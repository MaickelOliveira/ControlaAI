import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createVehicle, getVehiclesByUser, addVehicleExpense, updateVehicleKm } from "@/lib/vehicles";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") as "personal" | "business" | undefined;
  return NextResponse.json(getVehiclesByUser(session.sub, mode || undefined));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "client") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { action, ...body } = await req.json();

  if (action === "create" || !action) {
    const { plate, brand, model, year, fuelType, currentKm, mode, notes } = body;
    if (!brand || !model) return NextResponse.json({ error: "brand e model obrigatórios" }, { status: 400 });
    const v = createVehicle({ userId: session.sub, plate: plate || "", brand, model, year: year || 2020, fuelType: fuelType || "flex", currentKm: currentKm || 0, mode: mode || "personal", notes: notes || "" });
    return NextResponse.json(v, { status: 201 });
  }

  if (action === "expense") {
    const { vehicleId, date, km, type, amount, description } = body;
    if (!vehicleId || !amount) return NextResponse.json({ error: "vehicleId e amount obrigatórios" }, { status: 400 });
    const v = addVehicleExpense(vehicleId, session.sub, { date: date || new Date().toISOString().slice(0, 10), km, type: type || "other", amount, description: description || type });
    return v ? NextResponse.json(v) : NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
  }

  if (action === "km") {
    const { vehicleId, km } = body;
    const v = updateVehicleKm(vehicleId, session.sub, km);
    return v ? NextResponse.json(v) : NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
