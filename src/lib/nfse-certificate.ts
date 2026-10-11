import "server-only";
import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
let activeValidations = 0;
const invalid = "Confira o certificado A1, a senha, a validade e o CNPJ da empresa emissora.";
/** A malicious PFX may request billions of KDF iterations; never parse it on the request thread. */
export async function validateFiscalCertificate(bytes: Buffer, password: string, cnpj: string): Promise<string> {
  if (!bytes.length || bytes.length > 1_000_000 || password.length > 200 || !/^\d{14}$/.test(cnpj)) throw Error(invalid);
  if (activeValidations >= 2) throw Error("A validação está ocupada. Tente novamente em instantes.");
  activeValidations++;
  let child: ChildProcess | undefined;
  try {
    child = fork(path.join(process.cwd(), "scripts/nfse-certificate.cjs"), [], {
      stdio: ["ignore", "ignore", "ignore", "ipc"], execArgv: ["--max-old-space-size=64"],
    });
    const running = child;
    return await new Promise<string>((resolve, reject) => {
      let expiresAt: string | undefined;
      const timer = setTimeout(() => { running.kill("SIGKILL"); }, 4000);
      running.once("message", (result) => {
        const value = result as { expiresAt?: unknown };
        if (typeof value?.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt))) expiresAt = value.expiresAt;
      });
      running.once("error", () => { clearTimeout(timer); reject(Error(invalid)); });
      running.once("exit", (code) => { clearTimeout(timer); if (code === 0 && expiresAt) resolve(expiresAt); else reject(Error(invalid)); });
      // IPC keeps secrets out of shell arguments and logs. The child can be killed even inside OpenSSL.
      running.send({ bytes: bytes.toString("base64"), password, cnpj, forgePath: require.resolve("node-forge") });
    });
  } finally { if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); activeValidations--; }
}
