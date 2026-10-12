import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  begin: vi.fn(), finish: vi.fn(), handle: vi.fn(), dedup: vi.fn(), signature: vi.fn(),
  media: vi.fn(), transcribe: vi.fn(), config: vi.fn(), user: vi.fn(),
}));
vi.mock("@/lib/whatsapp-activity", () => ({ beginWhatsAppActivity: mocks.begin }));
vi.mock("@/lib/message-handler", () => ({ handleIncomingMessage: mocks.handle }));
vi.mock("@/lib/webhook-dedup", () => ({ alreadyProcessed: mocks.dedup }));
vi.mock("@/lib/waba", () => ({ downloadMedia: mocks.media, verifySignature: mocks.signature, verifyToken: vi.fn() }));
vi.mock("@/lib/ai-processor", () => ({ transcribeAudio: mocks.transcribe }));
vi.mock("@/lib/whatsapp-config", () => ({ getConfig: mocks.config }));
vi.mock("@/lib/wpp-phone-links", () => ({ getUserIdByPhone: mocks.user }));
import { POST } from "./route";

const from = "5511999990000";
const questionId = "00000000-0000-4000-8000-000000000099";
const textMessage = (id = "fictional-message") => ({ id, from, type: "text", text: { body: "mensagem fictícia" } });
const request = (messages: unknown[]) => new NextRequest("https://zelo.test/api/webhook/waba", {
  method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${"0".repeat(64)}` },
  body: JSON.stringify({ entry: [{ changes: [{ value: { messages, contacts: [{ profile: { name: "Contato fictício" } }] } }] }] }),
});
const settled = async (assertion: () => void) => vi.waitFor(assertion, { timeout: 150, interval: 1 });
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.signature.mockResolvedValue(true);
  mocks.config.mockResolvedValue({ waba: { appSecret: "fake-app-secret" } });
  mocks.finish.mockResolvedValue(undefined);
  mocks.begin.mockResolvedValue({ finish: mocks.finish });
  mocks.dedup.mockResolvedValue(false);
  mocks.handle.mockResolvedValue(undefined);
  mocks.media.mockResolvedValue({ buffer: Buffer.from("fake-media"), mimeType: "audio/ogg" });
  mocks.transcribe.mockResolvedValue("áudio fictício");
  mocks.user.mockResolvedValue("fictional-user");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it("awaits inbound activity staging before ACK, dedup or handler and releases after handling", async () => {
  let release!: (value: { finish: typeof mocks.finish }) => void;
  mocks.begin.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  let acknowledged = false;
  const response = POST(request([textMessage()])).then(value => { acknowledged = true; return value; });
  await settled(() => expect(mocks.begin).toHaveBeenCalledWith(from, "inbound"));
  expect(acknowledged).toBe(false);
  expect(mocks.dedup).not.toHaveBeenCalled();
  expect(mocks.handle).not.toHaveBeenCalled();
  release({ finish: mocks.finish });
  expect((await response).status).toBe(200);
  await settled(() => expect(mocks.finish).toHaveBeenCalledOnce());
  expect(mocks.handle).toHaveBeenCalledWith(expect.objectContaining({ from, text: "mensagem fictícia", channel: "waba" }));
  expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(mocks.handle.mock.invocationCallOrder[0]);
  expect(mocks.finish.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.handle.mock.invocationCallOrder[0]);
});

it("returns generic 503 when begin fails without marking a message processed", async () => {
  mocks.begin.mockRejectedValueOnce(Error("PRIVATE_DATABASE_DETAIL"));
  const response = await POST(request([textMessage()]));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("PRIVATE_DATABASE_DETAIL");
  expect(mocks.dedup).not.toHaveBeenCalled();
  expect(mocks.handle).not.toHaveBeenCalled();
});

it("stages the entire valid batch before processing and releases earlier leases if staging fails", async () => {
  const firstFinish = vi.fn().mockResolvedValue(undefined);
  mocks.begin.mockResolvedValueOnce({ finish: firstFinish }).mockRejectedValueOnce(Error("PRIVATE_STAGE_FAILURE"));
  const response = await POST(request([textMessage("first"), { ...textMessage("second"), from: "5511999990001" }]));
  expect(response.status).toBe(503);
  expect(firstFinish).toHaveBeenCalledOnce();
  expect(mocks.dedup).not.toHaveBeenCalled();
  expect(mocks.handle).not.toHaveBeenCalled();
  expect(await response.text()).not.toContain("PRIVATE_STAGE_FAILURE");
});

it("releases the exact staged lease even for a duplicate delivery", async () => {
  mocks.dedup.mockResolvedValueOnce(true);
  expect((await POST(request([textMessage()]))).status).toBe(200);
  await settled(() => expect(mocks.finish).toHaveBeenCalledOnce());
  expect(mocks.begin).toHaveBeenCalledWith(from, "inbound");
  expect(mocks.handle).not.toHaveBeenCalled();
});

it("releases the lease when the message handler fails", async () => {
  mocks.handle.mockRejectedValueOnce(Error("fake handler failure"));
  await POST(request([textMessage()]));
  await settled(() => expect(mocks.finish).toHaveBeenCalledOnce());
});

it("protects the conversation before media download and transcription and preserves WABA source", async () => {
  await POST(request([{ id: "audio", from, type: "audio", audio: { id: "fake-audio-id" } }]));
  await settled(() => expect(mocks.finish).toHaveBeenCalledOnce());
  expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(mocks.media.mock.invocationCallOrder[0]);
  expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(mocks.transcribe.mock.invocationCallOrder[0]);
  expect(mocks.handle).toHaveBeenCalledWith(expect.objectContaining({ text: "áudio fictício", channel: "waba" }));
});

it("releases protection when media cannot be downloaded", async () => {
  mocks.media.mockRejectedValueOnce(Error("fake media failure"));
  await POST(request([{ id: "audio", from, type: "audio", audio: { id: "fake-audio-id" } }]));
  await settled(() => expect(mocks.finish).toHaveBeenCalledOnce());
  expect(mocks.handle).not.toHaveBeenCalled();
});

it("rejects an invalid signature without touching activity or processing", async () => {
  mocks.signature.mockResolvedValueOnce(false);
  expect((await POST(request([textMessage()]))).status).toBe(403);
  expect(mocks.begin).not.toHaveBeenCalled();
  expect(mocks.dedup).not.toHaveBeenCalled();
  expect(mocks.handle).not.toHaveBeenCalled();
});

it("parses only a structured credit Pix button as the identified confirmation", async () => {
  await POST(request([{ id: "button", from, type: "interactive", interactive: {
    type: "button_reply", button_reply: { id: `zelo-credit-pix:${questionId}:yes`, title: "Sim, foi isso" },
  } }]));
  await settled(() => expect(mocks.handle).toHaveBeenCalledWith(expect.objectContaining({
    from, channel: "waba", creditPixAnswer: { questionId, confirmed: true },
  })));
  await settled(() => expect(mocks.finish).toHaveBeenCalledOnce());
});

it("leaves a generic text sim ordinary instead of inventing financial confirmation", async () => {
  await POST(request([{ ...textMessage(), text: { body: "sim" } }]));
  await settled(() => expect(mocks.handle).toHaveBeenCalledOnce());
  const input = mocks.handle.mock.calls[0][0];
  expect(input).toMatchObject({ text: "sim", channel: "waba" });
  expect(input.creditPixAnswer).toBeUndefined();
});
