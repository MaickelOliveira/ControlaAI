import { describe, expect, it } from "vitest";
import {
  languageCodeFor,
  buildReminderTemplateDispatch,
  localizedTemplateName,
  localizedTemplateParams,
  renderSpanishBusinessReminder,
  SPANISH_BUSINESS_REMINDER_TEMPLATE_BODY,
  SPANISH_TEMPLATE_NAMES,
  SPANISH_WELCOME_TEMPLATE_TEXT,
  type WhatsAppTemplateBase,
} from "./whatsapp";

describe("Spanish WhatsApp templates", () => {
  it("uses seven unique Meta names without the old _es suffix convention", () => {
    const names = Object.values(SPANISH_TEMPLATE_NAMES);

    expect(names).toHaveLength(7);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => !name.endsWith("_es"))).toBe(true);
    expect(Object.entries(SPANISH_TEMPLATE_NAMES).every(([base, name]) => base !== name)).toBe(true);
    expect(localizedTemplateName("lembrete_assessor", "es")).toBe("aviso_programado_por_contacto");
    expect(localizedTemplateName("lbte_empresarial", "es")).toBe("informacion_programada_cuenta");
    expect(localizedTemplateName("boas_vindas_cadastro2", "es")).toBe("acceso_confirmado_zelo");
  });

  it("keeps existing names for Brazilian Portuguese", () => {
    expect(localizedTemplateName("lembrete_assessor", "pt-BR")).toBe("lembrete_assessor");
    expect(languageCodeFor("pt-BR")).toBe("pt_BR");
    expect(languageCodeFor("es")).toBe("es");
  });

  it("blocks an unmapped Spanish template instead of falling back to Portuguese", () => {
    expect(() => localizedTemplateName("modelo_sem_mapeamento" as WhatsAppTemplateBase, "es")).toThrow(
      "template espanhol não mapeado",
    );
    expect(() => localizedTemplateName("lembrete_assessor", "fr")).toThrow(
      "locale de template não suportado",
    );
  });

  it("routes personal, business and third-party reminders to the correct Spanish templates", () => {
    expect(buildReminderTemplateDispatch({
      message: "Tomar el medicamento",
      recipientType: "self",
      mode: "personal",
      locale: "es",
    })).toEqual({
      templateName: "lbt_pessoal",
      renderedText: "🔔 Aviso personal\n\nTomar el medicamento\n\nEste aviso fue programado previamente en Zelo.",
      params: { texto: "Tomar el medicamento" },
    });

    expect(buildReminderTemplateDispatch({
      message: "Revisar el flujo de caja",
      recipientType: "self",
      mode: "business",
      locale: "es",
    })).toMatchObject({
      templateName: "lbte_empresarial",
      params: { lembrete: "Revisar el flujo de caja" },
    });

    expect(buildReminderTemplateDispatch({
      message: "Enviar el informe",
      recipientType: "employee",
      mode: "business",
      ownerName: "Carlos",
      locale: "es",
    })).toEqual({
      templateName: "lembrete_assessor",
      renderedText: "🔔 Aviso programado por Carlos\n\nEnviar el informe\n\nEste aviso fue solicitado previamente en Zelo.",
      params: { remetente: "Carlos", lembrete: "Enviar el informe" },
    });
  });

  it("sends the exact named parameters registered in the Spanish Meta templates", () => {
    expect(localizedTemplateParams("lembrete_assessor", {
      remetente: "Carlos Ramírez",
      lembrete: "Enviar el informe mensual",
    }, "es")).toEqual({
      remitente: "Carlos Ramírez",
      aviso: "Enviar el informe mensual",
    });

    expect(localizedTemplateParams("cbr_recorrente", {
      descricao: "Cuota del vehículo",
      valor: "R$ 450,00",
      data: "06/09/2026",
    }, "es")).toEqual({
      concepto: "Cuota del vehículo",
      importe: "R$ 450,00",
      fecha: "06/09/2026",
    });

    expect(localizedTemplateParams("lbte_empresarial", {
      lembrete: "Revisar el flujo de caja de la empresa",
    }, "es")).toEqual({
      detalle: "Revisar el flujo de caja de la empresa",
    });

    expect(() => localizedTemplateParams("lbte_empresarial", {
      campo_portugues_inesperado: "valor",
    }, "es")).toThrow("parâmetros inválidos para lbte_empresarial");
  });

  it("instructs the customer how to connect WhatsApp after account activation", () => {
    expect(SPANISH_WELCOME_TEMPLATE_TEXT).toContain(
      "entra en zelogestaointeligente.com.br/es, inicia sesión, abre Configuración",
    );
    expect(SPANISH_WELCOME_TEMPLATE_TEXT).toContain("sección WhatsApp");
  });

  it("keeps the registered Spanish business body aligned with the Inbox rendering", () => {
    expect(SPANISH_BUSINESS_REMINDER_TEMPLATE_BODY).toBe(
      "📌 Información de tu cuenta Zelo\n\n" +
      "Tienes esta actividad programada:\n\n" +
      "{{detalle}}\n\n" +
      "La notificación fue configurada desde tu cuenta.",
    );
    expect(renderSpanishBusinessReminder("Revisar los pagos pendientes")).toContain(
      "Revisar los pagos pendientes",
    );
    expect(renderSpanishBusinessReminder("Revisar los pagos pendientes")).not.toContain("{{detalle}}");
  });
});
