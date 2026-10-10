import { afterEach, describe, expect, it, vi } from "vitest";
import { configured, acceptsCode, issueSession, validSession, sameOrigin } from "../../sandbox-app/access";

const code = "a".repeat(64);
function setup() {
  vi.stubEnv("POLP_SANDBOX_ENABLED", "true");
  vi.stubEnv("POLP_SANDBOX_CLIENT_ID", "test-client");
  vi.stubEnv("POLP_SANDBOX_CLIENT_SECRET", "test-secret");
  vi.stubEnv("SANDBOX_ACCESS_CODE", code);
  vi.stubEnv("SANDBOX_APP_URL", "https://sandbox.example.test");
}
afterEach(() => vi.unstubAllEnvs());

describe("isolated Polp sandbox access", () => {
  it("fails closed without an enabled sandbox and separate access code", () => {
    expect(configured()).toBe(false);
    setup();
    expect(configured()).toBe(true);
    vi.stubEnv("SANDBOX_ACCESS_CODE", "short");
    expect(configured()).toBe(false);
    expect(acceptsCode("short")).toBe(false);
  });
  it("rejects a deployment carrying production database or messaging credentials", () => {
    setup();
    for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "JWT_SECRET", "BREVO_API_KEY", "EVOLUTION_API_KEY"]) {
      vi.stubEnv(name, "production-credential");
      expect(configured()).toBe(false);
      vi.stubEnv(name, "");
    }
  });
  it("requires the exact private access code", () => {
    setup();
    expect(acceptsCode(code)).toBe(true);
    expect(acceptsCode("b".repeat(64))).toBe(false);
    expect(acceptsCode("")).toBe(false);
  });
  it("rejects forged and expired sessions and sessions from another installation", () => {
    setup();
    const token = issueSession(1000);
    expect(validSession(token, 1001)).toBe(true);
    expect(validSession(token, 1000 + 8 * 3600)).toBe(false);
    expect(validSession(token + "x", 1001)).toBe(false);
    expect(validSession(undefined, 1001)).toBe(false);
    vi.stubEnv("SANDBOX_ACCESS_CODE", "b".repeat(64));
    expect(validSession(token, 1001)).toBe(false);
  });
  it("only accepts writes from the configured test address", () => {
    setup();
    expect(sameOrigin(new Request("https://sandbox.example.test/api/login", {headers:{origin:"https://sandbox.example.test"}}))).toBe(true);
    expect(sameOrigin(new Request("https://sandbox.example.test/api/login", {headers:{origin:"https://evil.example"}}))).toBe(false);
    expect(sameOrigin(new Request("https://sandbox.example.test/api/login"))).toBe(false);
  });
});
