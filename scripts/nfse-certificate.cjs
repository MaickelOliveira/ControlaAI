// Isolated certificate validation. No certificate, password or private key is returned/logged.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS subprocess, outside the Next bundle. */
const { createSecureContext } = require('node:tls');
const { X509Certificate, createPrivateKey } = require('node:crypto');
process.once('message', workerData => {
try {
  const forge = require(workerData.forgePath);
  const bytes = Buffer.from(workerData.bytes, 'base64');
  createSecureContext({ pfx: bytes, passphrase: workerData.password });
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytes.toString('binary')), false, workerData.password);
  const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const keys = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
  const key = keys[0]?.key;
  if (!key) throw Error();
  const privateKey = createPrivateKey(forge.pki.privateKeyToPem(key));
  const leaf = certs.find(bag => bag.cert && new X509Certificate(forge.pki.certificateToPem(bag.cert)).checkPrivateKey(privateKey))?.cert;
  if (!leaf) throw Error();
  const cert = new X509Certificate(forge.pki.certificateToPem(leaf));
  if (Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) <= Date.now()) throw Error();
  const cn = String(leaf.subject.getField('CN')?.value || '');
  const documents = cn.match(/(?:^|\D)(\d{14})(?=\D|$)/g) || [];
  if (!documents.some(value => value.replace(/\D/g, '') === workerData.cnpj)) throw Error();
  process.send({ expiresAt: new Date(cert.validTo).toISOString() }, () => process.exit(0));
} catch { process.send({ error: true }, () => process.exit(1)); }
});
