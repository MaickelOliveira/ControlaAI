import { describe, expect, it } from "vitest";
import { buildMetaConversionPayload, hashMetaValue } from "./meta-conversions";

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
