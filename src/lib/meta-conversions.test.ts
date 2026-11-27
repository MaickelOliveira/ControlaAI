import { describe, expect, it } from "vitest";
import { buildMetaConversionPayload, buildMetaPageViewPayload, hashMetaValue } from "./meta-conversions";

describe("Meta Conversions API", () => {
  it("normaliza e protege dados pessoais com SHA-256", () => {
    const payload = buildMetaConversionPayload({
      eventName: "CompleteRegistration",
      eventId: "registration-123",
      eventSourceUrl: "https://zelo.app/cadastro",
      email: " Usuario@Exemplo.COM ",
      phone: "(44) 99999-9999",
      name: "Maria da Silva",
      externalId: "user-123",
      clientIp: "203.0.113.10",
      userAgent: "Test Browser",
      fbp: "fb.1.123.abc",
      fbc: "fb.1.123.click",
      plan: "business",
      billingCycle: "annual",
    });

    const event = payload.data[0];
    expect(event.event_id).toBe("registration-123");
    expect(event.user_data.em).toEqual([hashMetaValue("usuario@exemplo.com")]);
    expect(event.user_data.ph).toEqual([hashMetaValue("5544999999999")]);
    expect(event.user_data.fn).toEqual([hashMetaValue("maria")]);
    expect(event.user_data.ln).toEqual([hashMetaValue("silva")]);
    expect(event.user_data.country).toEqual([hashMetaValue("br")]);
    expect(event.user_data.client_ip_address).toBe("203.0.113.10");
    expect(JSON.stringify(payload)).not.toContain("usuario@exemplo.com");
    expect(JSON.stringify(payload)).not.toContain("44999999999");
  });

  it("mantém o identificador necessário para deduplicar Pixel e servidor", () => {
    const payload = buildMetaConversionPayload({
      eventName: "CompleteRegistration",
      eventId: "same-event-id",
      eventSourceUrl: "https://zelo.app/cadastro",
      email: "a@b.com",
      phone: "11999999999",
      name: "Ana",
      externalId: "user-1",
    }, 1_700_000_000_000);

    expect(payload.data[0]).toMatchObject({
      event_name: "CompleteRegistration",
      event_id: "same-event-id",
      event_time: 1_700_000_000,
      action_source: "website",
    });
  });
});

describe("PageView pelo servidor", () => {
  it("usa o mesmo event_id do navegador e não leva dados pessoais", () => {
    const payload = buildMetaPageViewPayload({
      eventId: "3f2c8e1a-4b5d-4c6e-9f70-1a2b3c4d5e6f",
      eventSourceUrl: "https://zelogestaointeligente.com.br/?fbclid=abc",
      clientIp: "203.0.113.10",
      userAgent: "Mozilla/5.0",
      fbp: "fb.1.1800000000000.123456789",
      fbc: "fb.1.1800000000000.IwAR1234567890",
    }, 1_800_000_000_000);
    const [event] = payload.data;
    expect(event.event_name).toBe("PageView");
    expect(event.event_id).toBe("3f2c8e1a-4b5d-4c6e-9f70-1a2b3c4d5e6f");
    expect(event.event_time).toBe(1_800_000_000);
    expect(event.action_source).toBe("website");
    expect(event.user_data).toEqual({
      client_ip_address: "203.0.113.10",
      client_user_agent: "Mozilla/5.0",
      fbp: "fb.1.1800000000000.123456789",
      fbc: "fb.1.1800000000000.IwAR1234567890",
    });
    expect(Object.keys(event.user_data)).not.toContain("em");
  });

  it("ViewContent leva o visitante em hash e o nome do conteúdo", () => {
    const [event] = buildMetaPageViewPayload({ eventName: "ViewContent", eventId: "x", eventSourceUrl: "https://zelogestaointeligente.com.br/", externalId: "3f2c8e1a-4b5d-4c6e-9f70-1a2b3c4d5e6f" }).data;
    expect(event.event_name).toBe("ViewContent");
    expect(event.user_data.external_id).toEqual([hashMetaValue("3f2c8e1a-4b5d-4c6e-9f70-1a2b3c4d5e6f")]);
    expect(event.custom_data).toEqual({ content_name: "Planos Zelo", content_category: "subscription" });
  });

  it("omite o IP quando ele é desconhecido", () => {
    const [event] = buildMetaPageViewPayload({ eventId: "x", eventSourceUrl: "https://zelogestaointeligente.com.br/", clientIp: "unknown" }).data;
    expect(event.user_data).toEqual({});
  });
});
