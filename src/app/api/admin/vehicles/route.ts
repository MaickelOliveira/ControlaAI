import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createVehicle, getVehiclesByUser, addVehicleExpense, updateVehicleKm, updateVehicleExpense, deleteVehicleExpense, setExpenseFinanceId } from "@/lib/vehicles";
import { addFinance, deleteFinance, updateFinance } from "@/lib/finances";

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
    const expDate = date || new Date().toISOString().slice(0, 10);
    const expType = type || "other";
    const expDesc = description || expType;
    const v = addVehicleExpense(vehicleId, session.sub, { date: expDate, km, type: expType, amount, description: expDesc });
    if (!v) return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
    // Espelha em finanças
    const newExpense = v.expenses[v.expenses.length - 1];
    const vCatMap: Record<string, string> = { fuel: "Transporte", maintenance: "Manutenção", insurance: "Seguros", tax: "Impostos", other: "Transporte" };
    const f = addFinance({ userId: session.sub, type: "expense", amount, category: vCatMap[expType] || "Transporte", description: `${expDesc} — ${v.brand} ${v.model}`, date: expDate, mode: v.mode, source: "web" });
    setExpenseFinanceId(vehicleId, newExpense.id, f.id);
    return NextResponse.json(v);
  }

  if (action === "km") {
    const { vehicleId, km } = body;
    const v = updateVehicleKm(vehicleId, session.sub, km);
    return v ? NextResponse.json(v) : NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
  }

  if (action === "update_expense") {
    const { vehicleId, expenseId, type, amount, description, km, date } = body;
    if (!vehicleId || !expenseId) return NextResponse.json({ error: "vehicleId e expenseId obrigatórios" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (type) patch.type = type;
    if (amount !== undefined) patch.amount = amount;
    if (description !== undefined) patch.description = description;
    if (km !== undefined) patch.km = km || undefined;
    if (date) patch.date = date;
    const v = updateVehicleExpense(vehicleId, session.sub, expenseId, patch);
    if (!v) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    // Espelha edição em finanças
    const updatedExp = v.expenses.find(e => e.id === expenseId);
    if (updatedExp?.financeId) {
      const financePatch: Record<string, unknown> = {};
      if (amount !== undefined) financePatch.amount = amount;
      if (date) financePatch.date = date;
      if (description !== undefined || type) financePatch.description = `${description || updatedExp.description} — ${v.brand} ${v.model}`;
      updateFinance(updatedExp.financeId, session.sub, financePatch as Parameters<typeof updateFinance>[2]);
    }
    return NextResponse.json(v);
  }

  if (action === "delete_expense") {
    const { vehicleId, expenseId } = body;
    if (!vehicleId || !expenseId) return NextResponse.json({ error: "vehicleId e expenseId obrigatórios" }, { status: 400 });
    const result = deleteVehicleExpense(vehicleId, session.sub, expenseId);
    if (!result) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    if (result.financeId) deleteFinance(result.financeId, session.sub);
    return NextResponse.json(result.vehicle);
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
