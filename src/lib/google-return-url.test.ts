import { describe, expect, it } from "vitest";
import { getGoogleSettingsReturnUrl } from "./google-return-url";

describe("retorno público do Google", () => {
  it("sempre usa o domínio oficial do Zelo no Brasil", () => {
    expect(getGoogleSettingsReturnUrl("pt-BR").toString()).toBe(
      "https://zelogestaointeligente.com.br/dashboard/configuracoes",
    );
  });

  it("mantém a rota correta de cada idioma", () => {
    expect(getGoogleSettingsReturnUrl("es").pathname).toBe("/es/dashboard/configuracoes");
    expect(getGoogleSettingsReturnUrl("pt-PT").pathname).toBe("/pt/dashboard/configuracoes");
  });
});
