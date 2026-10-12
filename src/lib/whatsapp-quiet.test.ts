import { describe, expect, it } from "vitest";
import { canAskCreditPixQuestion } from "./whatsapp-quiet";

type Message = { role: "user" | "assistant"; ts: number; channel?: "waba" | "evolution" };
const now = Date.UTC(2026, 9, 12, 15, 0, 0);
const minute = 60_000;
const day = 24 * 60 * minute;
const user = (age: number, channel: Message["channel"] = "waba"): Message => ({ role: "user", ts: now - age, channel });
const assistant = (age: number): Message => ({ role: "assistant", ts: now - age, channel: "waba" });
const state = () => ({
  messages: [user(10 * minute)] as readonly Message[],
  lastActivity: now - 5 * minute,
  aiPaused: false,
  processing: false,
  pending: false,
  reserved: false,
});

describe("credit Pix questions wait for a verified WABA window and a quiet conversation", () => {
  it("allows a question only after a verified inbound and sufficient silence", () => {
    expect(canAskCreditPixQuestion(state(), now)).toBe(true);
  });

  it("opens exactly at 120000 milliseconds of silence", () => {
    const ready = { ...state(), lastActivity: now - 120_000 };
    expect(canAskCreditPixQuestion(ready, now)).toBe(true);
    expect(canAskCreditPixQuestion({ ...ready, lastActivity: now - 119_999 }, now)).toBe(false);
  });

  it("closes exactly at 24 hours after the latest verified inbound", () => {
    expect(canAskCreditPixQuestion({ ...state(), messages: [user(day - 1)] }, now)).toBe(true);
    expect(canAskCreditPixQuestion({ ...state(), messages: [user(day)] }, now)).toBe(false);
    expect(canAskCreditPixQuestion({ ...state(), messages: [user(day + 1)] }, now)).toBe(false);
  });

  it.each(["aiPaused", "processing", "pending", "reserved"] as const)("does not interrupt when %s is active", flag => {
    expect(canAskCreditPixQuestion({ ...state(), [flag]: true }, now)).toBe(false);
  });

  it("waits during recently observed input or audio even before a message is persisted", () => {
    expect(canAskCreditPixQuestion({ ...state(), lastActivity: now - 1_000 }, now)).toBe(false);
  });

  it.each(["user", "assistant"] as const)("uses recent %s messages when lastActivity is older", role => {
    const message = role === "user" ? user(119_999) : assistant(119_999);
    expect(canAskCreditPixQuestion({ ...state(), messages: [...state().messages, message] }, now)).toBe(false);
  });

  it("counts the exact silence boundary from the last outbound reply", () => {
    expect(canAskCreditPixQuestion({ ...state(), messages: [user(10 * minute), assistant(120_000)] }, now)).toBe(true);
  });

  it("does not renew an expired inbound window with an assistant reply", () => {
    expect(canAskCreditPixQuestion({ ...state(), messages: [user(day + minute), assistant(3 * minute)] }, now)).toBe(false);
    expect(canAskCreditPixQuestion({ ...state(), messages: [assistant(3 * minute)] }, now)).toBe(false);
  });

  it.each([undefined, "evolution"] as const)("does not open a WABA window from a legacy or non-WABA inbound: %s", channel => {
    const message: Message = { role: "user", ts: now - 10 * minute, ...(channel ? { channel } : {}) };
    expect(canAskCreditPixQuestion({ ...state(), messages: [message] }, now)).toBe(false);
    expect(canAskCreditPixQuestion({ ...state(), messages: [user(day + 1), message] }, now)).toBe(false);
  });

  it("recent activity on another channel still prevents interruption", () => {
    expect(canAskCreditPixQuestion({ ...state(), messages: [user(10 * minute), user(minute, "evolution")] }, now)).toBe(false);
    expect(canAskCreditPixQuestion({ ...state(), messages: [user(10 * minute), { role: "assistant", ts: now - minute }] }, now)).toBe(false);
  });

  it("uses the most recent verified inbound regardless of array order", () => {
    const messages = [user(10 * minute), assistant(5 * minute), user(day + minute)];
    expect(canAskCreditPixQuestion({ ...state(), messages }, now)).toBe(true);
    expect(canAskCreditPixQuestion({ ...state(), messages: [...messages].reverse() }, now)).toBe(true);
  });

  it("never treats a future inbound as opening the contact window", () => {
    expect(canAskCreditPixQuestion({ ...state(), messages: [user(-1)] }, now)).toBe(false);
    expect(canAskCreditPixQuestion({ ...state(), messages: [user(10 * minute), user(-1)] }, now)).toBe(false);
  });

  it("fails closed for future outbound or activity timestamps", () => {
    expect(canAskCreditPixQuestion({ ...state(), messages: [user(10 * minute), assistant(-1)] }, now)).toBe(false);
    expect(canAskCreditPixQuestion({ ...state(), lastActivity: now + 1 }, now)).toBe(false);
  });

  it.each([undefined, null, NaN, Infinity, -Infinity, 0, -1])("fails closed when lastActivity is missing or invalid: %s", lastActivity => {
    expect(canAskCreditPixQuestion({ ...state(), lastActivity }, now)).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])("fails closed for an invalid current time: %s", invalidNow => {
    expect(canAskCreditPixQuestion(state(), invalidNow)).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity, 0, -1])("fails closed for invalid message timestamps even alongside valid inbound: %s", ts => {
    expect(canAskCreditPixQuestion({ ...state(), messages: [user(10 * minute), { role: "assistant", ts }] }, now)).toBe(false);
  });

  it("fails closed without any message history", () => {
    expect(canAskCreditPixQuestion({ ...state(), messages: [] }, now)).toBe(false);
  });

  it("does not mutate the readonly activity history", () => {
    const messages = Object.freeze([Object.freeze(user(10 * minute)), Object.freeze(assistant(3 * minute))]);
    const input = Object.freeze({ ...state(), messages });
    const before = JSON.stringify(input);
    expect(canAskCreditPixQuestion(input, now)).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });
});
