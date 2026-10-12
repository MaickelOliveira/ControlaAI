import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only",()=>({}));

const m = vi.hoisted(() => ({ config: vi.fn(), fetch: vi.fn() }));
vi.mock("./whatsapp-config", () => ({ getConfig: m.config }));
import { sendCreditPixButtons } from "./waba";

const phone = "5511999990000";
const question = "00000000-0000-4000-8000-000000000003";
const config = { provider: "waba", waba: { phoneNumberId: "fixture-number", accessToken: "fixture-token" } };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", m.fetch);
  m.config.mockResolvedValue(config);
  m.fetch.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.fixture" }] }), { status: 200 }));
});
afterEach(() => vi.unstubAllGlobals());

describe("credit Pix reply button transport", () => {
  it("sends exactly two typed reply buttons, never a template, and accepts a message ID", async () => {
    expect(await sendCreditPixButtons(phone, question, "Conferência fictícia")).toBe(true);
    expect(m.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = m.fetch.mock.calls[0];
    expect(url).toMatch(/^https:\/\/graph\.facebook\.com\/v\d+\.0\/fixture-number\/messages$/);
    expect(options.method).toBe("POST");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: phone, type: "interactive", interactive: { type: "button", body: { text: "Conferência fictícia" } } });
    expect(body.interactive.action.buttons.map((button: { reply: { id: string } }) => button.reply.id)).toEqual([
      `zelo-credit-pix:${question}:yes`, `zelo-credit-pix:${question}:no`,
    ]);
    expect(body.template).toBeUndefined();
  });
  it.each([{}, null, { messages: [] }, { messages: [{}] }, { messages: [{ id: "" }] },
    { messages: [{ id: "wamid.fixture" }], error: { message: "rejected" } }])("does not treat a 200 response without acceptance as success: %j", async result => {
    m.fetch.mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
    expect(await sendCreditPixButtons(phone, question, "Conferência fictícia")).toBe(false);
    expect(m.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([123, {}, true, "   "])("requires a nonempty string message ID, not %j", async id => {
    m.fetch.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id }] }), { status: 200 }));
    expect(await sendCreditPixButtons(phone, question, "Conferência fictícia")).toBe(false);
  });
  it.each(["", "not-json"])("an empty or unreadable response is uncertain with no second request: %j", async body => {
    m.fetch.mockResolvedValue(new Response(body, { status: 200 }));
    expect(await sendCreditPixButtons(phone, question, "Conferência fictícia")).toBe(false);
    expect(m.fetch).toHaveBeenCalledTimes(1);
  });
  it("does not retry a failed network request", async () => {
    m.fetch.mockRejectedValue(Error("connection lost"));
    expect(await sendCreditPixButtons(phone, question, "Conferência fictícia")).toBe(false);
    expect(m.fetch).toHaveBeenCalledTimes(1);
  });
  it("a non-2xx response never succeeds even with an ID", async () => {
    m.fetch.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.fixture" }] }), { status: 503 }));
    expect(await sendCreditPixButtons(phone, question, "Conferência fictícia")).toBe(false);
  });
  it.each([{ provider: "evolution", waba: config.waba }, { provider: "waba", waba: {} }])("does not call a transport with disabled/missing WABA credentials", async value => {
    m.config.mockResolvedValue(value);
    expect(await sendCreditPixButtons(phone, question, "Conferência fictícia")).toBe(false);
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it.each([["bad-id", "message"], [question, "x".repeat(1025)]])("rejects an invalid payload before transport", async (id, message) => {
    expect(await sendCreditPixButtons(phone, id, message)).toBe(false);
    expect(m.fetch).not.toHaveBeenCalled();
  });
});
