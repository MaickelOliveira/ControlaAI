import { expect, it } from "vitest";
import { validateFiscalProfile, validateFiscalService, validateInvoiceDraft, invoiceReviewHash } from "./nfse-validation";
const profile = { cnpj: "11222333000181", legalName: "Empresa Exemplo", municipalityCode: "3550308", municipalityName: "São Paulo", municipalRegistration: "12345", regime: "2", specialRegime: "0" };
const service = { title: "Consultoria", description: "Consultoria de gestão", nationalCode: "170101", amount: 150, issTaxation: "1", withholding: "1", estimatedFederal: 0, estimatedState: 0, estimatedMunicipal: 0 };
it("requires fiscal fields explicitly and never derives them from the company display name", () => {
 expect(validateFiscalProfile(profile).cnpj).toBe(profile.cnpj);
 expect(() => validateFiscalProfile({ ...profile, cnpj: "11111111111111" })).toThrow();
 expect(() => validateFiscalProfile({ ...profile, regime: undefined })).toThrow();
 expect(() => validateFiscalProfile({ ...profile, regime: "3", simpleApportionment: undefined })).toThrow();
});
it("requires approved taxes and rejects XML/control injection and invalid amounts", () => {
 expect(validateFiscalService(service).amount).toBe(150);
 for (const patch of [{ amount: -1 }, { amount: 0.001 }, { nationalCode: "qualquer" }, { estimatedFederal: undefined }, { description: "\u0000" }]) expect(() => validateFiscalService({ ...service, ...patch })).toThrow();
});
it("binds confirmation to the reviewed invoice and validates recipient and competence", () => {
 const draft = validateInvoiceDraft({ service, recipientName: "Cliente Exemplo", recipientDocument: "52998224725", competence: "2026-10-11" });
 expect(invoiceReviewHash(draft)).not.toBe(invoiceReviewHash({ ...draft, recipientName: "Outra pessoa" }));
 expect(() => validateInvoiceDraft({ ...draft, competence: "2026-02-31" })).toThrow();
 expect(() => validateInvoiceDraft({ ...draft, recipientDocument: "12345678900" })).toThrow();
});
it("uses the official three digit municipal taxation code", () => {
 expect(validateFiscalService({ ...service, municipalCode: "001" }).municipalCode).toBe("001");
 for (const municipalCode of ["ABC", "1234"]) expect(() => validateFiscalService({ ...service, municipalCode })).toThrow("3 dígitos");
});
