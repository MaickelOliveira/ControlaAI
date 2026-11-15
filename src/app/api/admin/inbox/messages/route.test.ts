import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET } from "./route";
import { GET as GET_IMAGE } from "../image/route";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  history: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/lib/support-attachments", async original => ({
  ...await original<typeof import("@/lib/support-attachments")>(),
  downloadSupportImage: mocks.download,
}));
vi.mock("@/lib/auth", () => ({ getAdminSession: mocks.session }));
vi.mock("@/lib/conversations", async original => ({
  ...await original<typeof import("@/lib/conversations")>(),
  getHistory: mocks.history,
  markAsRead: mocks.read,
  deleteInboxMessage: mocks.remove,
}));

const url = "https://example.com/api/admin/inbox/messages";
const phone = "5511987654321";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ role: "admin" });
});

it("provides removal IDs only for sent messages and accepts those IDs for that conversation", async () => {
  mocks.history.mockResolvedValue([
    { role: "user", content: "Oi", ts: 1 },
    { role: "assistant", content: "Olá", ts: 2 },
  ]);
  const response = await GET(new NextRequest(`${url}?phone=${phone}`));
  const { messages } = await response.json();
  expect(messages[0].id).toBeUndefined();
  expect(messages[1].id).toMatch(/^[0-9a-f]{64}$/);
  const deletion = await DELETE(new NextRequest(url, {
    method: "DELETE",
    body: JSON.stringify({ phone, id: messages[1].id }),
  }));
  expect(deletion.status).toBe(200);
  expect(mocks.remove).toHaveBeenCalledWith(phone, messages[1].id);
});

it("requires an administrator before allowing deletion", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await DELETE(new NextRequest(url, { method: "DELETE" }))).status).toBe(401);
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("shows only private Inbox image links and serves media only for the conversation that received it", async () => {
  const file = "550e8400-e29b-41d4-a716-446655440000.jpg";
  const mediaUrl = `/api/admin/inbox/image?phone=${phone}&file=${file}`;
  mocks.history.mockResolvedValue([
    { role: "user", type: "image", content: "Legenda", ts: 1, mediaUrl },
    { role: "user", type: "image", content: "", ts: 2, mediaUrl: "https://outside.example/image.jpg" },
  ]);
  const response = await GET(new NextRequest(`${url}?phone=${phone}`));
  const { messages } = await response.json();
  expect(messages[0]).toMatchObject({ type: "image", mediaUrl, content: "Legenda" });
  expect(messages[1].mediaUrl).toBeUndefined();
  expect((await GET_IMAGE(new NextRequest(`https://example.com${mediaUrl.replace(phone, "5511999999999")}`))).status).toBe(404);
  expect(mocks.download).not.toHaveBeenCalled();

  mocks.download.mockResolvedValue(new Blob([Uint8Array.from([0xff, 0xd8, 0xff])]));
  const image = await GET_IMAGE(new NextRequest(`https://example.com${mediaUrl}`));
  expect(image.status).toBe(200);
  expect(image.headers.get("content-type")).toBe("image/jpeg");
  expect(image.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.download).toHaveBeenCalledWith(`whatsapp/${phone}`, file);

  mocks.session.mockResolvedValueOnce(null);
  expect((await GET_IMAGE(new NextRequest(`https://example.com${mediaUrl}`))).status).toBe(401);
});
