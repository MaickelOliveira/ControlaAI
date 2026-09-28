import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("./crypto-store", () => ({
  encryptField: (value: string | undefined) => value,
  decryptField: (value: string | undefined) => value,
}));

import { getConfig, saveConfig } from "./whatsapp-config";

describe("cache da configuracao do WhatsApp", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("deduplica leituras proximas, expira rapido e invalida ao salvar", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
    maybeSingle.mockResolvedValue({
      data: { data: { provider: "waba", wppBotNumber: "5511999999999" } },
      error: null,
    });
    upsert.mockResolvedValue({ error: null });

    const [first, second] = await Promise.all([getConfig(), getConfig()]);
    expect(first.provider).toBe("waba");
    expect(second.wppBotNumber).toBe("5511999999999");
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    await getConfig();
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_001);
    await getConfig();
    expect(maybeSingle).toHaveBeenCalledTimes(2);

    await saveConfig({ provider: "evolution", wppBotNumber: "5511888888888" });
    const saved = await getConfig();
    expect(saved).toMatchObject({ provider: "evolution", wppBotNumber: "5511888888888" });
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });
});
