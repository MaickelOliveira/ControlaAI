import { expect, it, vi } from "vitest";
import forge from "node-forge";
vi.mock("server-only", () => ({}));
import { validateFiscalCertificate } from "./nfse-certificate";
function fixture() {
 const keys = forge.pki.rsa.generateKeyPair(2048), cert = forge.pki.createCertificate();
 cert.publicKey = keys.publicKey; cert.serialNumber = "01";
 cert.validity.notBefore = new Date(Date.now() - 60_000); cert.validity.notAfter = new Date(Date.now() + 86400_000);
 cert.setSubject([{ name: "commonName", value: "Empresa Teste:11222333000181" }]); cert.setIssuer(cert.subject.attributes); cert.sign(keys.privateKey, forge.md.sha256.create());
 return forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, "fixture-only", { algorithm: "aes256" });
}
it("validates key, password, document and validity without returning private material", async () => {
 const bytes = Buffer.from(forge.asn1.toDer(fixture()).getBytes(), "binary");
 expect(Date.parse(await validateFiscalCertificate(bytes, "fixture-only", "11222333000181"))).toBeGreaterThan(Date.now());
 await expect(validateFiscalCertificate(bytes, "wrong", "11222333000181")).rejects.toThrow("Confira");
 await expect(validateFiscalCertificate(bytes, "fixture-only", "11444777000161")).rejects.toThrow("Confira");
});
it("kills costly native derivation while the request event loop stays responsive", async () => {
 const asn = fixture();
 const root = asn.value as forge.asn1.Asn1[], mac = root[2].value as forge.asn1.Asn1[];
 mac[2].value = "\x7f\xff\xff\xff";
 const bytes = Buffer.from(forge.asn1.toDer(asn).getBytes(), "binary"), started = Date.now();
 const check = validateFiscalCertificate(bytes, "fixture-only", "11222333000181");
 await new Promise(resolve => setTimeout(resolve, 30));
 expect(Date.now() - started).toBeLessThan(1000);
 await expect(check).rejects.toThrow("Confira");
 expect(Date.now() - started).toBeLessThan(5500);
}, 8000);
