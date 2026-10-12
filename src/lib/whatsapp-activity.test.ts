import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ rpc }) }));
import { beginWhatsAppActivity, claimWhatsAppQuestion } from "./whatsapp-activity";
import { phoneVariants } from "./conversations";
const phone = "11 98765-4321";
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("OPEN_FINANCE_CREDIT_PIX_QUESTIONS_ENABLED", "true");
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });

it.each([undefined, "false", "TRUE", "1"])("does no RPC or timer work when the feature gate is %s", async flag => {
  vi.stubEnv("OPEN_FINANCE_CREDIT_PIX_QUESTIONS_ENABLED", flag);
  const lease = await beginWhatsAppActivity(phone, "inbound");
  await lease.finish();
  expect(await claimWhatsAppQuestion(phone)).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([false, null, "true", 1])("requires strict true to begin an enabled activity: %s", async data => {
  rpc.mockResolvedValueOnce({ data, error: null });
  await expect(beginWhatsAppActivity(phone, "inbound")).rejects.toThrow("WPP_ACTIVITY_UNAVAILABLE");
  expect(vi.getTimerCount()).toBe(0);
});

it("redacts database failure details", async () => {
  rpc.mockRejectedValueOnce(Error("private phone and database details"));
  await expect(beginWhatsAppActivity(phone, "notice")).rejects.toThrow(/^WPP_ACTIVITY_UNAVAILABLE$/);
  rpc.mockResolvedValueOnce({ data: true, error: { message: "private details" } });
  await expect(beginWhatsAppActivity(phone, "notice")).rejects.toThrow(/^WPP_ACTIVITY_UNAVAILABLE$/);
});

it("uses canonical aliases and independent UUIDs for overlapping inbound and notice work", async () => {
  const [one, two] = await Promise.all([beginWhatsAppActivity(phone, "inbound"), beginWhatsAppActivity("551187654321", "notice")]);
  const first = rpc.mock.calls[0][1], second = rpc.mock.calls[1][1];
  expect(first).toMatchObject({ p_phone: phoneVariants(phone)[0], p_kind: "inbound" });
  expect(first.p_variants).toEqual(phoneVariants(phone));
  expect(second).toMatchObject({ p_phone: first.p_phone, p_kind: "notice" });
  expect(first.p_token).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
  expect(second.p_token).not.toBe(first.p_token);
  await one.finish(); await two.finish();
  expect(rpc.mock.calls.slice(2)).toEqual([
    ["zelo_wpp_activity_finish", { p_phone: first.p_phone, p_token: first.p_token, p_variants: first.p_variants }],
    ["zelo_wpp_activity_finish", { p_phone: second.p_phone, p_token: second.p_token, p_variants: second.p_variants }],
  ]);
});

it("renews the same nonce every 60 seconds and finishes once without retaining its timer", async () => {
  const lease = await beginWhatsAppActivity(phone, "inbound");
  const params = rpc.mock.calls[0][1];
  await vi.advanceTimersByTimeAsync(59_999); expect(rpc).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); expect(rpc).toHaveBeenLastCalledWith("zelo_wpp_activity_begin", params);
  await lease.finish(); await lease.finish();
  expect(rpc).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(180_000); expect(rpc).toHaveBeenCalledTimes(3);
});

it("stops heartbeat even if finishing fails", async () => {
  const lease = await beginWhatsAppActivity(phone, "notice");
  rpc.mockRejectedValueOnce(Error("private database error"));
  await expect(lease.finish()).rejects.toThrow(/^WPP_ACTIVITY_UNAVAILABLE$/);
  expect(vi.getTimerCount()).toBe(0);
});

it("handles failed renewal without an unhandled rejection and still releases its exact nonce", async () => {
  const lease = await beginWhatsAppActivity(phone, "inbound");
  const { p_phone, p_token, p_variants } = rpc.mock.calls[0][1];
  rpc.mockRejectedValueOnce(Error("private renewal error"));
  await vi.advanceTimersByTimeAsync(60_000);
  await expect(lease.finish()).rejects.toThrow(/^WPP_ACTIVITY_UNAVAILABLE$/);
  expect(rpc).toHaveBeenLastCalledWith("zelo_wpp_activity_finish", { p_phone, p_token, p_variants });
  expect(vi.getTimerCount()).toBe(0);
});

it("waits for an in-flight renewal before deleting so the old nonce cannot be resurrected", async () => {
  const lease = await beginWhatsAppActivity(phone, "inbound");
  let resolve!: (value: { data: boolean; error: null }) => void;
  rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await vi.advanceTimersByTimeAsync(60_000);
  const finishing = lease.finish();
  expect(rpc.mock.calls.map(call => call[0])).toEqual(["zelo_wpp_activity_begin", "zelo_wpp_activity_begin"]);
  resolve({ data: true, error: null });
  await finishing;
  expect(rpc.mock.calls.at(-1)?.[0]).toBe("zelo_wpp_activity_finish");
  expect(vi.getTimerCount()).toBe(0);
});

it("claims a question with all aliases, checks its exact nonce, and never renews its 30-second reservation", async () => {
  const lease = await claimWhatsAppQuestion(phone);
  expect(lease).not.toBeNull();
  const params = rpc.mock.calls[0][1];
  expect(rpc).toHaveBeenCalledWith("zelo_wpp_question_claim", { p_phone: phoneVariants(phone)[0], p_variants: phoneVariants(phone), p_token: expect.any(String) });
  expect(await lease!.ready()).toBe(true);
  expect(rpc).toHaveBeenLastCalledWith("zelo_wpp_question_ready", params);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(rpc).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  await lease!.finish();
  expect(rpc).toHaveBeenLastCalledWith("zelo_wpp_activity_finish", params);
  expect(await lease!.ready()).toBe(false);
});

it.each([false, null, "true"])("fails closed for non-true question claim or readiness: %s", async data => {
  rpc.mockResolvedValueOnce({ data, error: null });
  expect(await claimWhatsAppQuestion(phone)).toBeNull();
  const lease = await claimWhatsAppQuestion(phone);
  rpc.mockResolvedValueOnce({ data, error: null });
  expect(await lease!.ready()).toBe(false);
  await lease!.finish();
});

it("requires the feature to remain enabled before declaring a reserved question ready", async () => {
  const lease = await claimWhatsAppQuestion(phone);
  vi.stubEnv("OPEN_FINANCE_CREDIT_PIX_QUESTIONS_ENABLED", "false");
  expect(await lease!.ready()).toBe(false);
  expect(rpc).toHaveBeenCalledTimes(1);
  await lease!.finish();
  expect(rpc.mock.calls.at(-1)?.[0]).toBe("zelo_wpp_activity_finish");
});

it("does not query malformed canonical phone numbers", async () => {
  await expect(beginWhatsAppActivity("", "inbound")).rejects.toThrow(/^WPP_ACTIVITY_UNAVAILABLE$/);
  await expect(claimWhatsAppQuestion("bad")).rejects.toThrow(/^WPP_ACTIVITY_UNAVAILABLE$/);
  expect(rpc).not.toHaveBeenCalled();
});
