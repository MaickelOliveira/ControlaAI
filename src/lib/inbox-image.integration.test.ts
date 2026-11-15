import { expect, it, vi } from "vitest";
import { handleIncomingMessage, type IncomingMessage } from "./message-handler";

const state = vi.hoisted(() => ({ upload: vi.fn(), log: vi.fn(), paused: vi.fn(), send: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase", async original => ({
  ...await original<typeof import("./supabase")>(),
  getSupabase: () => ({ storage: { from: () => ({ upload: state.upload }) } }),
}));
vi.mock("./conversations", async original => ({
  ...await original<typeof import("./conversations")>(),
  addMessage: state.log,
  getAiPaused: state.paused,
}));
vi.mock("./whatsapp-company", () => ({
  withWhatsAppCompany: (message: IncomingMessage, next: (message: IncomingMessage) => Promise<void>) => next(message),
}));
vi.mock("./whatsapp", () => ({ sendText: state.send }));

it("stores the received image before honoring the AI pause and preserves the caption", async () => {
  state.upload.mockResolvedValue({ error: null });
  state.paused.mockResolvedValue(true);
  const from = "5511987654321";
  const file = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  await handleIncomingMessage({
    from, text: "", isFileMessage: true, fileBuffer: file, fileCaption: "Foto de teste", channel: "waba",
  });
  expect(state.upload).toHaveBeenCalledWith(expect.stringMatching(/^whatsapp\/5511987654321\/[0-9a-f-]+\.jpg$/), expect.any(Uint8Array),
    expect.objectContaining({contentType:"image/jpeg"}));
  expect(state.log).toHaveBeenCalledWith(from, expect.objectContaining({
    role: "user", content: "Foto de teste", type: "image",
    mediaUrl: expect.stringMatching(/^\/api\/admin\/inbox\/image\?phone=5511987654321&file=/),
  }), expect.any(Object));
  expect(state.log.mock.invocationCallOrder[0]).toBeLessThan(state.paused.mock.invocationCallOrder[0]);
  expect(state.send).not.toHaveBeenCalled();
});
