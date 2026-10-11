import "server-only";
import { getSupabase } from "./supabase";
import { companyScopeFor } from "./company-context";
import { requireCompany } from "./companies";
import { encryptField } from "./crypto-store";
import { validateFiscalProfile, validateFiscalService, validateInvoiceDraft, invoiceReviewHash, type FiscalProfile, type FiscalService, type InvoiceDraft } from "./nfse-validation";
import { validateFiscalCertificate } from "./nfse-certificate";
export type FiscalServiceRecord = { id: string; service: FiscalService; archived: boolean };
export type FiscalDraftRecord = { id: string; draft: InvoiceDraft; review_hash: string; status: string; source: string; created_at: string };
export async function fiscalScope(userId: string) {
 const scope = await companyScopeFor(userId);
 if (!scope || scope.mode !== "business" || scope.allowBusiness === false) throw Error("Notas fiscais estão disponíveis no modo Empresa.");
 await requireCompany(userId, scope.companyId); return scope;
}
export async function fiscalOverview(userId: string) {
 const scope = await fiscalScope(userId), db = getSupabase();
 const results = await Promise.all([
  db.from("nfse_profiles").select("profile,readiness,certificate_expires_at").eq("user_id", userId).eq("company_id", scope.companyId).maybeSingle(),
  db.from("nfse_services").select("id,service,archived").eq("user_id", userId).eq("company_id", scope.companyId).eq("archived", false).order("created_at", { ascending: true }).limit(200),
  db.from("nfse_drafts").select("id,draft,review_hash,status,source,created_at").eq("user_id", userId).eq("company_id", scope.companyId).neq("status", "archived").order("created_at", { ascending: false }).limit(100),
 ]);
 if (results.some(result => result.error)) throw Error("Não foi possível carregar o cadastro fiscal.");
 return { companyName: scope.companyName, profile: results[0].data?.profile as FiscalProfile | null, readiness: results[0].data?.readiness ?? "configuration", certificateExpiresAt: results[0].data?.certificate_expires_at ?? null, services: (results[1].data ?? []) as FiscalServiceRecord[], drafts: (results[2].data ?? []) as FiscalDraftRecord[], emissionAvailable: false, emissionReason: "A emissão está em preparação. Cadastre sua empresa e os serviços e prepare rascunhos. A emissão e o PDF oficiais serão habilitados após a validação do certificado e do emissor. Nenhum rascunho é uma nota emitida." };
}
export async function saveFiscalProfile(userId: string, value: unknown) {
 const scope = await fiscalScope(userId), profile = validateFiscalProfile(value), db = getSupabase();
 const { data: previous, error: readError } = await db.from("nfse_profiles").select("profile").eq("user_id", userId).eq("company_id", scope.companyId).maybeSingle();
 if (readError) throw Error("Não foi possível consultar o cadastro fiscal.");
 const resetCertificate = previous?.profile?.cnpj !== profile.cnpj;
 const row = { user_id: userId, company_id: scope.companyId, profile, readiness: "configuration", updated_at: new Date().toISOString(), ...(resetCertificate ? { certificate_encrypted: null, certificate_expires_at: null } : {}) };
 // Updates are qualified; an upsert is deliberately not allowed to change ownership.
 const result = previous ? await db.from("nfse_profiles").update(row).eq("user_id", userId).eq("company_id", scope.companyId) : await db.from("nfse_profiles").insert(row);
 if (result.error) throw Error("Não foi possível salvar o cadastro fiscal.");
}
export async function saveFiscalService(userId: string, value: unknown, id?: string) {
 const scope = await fiscalScope(userId), service = validateFiscalService(value), db = getSupabase();
 const query = id ? db.from("nfse_services").update({ service }).eq("id", id).eq("user_id", userId).eq("company_id", scope.companyId) : db.from("nfse_services").insert({ user_id: userId, company_id: scope.companyId, service });
 const { data, error } = await query.select("id,service,archived").maybeSingle();
 if (error || !data) throw Error("Não foi possível salvar este serviço nesta empresa."); return data as FiscalServiceRecord;
}
export async function createFiscalDraft(userId: string, value: unknown, source: "web" | "whatsapp", requestedBy: string) {
 const scope = await fiscalScope(userId), overview = await fiscalOverview(userId);
 if (!overview.profile) throw Error("Configure os dados fiscais da empresa em Notas fiscais antes de preparar a nota.");
 const draft: InvoiceDraft = { issuer: validateFiscalProfile(overview.profile), ...validateInvoiceDraft(value) };
 const { data, error } = await getSupabase().from("nfse_drafts").insert({ user_id: userId, company_id: scope.companyId, draft, review_hash: invoiceReviewHash(draft), source, requested_by: requestedBy }).select("id,draft,review_hash,status,source,created_at").single();
 if (error || !data) throw Error("Não foi possível guardar o rascunho da nota."); return data as FiscalDraftRecord;
}
export async function archiveFiscalRecord(userId: string, kind: "service" | "draft", id: string) {
 const scope = await fiscalScope(userId), db = getSupabase();
 let query = db.from(kind === "service" ? "nfse_services" : "nfse_drafts").update(kind === "service" ? { archived: true } : { status: "archived" }).eq("id", id).eq("user_id", userId).eq("company_id", scope.companyId);
 if (kind === "draft") query = query.eq("status", "draft");
 const { data, error } = await query.select("id").maybeSingle();
 if (error || !data) throw Error("Este registro não pode ser arquivado nesta empresa.");
}
export async function storeFiscalCertificate(userId: string, bytes: Buffer, password: string) {
 const scope = await fiscalScope(userId), overview = await fiscalOverview(userId);
 if (!overview.profile) throw Error("Salve o cadastro fiscal antes do certificado.");
 if (!bytes.length || bytes.length > 1_000_000 || password.length > 200) throw Error("Use um certificado A1 .pfx/.p12 de até 1 MB.");
 const expiresAt = await validateFiscalCertificate(bytes, password, overview.profile.cnpj);
 let certificate: string | undefined;
 try { certificate = encryptField(JSON.stringify({ pfx: bytes.toString("base64"), password })); } catch { throw Error("A proteção de certificados ainda não está disponível. Tente novamente mais tarde."); }
 const { data, error } = await getSupabase().from("nfse_profiles").update({ certificate_encrypted: certificate, certificate_expires_at: expiresAt, readiness: "homologation", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("company_id", scope.companyId).eq("profile->>cnpj", overview.profile.cnpj).select("company_id").maybeSingle();
 if (error || !data) throw Error("Não foi possível guardar o certificado de forma protegida. Confira se o cadastro da empresa foi alterado.");
 return { expiresAt };
}
