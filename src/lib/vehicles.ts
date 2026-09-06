import { randomUUID } from "crypto";
import { getSupabase } from "./supabase";

export type FuelType = "gasoline" | "ethanol" | "diesel" | "electric" | "flex";
export type VehicleExpenseType = "fuel" | "maintenance" | "insurance" | "tax" | "other";
export type VehicleMode = "personal" | "business";

export type VehicleExpense = {
  id: string;
  date: string;
  km?: number;
  type: VehicleExpenseType;
  amount: number;
  description: string;
  financeId?: string; // ID do lançamento espelhado em finances
};

export type Vehicle = {
  id: string;
  userId: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  fuelType: FuelType;
  currentKm: number;
  mode: VehicleMode;
  expenses: VehicleExpense[];
  notes: string;
  createdAt: string;
};

export type VehicleUpdateInput = Partial<Pick<Vehicle,
  "plate" | "brand" | "model" | "year" | "fuelType" | "currentKm" | "mode" | "notes"
>>;

type Row = {
  id: string; user_id: string; plate: string; brand: string; model: string; year: number;
  fuel_type: FuelType; current_km: number; mode: VehicleMode; expenses: VehicleExpense[];
  notes: string; created_at: string;
};

function fromRow(r: Row): Vehicle {
  return {
    id: r.id, userId: r.user_id, plate: r.plate, brand: r.brand, model: r.model, year: r.year,
    fuelType: r.fuel_type, currentKm: Number(r.current_km), mode: r.mode, expenses: r.expenses,
    notes: r.notes, createdAt: r.created_at,
  };
}

export async function createVehicle(data: Omit<Vehicle, "id" | "expenses" | "createdAt">): Promise<Vehicle> {
  const row = {
    id: randomUUID(), user_id: data.userId, plate: data.plate, brand: data.brand, model: data.model,
    year: data.year, fuel_type: data.fuelType, current_km: data.currentKm, mode: data.mode,
    expenses: [], notes: data.notes,
  };
  const { data: inserted, error } = await getSupabase().from("vehicles").insert(row).select("*").single();
  if (error) throw new Error(`[vehicles] createVehicle falhou: ${error.message}`);
  return fromRow(inserted as Row);
}

export async function getVehiclesByUser(userId: string, mode?: VehicleMode): Promise<Vehicle[]> {
  let query = getSupabase().from("vehicles").select("*").eq("user_id", userId);
  if (mode) query = query.eq("mode", mode);
  const { data, error } = await query;
  if (error) { console.error("[vehicles] getVehiclesByUser erro:", error.message); return []; }
  return (data as Row[]).map(fromRow);
}

/** Atualiza somente os campos informados e sempre restringe a operação ao
 * dono do veículo. O mapeamento explícito impede que propriedades extras
 * vindas da IA sejam repassadas ao banco. */
export async function updateVehicle(vehicleId: string, userId: string, patch: VehicleUpdateInput): Promise<Vehicle | null> {
  const rowPatch: Partial<Row> = {};
  if (patch.plate !== undefined) rowPatch.plate = patch.plate;
  if (patch.brand !== undefined) rowPatch.brand = patch.brand;
  if (patch.model !== undefined) rowPatch.model = patch.model;
  if (patch.year !== undefined) rowPatch.year = patch.year;
  if (patch.fuelType !== undefined) rowPatch.fuel_type = patch.fuelType;
  if (patch.currentKm !== undefined) rowPatch.current_km = patch.currentKm;
  if (patch.mode !== undefined) rowPatch.mode = patch.mode;
  if (patch.notes !== undefined) rowPatch.notes = patch.notes;
  if (!Object.keys(rowPatch).length) return null;

  const { data, error } = await getSupabase().from("vehicles").update(rowPatch)
    .eq("id", vehicleId).eq("user_id", userId).select("*").maybeSingle();
  if (error) throw new Error(`[vehicles] updateVehicle falhou: ${error.message}`);
  return data ? fromRow(data as Row) : null;
}

/** Exclui o cadastro e seus gastos internos. Os lançamentos que já foram
 * espelhados em Finanças são preservados como histórico contábil. */
export async function deleteVehicle(vehicleId: string, userId: string): Promise<boolean> {
  const { data, error } = await getSupabase().from("vehicles").delete()
    .eq("id", vehicleId).eq("user_id", userId).select("id").maybeSingle();
  if (error) throw new Error(`[vehicles] deleteVehicle falhou: ${error.message}`);
  return Boolean(data);
}

async function getVehicleRow(vehicleId: string, userId: string): Promise<Row | null> {
  const { data, error } = await getSupabase().from("vehicles").select("*").eq("id", vehicleId).eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return data as Row;
}

