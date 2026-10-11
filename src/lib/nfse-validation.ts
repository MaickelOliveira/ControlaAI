import { createHash } from "node:crypto";
export type FiscalProfile = { cnpj: string; legalName: string; municipalityCode: string; municipalityName: string; municipalRegistration: string; regime: "1" | "2" | "3"; simpleApportionment?: "1" | "2" | "3"; specialRegime: "0" | "1" | "2" | "3" | "4" | "5" | "6" | "9" };
export type FiscalService = { title: string; description: string; nationalCode: string; municipalCode?: string; nbs?: string; amount: number; issTaxation: "1" | "2" | "3" | "4"; withholding: "1" | "2" | "3"; issRate?: number; estimatedFederal: number; estimatedState: number; estimatedMunicipal: number };
export type InvoiceDraft = { issuer: FiscalProfile; service: FiscalService; recipientName: string; recipientDocument: string; competence: string };
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Dados fiscais inválidos."); return value as Record<string, unknown>; }
function text(value: unknown, label: string, max: number): string { if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw Error(`Informe ${label}.`); return value.trim(); }
function code(value: unknown, label: string, pattern: RegExp): string { const result = text(value, label, 30); if (!pattern.test(result)) throw Error(`Confira ${label}.`); return result; }
function option<T extends string>(value: unknown, label: string, options: readonly T[]): T { if (typeof value !== "string" || !options.includes(value as T)) throw Error(`Informe ${label}.`); return value as T; }
function decimal(value: unknown, label: string, min: number, max: number): number { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) throw Error(`Confira ${label}.`); return value; }
export function validFiscalDocument(value: string): boolean {
 if (!/^\d{11}$|^\d{14}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
 const digits = [...value].map(Number), cnpj = value.length === 14;
 for (let round = 0; round < 2; round++) {
  const end = (cnpj ? 12 : 9) + round;
  const sum = digits.slice(0, end).reduce((total, digit, index) => total + digit * (cnpj ? ((end - index - 1) % 8) + 2 : end + 1 - index), 0);
  const check = cnpj ? (sum % 11 < 2 ? 0 : 11 - sum % 11) : ((sum * 10) % 11) % 10;
  if (digits[end] !== check) return false;
 }
 return true;
}
export function validateFiscalProfile(value: unknown): FiscalProfile {
 const data = object(value), cnpj = code(data.cnpj, "o CNPJ numérico da empresa", /^\d{14}$/);
 if (!validFiscalDocument(cnpj)) throw Error("Confira os dígitos do CNPJ.");
 const regime = option(data.regime, "o regime tributário", ["1", "2", "3"] as const);
 return { cnpj, legalName: text(data.legalName, "a razão social", 150), municipalityCode: code(data.municipalityCode, "o código IBGE do município", /^\d{7}$/), municipalityName: text(data.municipalityName, "o município", 100), municipalRegistration: text(data.municipalRegistration, "a inscrição municipal (ou dispensa confirmada)", 15), regime, ...(regime === "3" ? { simpleApportionment: option(data.simpleApportionment, "a apuração do Simples", ["1", "2", "3"] as const) } : {}), specialRegime: option(data.specialRegime, "o regime especial", ["0", "1", "2", "3", "4", "5", "6", "9"] as const) };
}
export function validateFiscalService(value: unknown): FiscalService {
 const data = object(value);
 return { title: text(data.title, "o nome do serviço", 100), description: text(data.description, "a descrição do serviço", 2000), nationalCode: code(data.nationalCode, "o código nacional de serviço (6 dígitos)", /^\d{6}$/), ...(data.municipalCode ? { municipalCode: code(data.municipalCode, "o código municipal (3 dígitos)", /^\d{3}$/) } : {}), ...(data.nbs ? { nbs: code(data.nbs, "o NBS", /^\d{9}$/) } : {}), amount: decimal(data.amount, "o valor do serviço", 0.01, 999999999999.99), issTaxation: option(data.issTaxation, "a tributação do ISS", ["1", "2", "3", "4"] as const), withholding: option(data.withholding, "a retenção do ISS", ["1", "2", "3"] as const), ...(data.issRate !== undefined ? { issRate: decimal(data.issRate, "a alíquota do ISS", 0, 5) } : {}), estimatedFederal: decimal(data.estimatedFederal, "os tributos federais aproximados (%)", 0, 100), estimatedState: decimal(data.estimatedState, "os tributos estaduais aproximados (%)", 0, 100), estimatedMunicipal: decimal(data.estimatedMunicipal, "os tributos municipais aproximados (%)", 0, 100) };
}
export function validateInvoiceDraft(value: unknown): Omit<InvoiceDraft, "issuer"> {
 const data = object(value), recipientDocument = code(data.recipientDocument, "o CPF/CNPJ numérico do tomador", /^\d{11}$|^\d{14}$/);
 if (!validFiscalDocument(recipientDocument)) throw Error("Confira os dígitos do CPF/CNPJ do tomador.");
 const competence = code(data.competence, "a competência (AAAA-MM-DD)", /^\d{4}-\d{2}-\d{2}$/);
 const date = new Date(`${competence}T12:00:00Z`); if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== competence) throw Error("Confira a data de competência.");
 return { service: validateFiscalService(data.service), recipientName: text(data.recipientName, "o nome do tomador", 150), recipientDocument, competence };
}
export function invoiceReviewHash(draft: Omit<InvoiceDraft, "issuer"> | InvoiceDraft): string { return createHash("sha256").update(JSON.stringify(draft)).digest("hex"); }

/** Validate each WhatsApp answer before advancing, so an earlier invalid field can be corrected. */
export function validateFiscalServiceAnswer(field: string, value: unknown): void {
 switch (field) {
  case "title": text(value, "o nome do serviço", 100); break;
  case "description": text(value, "a descrição do serviço", 2000); break;
  case "nationalCode": code(value, "o código nacional de serviço (6 dígitos)", /^\d{6}$/); break;
  case "issTaxation": option(value, "a tributação do ISS", ["1", "2", "3", "4"] as const); break;
  case "withholding": option(value, "a retenção do ISS", ["1", "2", "3"] as const); break;
  case "amount": decimal(value, "o valor do serviço", 0.01, 999999999999.99); break;
  case "issRate": if (value !== undefined) decimal(value, "a alíquota do ISS", 0, 5); break;
  case "estimatedFederal": case "estimatedState": case "estimatedMunicipal": decimal(value, "o percentual de tributos", 0, 100); break;
  default: throw Error("Campo fiscal inválido.");
 }
}
