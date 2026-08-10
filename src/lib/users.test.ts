import { describe, it, expect } from "vitest";
import { isTrialExpired, hasAccess, getWppPhones, getMaxWppPhones, type User } from "./users";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1", phone: "5511987654321", name: "Teste", email: "teste@example.com",
    passwordHash: "hash", plan: "personal", status: "trial", activeMode: "personal",
    trialEndsAt: new Date(Date.now() + 86_400_000).toISOString(), // amanhã
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("isTrialExpired", () => {
  it("is false for an active user regardless of trialEndsAt", () => {
    const user = makeUser({ status: "active", trialEndsAt: new Date(Date.now() - 86_400_000).toISOString() });
    expect(isTrialExpired(user)).toBe(false);
  });

  it("is false when trial end date is in the future", () => {
    const user = makeUser({ status: "trial", trialEndsAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(isTrialExpired(user)).toBe(false);
  });

  it("is true when trial end date is in the past", () => {
    const user = makeUser({ status: "trial", trialEndsAt: new Date(Date.now() - 86_400_000).toISOString() });
    expect(isTrialExpired(user)).toBe(true);
  });
});

describe("hasAccess", () => {
  it("denies access to an admin-deactivated user even mid-trial", () => {
    const user = makeUser({ status: "inactive", trialEndsAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(hasAccess(user)).toBe(false);
  });

  it("denies access when trial expired", () => {
    const user = makeUser({ status: "trial", trialEndsAt: new Date(Date.now() - 86_400_000).toISOString() });
    expect(hasAccess(user)).toBe(false);
  });

  it("grants access to an active user", () => {
    const user = makeUser({ status: "active" });
    expect(hasAccess(user)).toBe(true);
  });

  it("grants access to a user still mid-trial", () => {
    const user = makeUser({ status: "trial", trialEndsAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(hasAccess(user)).toBe(true);
  });
});

describe("getWppPhones", () => {
  it("returns wppPhones when present", () => {
    const user = makeUser({ wppPhones: ["5511987654321", "5511912345678"] });
    expect(getWppPhones(user)).toEqual(["5511987654321", "5511912345678"]);
  });

  it("falls back to the legacy wppPhone field", () => {
    const user = makeUser({ wppPhones: undefined, wppPhone: "5511987654321" });
    expect(getWppPhones(user)).toEqual(["5511987654321"]);
  });

  it("returns an empty array when no phone is linked", () => {
    const user = makeUser({ wppPhones: undefined, wppPhone: undefined });
    expect(getWppPhones(user)).toEqual([]);
  });
});

describe("getMaxWppPhones", () => {
  it("defaults to 1 when unset", () => {
    expect(getMaxWppPhones(makeUser({ maxWppPhones: undefined }))).toBe(1);
  });

  it("returns the configured limit", () => {
    expect(getMaxWppPhones(makeUser({ maxWppPhones: 3 }))).toBe(3);
  });
});
