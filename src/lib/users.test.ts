import { describe, it, expect } from "vitest";
import { isTrialExpired, hasAccess, getMaxWppPhones, type User } from "./users";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1", phone: "5511987654321", name: "Teste", email: "teste@example.com",
    passwordHash: "hash", plan: "personal", billingCycle: "monthly", status: "trial", activeMode: "personal", locale: "pt-BR",
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

  it("blocks trial accounts because access requires confirmed payment", () => {
    const user = makeUser({ status: "trial", trialEndsAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(hasAccess(user)).toBe(false);
  });
});

describe("getMaxWppPhones", () => {
  it("allows unlimited family numbers when unset", () => {
    expect(getMaxWppPhones(makeUser({ maxWppPhones: undefined }))).toBe(1_000_000);
  });

  it("keeps family numbers unlimited for legacy configured limits", () => {
    expect(getMaxWppPhones(makeUser({ maxWppPhones: 3 }))).toBe(1_000_000);
  });
});
