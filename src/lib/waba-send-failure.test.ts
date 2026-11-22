import { expect, it } from "vitest";
import { wabaSendFailureKind } from "./waba";

it("classifica a recusa da Meta sem expor o conteúdo", () => {
  expect(wabaSendFailureKind(100, 400, 5000)).toBe("texto acima de 4096 caracteres");
  expect(wabaSendFailureKind(131056, 400, 300)).toBe("limite de envio atingido");
  expect(wabaSendFailureKind(undefined, 429, 300)).toBe("limite de envio atingido");
  expect(wabaSendFailureKind(131047, 400, 300)).toBe("janela de 24h fechada ou número indisponível");
  expect(wabaSendFailureKind(100, 400, 300)).toBe("parâmetro recusado (formato do texto)");
  expect(wabaSendFailureKind(190, 401, 300)).toBe("token de acesso inválido");
  expect(wabaSendFailureKind(999, 500, 300)).toBe("motivo não classificado");
});
