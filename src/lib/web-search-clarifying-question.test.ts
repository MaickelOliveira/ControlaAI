import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isWebSearchClarifyingQuestion } from "./message-handler";

it("aceita uma pergunta curta antes de pesquisar", () => {
  expect(isWebSearchClarifyingQuestion("Para qual data você quer a passagem?")).toBe(true);
  expect(isWebSearchClarifyingQuestion("¿De qué ciudad sales?")).toBe(true);
});

it("ignora resposta pronta, que seria um dado sem pesquisa", () => {
  expect(isWebSearchClarifyingQuestion("O dólar comercial está cotado a R$ 5,41 hoje.")).toBe(false);
  expect(isWebSearchClarifyingQuestion(`${"Panorama do dólar hoje. ".repeat(40)}Quer mais detalhes?`)).toBe(false);
  expect(isWebSearchClarifyingQuestion("")).toBe(false);
  expect(isWebSearchClarifyingQuestion(undefined)).toBe(false);
});
