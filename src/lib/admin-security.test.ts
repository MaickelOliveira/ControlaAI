import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { SignJWT, decodeJwt } from "jose";

const state = vi.hoisted(() => ({
  row: null as { admin_email: string | null; admin_password_hash: string | null } | null,
  readError: null as unknown,
  writeError: null as unknown,
  token: "",
  cookieName: "ca_admin",
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === state.cookieName ? { value: state.token } : undefined }) }));
vi.mock("./users", () => ({ getUserById: vi.fn(), hasAccess: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row, error: state.readError }) }) }),
  upsert: async (row: { admin_email: string; admin_password_hash: string }) => {
    if (!state.writeError) state.row = row;
    return { error: state.writeError };
  },
}) }) }));
import { authenticateAdmin, loadAdmin, saveAdmin, setAdminPassword, validateAdmin } from "./admin";
import { getAdminSession, signToken } from "./auth";

const email = "fixture-admin@example.test";
const password = "FixtureCurrentPassword12";
const key = "fixture-admin-session-signing-key-test-only";
const payload = { sub: "admin", name: "Administrador", email, plan: "admin", role: "admin" as const };
const rawToken = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(new TextEncoder().encode(key));
const tokenFor = async () => {
  const version = await authenticateAdmin(email, password);
  expect(typeof version).toBe("string");
  return signToken(payload, version!);
};

beforeEach(async () => {
  vi.stubEnv("JWT_SECRET", key);
  vi.stubEnv("ADMIN_BOOTSTRAP_EMAIL", "fixture-bootstrap@example.test");
  vi.stubEnv("ADMIN_BOOTSTRAP_PASSWORD", "FixtureBootstrapPassword12");
  state.row = { admin_email: email, admin_password_hash: await bcrypt.hash(password, 4) };
  state.readError = null;
  state.writeError = null;
  state.token = "";
  state.cookieName = "ca_admin";
});
afterEach(() => vi.unstubAllEnvs());

describe("admin credential version and fail-closed storage", () => {
  it("accepts a current signed administrator session without exposing its credential", async () => {
    state.token = await tokenFor();
    expect((await getAdminSession())?.email).toBe(email);
    const claims = decodeJwt(state.token);
    expect(claims.adminVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(claims)).not.toContain(password);
    expect(JSON.stringify(claims)).not.toContain(state.row!.admin_password_hash);
  });

  it.each(["password", "email"])("invalidates the previous JWT immediately after changing the admin %s", async kind => {
    state.token = await tokenFor();
    const nextPassword = "FixtureNextPassword123";
    const nextEmail = kind === "email" ? "fixture-new-admin@example.test" : email;
    await setAdminPassword(nextEmail, nextPassword);
    expect(await getAdminSession()).toBeNull();
    const version = await authenticateAdmin(nextEmail, nextPassword);
    state.token = await signToken({ ...payload, email: nextEmail }, version!);
    expect((await getAdminSession())?.email).toBe(nextEmail);
  });

  it("rejects a legacy token without a credential version", async () => {
    state.token = await rawToken(payload);
    expect(await getAdminSession()).toBeNull();
  });

  it.each([
    { role: "client", sub: "admin" },
    { role: "admin", sub: "fixture-client" },
    { role: "admin", sub: "admin", email: "fixture-other@example.test" },
  ])("rejects a wrong role, subject or administrator identity", async wrong => {
    const version = await authenticateAdmin(email, password);
    state.token = await rawToken({ ...payload, adminVersion: version, ...wrong });
    expect(await getAdminSession()).toBeNull();
  });

  it("rejects an attested login if credentials change between validation and signing", async () => {
    const oldVersion = await authenticateAdmin(email, password);
    await setAdminPassword(email, "FixtureNextPassword123");
    await expect(signToken(payload, oldVersion!)).rejects.toThrow("ADMIN_SESSION_UNAVAILABLE");
  });

  it("uses bootstrap credentials only when the database record genuinely does not exist", async () => {
    state.row = null;
    expect(await validateAdmin("fixture-bootstrap@example.test", "FixtureBootstrapPassword12")).toBe(true);
    state.row = { admin_email: null, admin_password_hash: null };
    expect(await validateAdmin("fixture-bootstrap@example.test", "FixtureBootstrapPassword12")).toBe(false);
  });

  it("does not fall back to bootstrap on a database error", async () => {
    state.readError = { message: "fixture-sensitive-database-error" };
    await expect(loadAdmin()).rejects.toThrow("ADMIN_CONFIGURATION_UNAVAILABLE");
    await expect(validateAdmin("fixture-bootstrap@example.test", "FixtureBootstrapPassword12")).rejects.toThrow("ADMIN_CONFIGURATION_UNAVAILABLE");
  });

  it("denies an otherwise current session when credential storage is unavailable", async () => {
    state.token = await tokenFor();
    state.readError = { message: "fixture-sensitive-database-error" };
    expect(await getAdminSession()).toBeNull();
  });

  it("throws a generic error on failed saving and leaves the current credential intact", async () => {
    const previous = { ...state.row! };
    state.writeError = { message: "fixture-sensitive-database-error" };
    await expect(saveAdmin({ adminEmail: email, adminPasswordHash: "fixture-new-hash" })).rejects.toThrow("ADMIN_CONFIGURATION_UNAVAILABLE");
    expect(state.row).toEqual(previous);
  });
});
