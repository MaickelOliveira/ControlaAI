/**
 * Migração única de data/*.json (formato antigo) para o Supabase.
 *
 * Rode UMA VEZ, direto no servidor onde estão os data/*.json reais,
 * ANTES de trocar o deploy para o código novo (que só lê do Supabase):
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/migrate-to-supabase.ts
 *
 * Idempotente: usa upsert (por id/chave primária), então rodar de novo não
 * duplica nada — seguro re-executar se algo falhar no meio.
 *
 * Não apaga nem sobrescreve os data/*.json — eles continuam intactos no
 * disco como backup depois da migração.
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados no ambiente.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const DATA_DIR = path.join(process.cwd(), "data");

function loadJSON<T>(file: string, fallback: T): T {
  const p = path.join(DATA_DIR, file);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch (e) {
    console.error(`Erro ao ler ${file}:`, e);
    return fallback;
  }
}

async function upsert(table: string, rows: Record<string, unknown>[], conflictKey = "id") {
  if (rows.length === 0) {
    console.log(`  ${table}: nada para migrar`);
    return;
  }
  const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictKey });
  if (error) {
    console.error(`  ✗ ${table}: ${error.message}`);
  } else {
    console.log(`  ✓ ${table}: ${rows.length} linha(s)`);
  }
}

async function main() {
  console.log("Migrando data/*.json → Supabase\n");

  // ── users ──
  type OldUser = {
    id: string; phone: string; name: string; email: string; passwordHash: string;
    plan: string; status: string; activeMode: string; company?: string;
    wppPhone?: string; wppPhones?: string[]; wppPhoneNames?: Record<string, string>;
    wppPhoneRelations?: Record<string, string>; wppPhoneAccess?: Record<string, string>;
    maxWppPhones?: number; wppVerifyCode?: string; wppVerifyExpires?: string;
    customCategoriesExpense?: string[]; customCategoriesIncome?: string[];
    priceOverride?: number; activatedAt?: string; deactivatedAt?: string;
    trialEndsAt: string; createdAt: string;
  };
  const users = loadJSON<OldUser[]>("users.json", []);
  await upsert("users", users.map(u => ({
    id: u.id, phone: u.phone, name: u.name, email: u.email, password_hash: u.passwordHash,
    plan: u.plan, status: u.status, active_mode: u.activeMode, company: u.company ?? null,
    wpp_phone: u.wppPhone ?? null, wpp_phones: u.wppPhones ?? [], wpp_phone_names: u.wppPhoneNames ?? {},
    wpp_phone_relations: u.wppPhoneRelations ?? {}, wpp_phone_access: u.wppPhoneAccess ?? {},
    max_wpp_phones: u.maxWppPhones ?? null, wpp_verify_code: u.wppVerifyCode ?? null,
    wpp_verify_expires: u.wppVerifyExpires ?? null,
    custom_categories_expense: u.customCategoriesExpense ?? [], custom_categories_income: u.customCategoriesIncome ?? [],
    price_override: u.priceOverride ?? null, activated_at: u.activatedAt ?? null, deactivated_at: u.deactivatedAt ?? null,
    trial_ends_at: u.trialEndsAt, created_at: u.createdAt,
  })));

  // ── finances ──
  type OldFinance = {
    id: string; userId: string; type: string; amount: number; description: string; category: string;
    mode: string; date: string; status?: string; source?: string; registeredBy?: string; createdAt: string;
  };
  const finances = loadJSON<OldFinance[]>("finances.json", []);
  await upsert("finances", finances.map(f => ({
    id: f.id, user_id: f.userId, type: f.type, amount: f.amount, description: f.description, category: f.category,
    mode: f.mode, date: f.date, pending: f.status === "pending", source: f.source ?? null,
    registered_by: f.registeredBy ?? null, created_at: f.createdAt,
  })));

  // ── tasks ──
  type OldTask = { id: string; userId: string; title: string; status: string; priority?: string; mode: string; dueDate?: string; createdAt: string };
  const tasks = loadJSON<OldTask[]>("tasks.json", []);
  await upsert("tasks", tasks.map(t => ({
    id: t.id, user_id: t.userId, title: t.title, status: t.status, priority: t.priority ?? "medium",
    mode: t.mode, due_date: t.dueDate ?? null, created_at: t.createdAt,
  })));

  // ── reminders ──
  type OldReminder = { id: string; userId: string; message: string; phone: string; scheduledAt: string; repeat: string; mode: string; sent: boolean; createdAt: string };
  const reminders = loadJSON<OldReminder[]>("reminders.json", []);
  await upsert("reminders", reminders.map(r => ({
    id: r.id, user_id: r.userId, message: r.message, phone: r.phone, scheduled_at: r.scheduledAt,
    repeat: r.repeat, mode: r.mode, sent: r.sent, created_at: r.createdAt,
  })));

  // ── goals ──
  type OldGoal = { id: string; userId: string; title: string; targetAmount: number; currentAmount: number; deadline?: string; category: string; mode: string; status: string; createdAt: string };
  const goals = loadJSON<OldGoal[]>("goals.json", []);
  await upsert("goals", goals.map(g => ({
    id: g.id, user_id: g.userId, title: g.title, target_amount: g.targetAmount, current_amount: g.currentAmount,
    deadline: g.deadline ?? null, category: g.category, mode: g.mode, status: g.status, created_at: g.createdAt,
  })));

  // ── vehicles ──
  type OldVehicle = {
    id: string; userId: string; plate: string; brand: string; model: string; year: number; fuelType: string;
    currentKm: number; mode: string; expenses: unknown[]; notes: string; createdAt: string;
  };
  const vehicles = loadJSON<OldVehicle[]>("vehicles.json", []);
  await upsert("vehicles", vehicles.map(v => ({
    id: v.id, user_id: v.userId, plate: v.plate, brand: v.brand, model: v.model, year: v.year,
    fuel_type: v.fuelType, current_km: v.currentKm, mode: v.mode, expenses: v.expenses ?? [],
    notes: v.notes ?? "", created_at: v.createdAt,
  })));

  // ── agenda (appointments) ──
  type OldAppointment = {
    id: string; userId: string; title: string; description?: string; location?: string;
    startAt: string; endAt?: string; allDay?: boolean; repeat?: string; status?: string; source?: string;
    meetLink?: string; calendarEventId?: string; ataGenerated?: boolean; ataContent?: string;
    ataNotifiedAt?: string; reminderSentAt?: string; createdAt: string;
  };
  const appointments = loadJSON<OldAppointment[]>("agenda.json", []);
  await upsert("appointments", appointments.map(a => ({
    id: a.id, user_id: a.userId, title: a.title, description: a.description ?? null, location: a.location ?? null,
    start_at: a.startAt, end_at: a.endAt ?? null, all_day: a.allDay ?? false, repeat: a.repeat ?? "none",
    status: a.status ?? "scheduled", source: a.source ?? "web", meet_link: a.meetLink ?? null,
    calendar_event_id: a.calendarEventId ?? null, ata_generated: a.ataGenerated ?? false, ata_content: a.ataContent ?? null,
    ata_notified_at: a.ataNotifiedAt ?? null, reminder_sent_at: a.reminderSentAt ?? null, created_at: a.createdAt,
  })));

  // ── recurring transactions ──
  type OldRecurring = {
    id: string; userId: string; type: string; amount: number; totalAmount?: number; category: string;
    description: string; mode: string; recurrenceType: string; totalInstallments?: number; paidInstallments: number;
    repeatUnit: string; dayOfMonth?: number; startDate: string; nextDueDate: string; status: string;
    lastNotifiedDate?: string; source?: string; createdAt: string;
  };
  const recurring = loadJSON<OldRecurring[]>("recurring.json", []);
  await upsert("recurring_transactions", recurring.map(r => ({
    id: r.id, user_id: r.userId, type: r.type, amount: r.amount, total_amount: r.totalAmount ?? null,
    category: r.category, description: r.description, mode: r.mode, recurrence_type: r.recurrenceType,
    total_installments: r.totalInstallments ?? null, paid_installments: r.paidInstallments,
    repeat_unit: r.repeatUnit, day_of_month: r.dayOfMonth ?? null, start_date: r.startDate,
    next_due_date: r.nextDueDate, status: r.status, last_notified_date: r.lastNotifiedDate ?? null,
    source: r.source ?? "web", created_at: r.createdAt,
  })));

  // ── employees ──
  type OldEmployee = { id: string; userId: string; name: string; role: string; salary: number; startDate: string; status: string; phone?: string; email?: string; notes?: string; createdAt: string };
  const employees = loadJSON<OldEmployee[]>("employees.json", []);
  await upsert("employees", employees.map(e => ({
    id: e.id, user_id: e.userId, name: e.name, role: e.role, salary: e.salary, start_date: e.startDate,
    status: e.status, phone: e.phone ?? null, email: e.email ?? null, notes: e.notes ?? null, created_at: e.createdAt,
  })));

  // ── customers ──
  type OldCustomer = { id: string; userId: string; name: string; phone?: string; email?: string; company?: string; address?: string; notes?: string; status: string; createdAt: string };
  const customers = loadJSON<OldCustomer[]>("customers.json", []);
  await upsert("customers", customers.map(c => ({
    id: c.id, user_id: c.userId, name: c.name, phone: c.phone ?? null, email: c.email ?? null,
    company: c.company ?? null, address: c.address ?? null, notes: c.notes ?? null, status: c.status, created_at: c.createdAt,
  })));

  // ── grocery (blob único) ──
  const groceryOld = loadJSON<{ stores?: unknown[]; purchases?: unknown[]; shoppingList?: unknown[] } | null>("grocery.json", null);
  if (groceryOld) {
    const { error } = await supabase.from("grocery").upsert({
      id: 1,
      data: { stores: groceryOld.stores ?? [], purchases: groceryOld.purchases ?? [], shoppingList: groceryOld.shoppingList ?? [] },
    }, { onConflict: "id" });
    console.log(error ? `  ✗ grocery: ${error.message}` : "  ✓ grocery: 1 linha (blob)");
  } else {
    console.log("  grocery: nada para migrar");
  }

  // ── meets ──
  type OldMeet = {
    id: string; userId: string; title: string; description?: string; startAt: string; endAt: string;
    meetLink?: string; calendarEventId?: string; attendees?: unknown[]; ataGenerated?: boolean; ataContent?: string;
    ataNotifiedAt?: string; status?: string; source?: string; createdAt: string;
  };
  const meets = loadJSON<OldMeet[]>("meets.json", []);
  await upsert("meets", meets.map(m => ({
    id: m.id, user_id: m.userId, title: m.title, description: m.description ?? null, start_at: m.startAt,
    end_at: m.endAt, meet_link: m.meetLink ?? "", calendar_event_id: m.calendarEventId ?? "",
    attendees: m.attendees ?? [], ata_generated: m.ataGenerated ?? false, ata_content: m.ataContent ?? null,
    ata_notified_at: m.ataNotifiedAt ?? null, status: m.status ?? "scheduled", source: m.source ?? "web",
    created_at: m.createdAt,
  })));

  // ── drive folders + files (metadados; bytes continuam em disco) ──
  type OldFolder = { id: string; userId: string; name: string; parentId: string | null; createdAt: string };
  const folders = loadJSON<OldFolder[]>("drive-folders.json", []);
  await upsert("drive_folders", folders.map(f => ({
    id: f.id, user_id: f.userId, name: f.name, parent_id: f.parentId ?? null, created_at: f.createdAt,
  })));

  type OldDriveFile = {
    id: string; userId: string; folderId: string | null; originalName: string; storedName: string;
    mimeType: string; size: number; description?: string; aiKeywords?: string[]; source?: string; createdAt: string;
  };
  const driveFiles = loadJSON<OldDriveFile[]>("drive-meta.json", []);
  await upsert("drive_files", driveFiles.map(f => ({
    id: f.id, user_id: f.userId, folder_id: f.folderId ?? null, original_name: f.originalName,
    stored_name: f.storedName, mime_type: f.mimeType, size: f.size, description: f.description ?? null,
    ai_keywords: f.aiKeywords ?? [], source: f.source ?? "web", created_at: f.createdAt,
  })));

  // ── conversations ──
  const conversationsOld = loadJSON<Record<string, { messages: unknown[]; contactName?: string; lastActivity: number; unread?: boolean; aiPaused?: boolean }>>("conversations.json", {});
  const convRows = Object.entries(conversationsOld).map(([phone, data]) => ({ phone, data }));
  await upsert("conversations", convRows, "phone");

  // ── pending actions ──
  const pendingOld = loadJSON<Record<string, unknown>>("pending.json", {});
  const pendingRows = Object.entries(pendingOld).map(([phone, data]) => ({ phone, data, updated_at: new Date().toISOString() }));
  await upsert("pending_actions", pendingRows, "phone");

  // ── admin config ──
  const adminOld = loadJSON<{ adminEmail?: string; adminPasswordHash?: string } | null>("admin.json", null);
  if (adminOld && (adminOld.adminEmail || adminOld.adminPasswordHash)) {
    const { error } = await supabase.from("admin_config").upsert({
      id: 1, admin_email: adminOld.adminEmail ?? null, admin_password_hash: adminOld.adminPasswordHash ?? null,
    }, { onConflict: "id" });
    console.log(error ? `  ✗ admin_config: ${error.message}` : "  ✓ admin_config: 1 linha");
  } else {
    console.log("  admin_config: nada para migrar");
  }

  // ── billing config (preços) ──
  const billingOld = loadJSON<{ personal?: number; business?: number } | null>("billing-config.json", null);
  if (billingOld) {
    const { error } = await supabase.from("billing_config").upsert({
      id: 1, personal: billingOld.personal ?? 0, business: billingOld.business ?? 0,
    }, { onConflict: "id" });
    console.log(error ? `  ✗ billing_config: ${error.message}` : "  ✓ billing_config: 1 linha");
  } else {
    console.log("  billing_config: nada para migrar");
  }

  // ── whatsapp config ──
  const wppConfigOld = loadJSON<Record<string, unknown> | null>("whatsapp-config.json", null);
  if (wppConfigOld) {
    const { error } = await supabase.from("whatsapp_config").upsert({ id: 1, data: wppConfigOld }, { onConflict: "id" });
    console.log(error ? `  ✗ whatsapp_config: ${error.message}` : "  ✓ whatsapp_config: 1 linha");
  } else {
    console.log("  whatsapp_config: nada para migrar");
  }

  // ── google tokens (data/google-tokens.json = Record<userId, TokenEntry>, valores já criptografados) ──
  type OldGoogleToken = { accessToken: string; refreshToken: string; expiresAt: string };
  const googleTokens = loadJSON<Record<string, OldGoogleToken>>("google-tokens.json", {});
  await upsert("google_tokens", Object.entries(googleTokens).map(([userId, t]) => ({
    user_id: userId, access_token: t.accessToken, refresh_token: t.refreshToken, expires_at: t.expiresAt,
  })), "user_id");

  // ── billing webhooks (config de ativação automática) ──
  type OldBillingWebhook = {
    id: string; label: string; active: boolean; secretBodyField?: string; secretHeader?: string; secretValue?: string;
    emailPath: string; statusPath: string; activateValues: string[]; deactivateValues: string[];
    planPath?: string; planMap?: Record<string, string>; createdAt: string;
  };
  const billingWebhooks = loadJSON<OldBillingWebhook[]>("billing-webhooks.json", []);
  await upsert("billing_webhooks", billingWebhooks.map(w => ({
    id: w.id, label: w.label, active: w.active, secret_body_field: w.secretBodyField ?? null,
    secret_header: w.secretHeader ?? null, secret_value: w.secretValue ?? null, email_path: w.emailPath,
    status_path: w.statusPath, activate_values: w.activateValues ?? [], deactivate_values: w.deactivateValues ?? [],
    plan_path: w.planPath ?? null, plan_map: w.planMap ?? null, created_at: w.createdAt,
  })));

  console.log("\nMigração concluída. Os data/*.json originais não foram alterados.");
}

main().catch(e => {
  console.error("Erro fatal na migração:", e);
  process.exit(1);
});
