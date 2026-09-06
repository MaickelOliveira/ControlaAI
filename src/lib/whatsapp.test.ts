import { describe, expect, it } from "vitest";
import {
  localizedTemplateName,
  localizedTemplateParams,
  SPANISH_TEMPLATE_NAMES,
} from "./whatsapp";

describe("Spanish WhatsApp templates", () => {
  it("uses seven unique Meta names without the old _es suffix convention", () => {
    const names = Object.values(SPANISH_TEMPLATE_NAMES);

    expect(names).toHaveLength(7);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => !name.endsWith("_es"))).toBe(true);
    expect(localizedTemplateName("lembrete_assessor", "es")).toBe("aviso_programado_por_contacto");
    expect(localizedTemplateName("boas_vindas_cadastro2", "es")).toBe("acceso_confirmado_zelo");
  });

  it("keeps existing names for Brazilian Portuguese", () => {
    expect(localizedTemplateName("lembrete_assessor", "pt-BR")).toBe("lembrete_assessor");
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
  });
});
