import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const upsert = vi.fn();

vi.mock("./supabase", () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
      upsert,
    }),
  }),
}));

import { sendAdminSupportMessage } from "./support-conversations";

describe("admin support messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: null, error: null });
    upsert.mockResolvedValue({ error: null });
  });

  it("stores and returns an image sent by the administrator", async () => {
    const attachment = {
      type: "image" as const,
      fileName: "550e8400-e29b-41d4-a716-446655440000.jpg",
      mimeType: "image/jpeg" as const,
      size: 1024,
    };

    const message = await sendAdminSupportMessage("user-1", "Veja esta imagem", attachment);

    expect(message).toMatchObject({
      sender: "admin",
      text: "Veja esta imagem",
      attachment,
    });
    expect(message.ts).toEqual(expect.any(Number));
    expect(upsert).toHaveBeenCalledWith({
      user_id: "user-1",
      data: expect.objectContaining({
        messages: [message],
        unreadUser: true,
      }),
    });
  });
});