export async function addVehicleExpense(vehicleId: string, userId: string, expense: Omit<VehicleExpense, "id">): Promise<Vehicle | null> {
  const row = await getVehicleRow(vehicleId, userId);
  if (!row) return null;
  const exp: VehicleExpense = { ...expense, id: randomUUID() };
  const expenses = [...row.expenses, exp];
  const currentKm = expense.km && expense.km > row.current_km ? expense.km : row.current_km;
  const { data, error } = await getSupabase().from("vehicles").update({ expenses, current_km: currentKm }).eq("id", vehicleId).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function updateVehicleExpense(vehicleId: string, userId: string, expenseId: string, patch: Partial<Omit<VehicleExpense, "id">>): Promise<Vehicle | null> {
  const row = await getVehicleRow(vehicleId, userId);
  if (!row) return null;
  const eIdx = row.expenses.findIndex(e => e.id === expenseId);
  if (eIdx < 0) return null;
  const expenses = [...row.expenses];
  expenses[eIdx] = { ...expenses[eIdx], ...patch };
  const { data, error } = await getSupabase().from("vehicles").update({ expenses }).eq("id", vehicleId).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

/** Retorna { vehicle, financeId, expense } para que o caller possa apagar o lançamento financeiro vinculado */
export async function deleteVehicleExpense(vehicleId: string, userId: string, expenseId: string): Promise<{ vehicle: Vehicle; financeId?: string; expense: VehicleExpense } | null> {
  const row = await getVehicleRow(vehicleId, userId);
  if (!row) return null;
  const expense = row.expenses.find(e => e.id === expenseId);
  if (!expense) return null;
  const financeId = expense.financeId;
  const expenses = row.expenses.filter(e => e.id !== expenseId);
  const { data, error } = await getSupabase().from("vehicles").update({ expenses }).eq("id", vehicleId).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return { vehicle: fromRow(data as Row), financeId, expense };
}

/** Busca o vehicle expense pelo financeId — usado ao excluir em Finanças */
export async function findExpenseByFinanceId(userId: string, financeId: string): Promise<{ vehicleId: string; expenseId: string } | null> {
  const { data, error } = await getSupabase().from("vehicles").select("*").eq("user_id", userId);
  if (error || !data) return null;
  for (const row of data as Row[]) {
    const e = row.expenses.find(ex => ex.financeId === financeId);
    if (e) return { vehicleId: row.id, expenseId: e.id };
  }
  return null;
}

/** Atualiza o financeId de um gasto de veículo após criar o lançamento financeiro */
export async function setExpenseFinanceId(vehicleId: string, expenseId: string, financeId: string): Promise<void> {
  const { data, error } = await getSupabase().from("vehicles").select("*").eq("id", vehicleId).maybeSingle();
  if (error || !data) return;
  const row = data as Row;
  const e = row.expenses.find(e => e.id === expenseId);
  if (!e) return;
  e.financeId = financeId;
  await getSupabase().from("vehicles").update({ expenses: row.expenses }).eq("id", vehicleId);
}

export async function updateVehicleKm(vehicleId: string, userId: string, km: number): Promise<Vehicle | null> {
  const { data, error } = await getSupabase().from("vehicles").update({ current_km: km }).eq("id", vehicleId).eq("user_id", userId).select("*").maybeSingle();
  if (error || !data) return null;
  return fromRow(data as Row);
}

export async function findVehicleByName(userId: string, name: string, mode?: VehicleMode): Promise<Vehicle | null> {
  return (await findVehiclesByName(userId, name, mode))[0] ?? null;
}

function normalizeVehicleSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(meu|minha|o|a|do|da|veiculo|carro|moto|caminhao)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Retorna todos os candidatos, priorizando correspondência exata. Isso é
 * essencial para alterações/exclusões: nunca escolher silenciosamente o
 * primeiro veículo quando dois cadastros combinam com o mesmo texto. */
export async function findVehiclesByName(userId: string, name: string, mode?: VehicleMode): Promise<Vehicle[]> {
  const vehicles = await getVehiclesByUser(userId, mode);
  const query = normalizeVehicleSearch(name);
  if (!query) return vehicles;
  const compactQuery = query.replace(/\s+/g, "");

  const exact = vehicles.filter(v => {
    const fields = [v.model, v.brand, v.plate, `${v.brand} ${v.model}`, `${v.brand} ${v.model} ${v.year}`]
      .map(normalizeVehicleSearch);
    return fields.some(field => field === query || field.replace(/\s+/g, "") === compactQuery);
  });
  if (exact.length) return exact;

  return vehicles.filter(v => {
    const searchable = normalizeVehicleSearch(`${v.brand} ${v.model} ${v.year} ${v.plate}`);
    const compactSearchable = searchable.replace(/\s+/g, "");
    return searchable.includes(query) || query.includes(searchable)
      || compactSearchable.includes(compactQuery) || compactQuery.includes(compactSearchable);
  });
}

export function getVehicleTotalExpenses(vehicle: Vehicle): number {
  return vehicle.expenses.reduce((s, e) => s + e.amount, 0);
}

export function getVehicleExpensesByType(vehicle: Vehicle): Record<string, number> {
  return vehicle.expenses.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);
}

export const EXPENSE_TYPE_LABEL: Record<VehicleExpenseType, string> = {
  fuel: "⛽ Combustível",
  maintenance: "🔧 Manutenção",
  insurance: "🛡️ Seguro",
  tax: "📋 IPVA/Impostos",
  other: "📌 Outros",
};

/** Categoria financeira usada ao espelhar uma despesa de veículo em finanças.
 *  Todos os valores DEVEM existir em CATEGORIES_EXPENSE (finances.ts) — usar
 *  nomes fora dessa lista cria categorias órfãs, que não aparecem em nenhum
 *  filtro do painel e sujam os relatórios. */
export const VEHICLE_FINANCE_CATEGORY: Record<VehicleExpenseType, string> = {
  fuel: "Transporte",
  maintenance: "Transporte",
  insurance: "Serviços",
  tax: "Impostos",
  other: "Transporte",
};

export const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  gasoline: "Gasolina",
  ethanol: "Etanol",
  diesel: "Diesel",
  electric: "Elétrico",
  flex: "Flex",
};
