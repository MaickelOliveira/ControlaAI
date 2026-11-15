import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET } from "./route";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  history: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
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
