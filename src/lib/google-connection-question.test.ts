import { describe, expect, it } from "vitest";
import { googleConnectionQuestion } from "./google-connection-question";

describe("perguntas sobre conexão Google", () => {
  it("reconhece os modos sem tratar uma ação de conexão como status", () => {
    expect(googleConnectionQuestion("Explique se meu Google está conectado no modo Pessoal.")).toEqual({ mode: "personal", ambiguous: false });
    expect(googleConnectionQuestion("Explique se há calendário conectado no modo Empresa.")).toEqual({ mode: "business", ambiguous: false });
    expect(googleConnectionQuestion("Meu Google está conectado?")).toEqual({ mode: undefined, ambiguous: false });
    expect(googleConnectionQuestion("Google Pessoal conectado?")).toEqual({ mode: "personal", ambiguous: false });
    expect(googleConnectionQuestion("Como conectar o Google Agenda?")).toBeNull();
    expect(googleConnectionQuestion("Crie um compromisso no Google amanhã")).toBeNull();
    expect(googleConnectionQuestion("Meu Google Drive está conectado?")).toBeNull();
  });

  it("não escolhe entre Pessoal e Empresa quando ambos foram pedidos", () => {
    expect(googleConnectionQuestion("O Google está conectado no Pessoal e na Empresa?")).toEqual({ mode: undefined, ambiguous: true });
  });
});
