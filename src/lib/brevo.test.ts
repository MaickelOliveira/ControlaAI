import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  localizedAccountPath,
  sendFirstAccessCodeEmail,
  sendFirstAccessLinkEmail,
  sendPasswordResetEmail,
} from "./brevo";

const originalEnv = { ...process.env };

function sentEmail(): Record<string, unknown> {
  const fetchMock = vi.mocked(fetch);
  const init = fetchMock.mock.calls.at(-1)?.[1];
  return JSON.parse(String(init?.body));
}

describe("Spanish account emails", () => {
  beforeEach(() => {
    process.env.BREVO_API_KEY = "test-key";
    process.env.BREVO_SENDER_EMAIL = "test@zelo.example";
    process.env.NEXT_PUBLIC_APP_URL = "https://zelogestaointeligente.com.br";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("uses locale-specific account pages", () => {
    expect(localizedAccountPath("/primeiro-acesso", "es")).toBe("/es/primeiro-acesso");
    expect(localizedAccountPath("/esqueci-senha", "es")).toBe("/es/esqueci-senha");
    expect(localizedAccountPath("/esqueci-senha", "pt-PT")).toBe("/pt/esqueci-senha");
    expect(localizedAccountPath("/esqueci-senha", "pt-BR")).toBe("/esqueci-senha");
  });

  it("sends first-access instructions entirely in Spanish", async () => {
    await sendFirstAccessLinkEmail({ email: "ana@example.com", name: "Ana", setupId: "token 1", locale: "es" });
    const email = sentEmail();
    expect(email.subject).toBe("Crea tu contraseña de acceso a Zelo");
    expect(email.htmlContent).toContain('<html lang="es">');
    expect(email.htmlContent).toContain("https://zelogestaointeligente.com.br/es/primeiro-acesso?token=token%201");
    expect(email.htmlContent).toContain("Tu pago fue confirmado");
  });

  it("sends the first-access code in Spanish", async () => {
    await sendFirstAccessCodeEmail({ email: "ana@example.com", name: "Ana", code: "123456", locale: "es" });
    const email = sentEmail();
    expect(email.subject).toBe("Código de confirmación del primer acceso");
    expect(email.htmlContent).toContain("Ingresa este código en la página que abriste");
  });

  it("sends password recovery and its destination in Spanish", async () => {
    await sendPasswordResetEmail({ email: "ana@example.com", name: "Ana", code: "654321", resetId: "reset 1", locale: "es" });
    const email = sentEmail();
    expect(email.subject).toBe("Restablecimiento de contraseña");
    expect(email.htmlContent).toContain("Usa este código para crear una nueva contraseña");
    expect(email.htmlContent).toContain("https://zelogestaointeligente.com.br/es/esqueci-senha?rid=reset%201&amp;email=ana%40example.com");
  });
});
