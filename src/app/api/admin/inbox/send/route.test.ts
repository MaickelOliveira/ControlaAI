import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  sendText: vi.fn().mockResolvedValue(true),
  sendFile: vi.fn().mockResolvedValue(true),
  pause: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAdminSession: mocks.session }));
vi.mock("@/lib/whatsapp", () => ({ sendText: mocks.sendText, sendFile: mocks.sendFile }));
vi.mock("@/lib/conversations", () => ({ setAiPaused: mocks.pause }));

const url = "https://example.com/api/admin/inbox/send";
const phone = "5511987654321";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ role: "admin" });
});

it("keeps paragraphs and converts copied Markdown to WhatsApp formatting", async () => {
  const response = await POST(new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, content: "1. **Entrar**\r\n\r\n2. [Abrir a Zelo](https://example.com/login)" }),
  }));
  expect(response.status).toBe(200);
  expect(mocks.sendText).toHaveBeenCalledWith(phone, "1. *Entrar*\n\n2. Abrir a Zelo (https://example.com/login)");
  expect(mocks.pause).toHaveBeenCalledWith(phone, true);
});

it("includes a valid attached image and optional caption in one WhatsApp message", async () => {
  const form = new FormData();
  form.set("phone", phone);
  form.set("content", "**Comprovante**\nSegue a imagem.");
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  form.set("image", new File([png], "foto.png", { type: "image/png" }));
  const response = await POST(new NextRequest(url, { method: "POST", body: form }));
  expect(response.status).toBe(200);
  expect(mocks.sendFile).toHaveBeenCalledWith(phone, Buffer.from(png), "imagem.png", "image/png", "*Comprovante*\nSegue a imagem.");
  expect(mocks.sendText).not.toHaveBeenCalled();
});

it("rejects files whose contents do not match the type", async () => {
  const form = new FormData();
  form.set("phone", phone);
  form.set("image", new File(["example"], "foto.png", { type: "image/png" }));
  expect((await POST(new NextRequest(url, { method: "POST", body: form }))).status).toBe(400);
  expect(mocks.sendFile).not.toHaveBeenCalled();
});
