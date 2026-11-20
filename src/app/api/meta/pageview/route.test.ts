import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn(async () => ({ sent: true as const })));
vi.mock("@/lib/meta-conversions", () => ({ sendMetaPageView: send }));

import { POST } from "./route";

const ID = "3f2c8e1a-4b5d-4c6e-9f70-1a2b3c4d5e6f";

function request(body: unknown, headers: Record<string, string> = {}, ip = "203.0.113.7") {
  return new NextRequest("https://zelogestaointeligente.com.br/api/meta/pageview", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, "user-agent": "Teste/1.0", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/meta/pageview", () => {
  beforeEach(() => send.mockClear());

  it("envia a visita ao servidor da Meta com IP e navegador do visitante", async () => {
    const res = await POST(request({ eventId: ID, url: "https://zelogestaointeligente.com.br/?fbclid=abc" }, {}, "198.51.100.4"));
    expect(res.status).toBe(204);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      eventId: ID,
      eventSourceUrl: "https://zelogestaointeligente.com.br/?fbclid=abc",
      clientIp: "198.51.100.4",
      userAgent: "Teste/1.0",
    }));
  });

  it("não envia quando a pessoa desativou a medição", async () => {
    const res = await POST(request({ eventId: ID, url: "https://zelogestaointeligente.com.br/" }, { cookie: "zelo_meta_consent=denied" }));
    expect(res.status).toBe(204);
    expect(send).not.toHaveBeenCalled();
  });

  it("recusa JSON inválido e corpo com dados de outro site", async () => {
    expect((await POST(request("{quebrado"))).status).toBe(400);
    expect((await POST(request({ eventId: ID, url: "https://outro.com/" }))).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("recusa corpo grande demais", async () => {
    expect((await POST(request({ eventId: ID, url: "https://zelogestaointeligente.com.br/", lixo: "x".repeat(3000) }))).status).toBe(413);
  });

  it("freia rajadas do mesmo IP", async () => {
    const body = { eventId: ID, url: "https://zelogestaointeligente.com.br/" };
    let last = 204;
    for (let i = 0; i < 40; i += 1) last = (await POST(request(body, {}, "192.0.2.99"))).status;
    expect(last).toBe(429);
  });
});
