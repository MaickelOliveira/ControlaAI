import { expect, it } from "vitest";
import { isTimeSensitiveSearch } from "./ai-processor";

it("exige fontes para dados que mudam com o tempo", () => {
  for (const query of ["dólar hoje", "qual a cotação do euro?", "preço do iPhone 16", "farmácia aberta agora em Maringá",
    "passagem para Curitiba amanhã", "notícias de economia", "previsão do tempo em Londrina", "caronas para Curitiba"]) {
    expect(isTimeSensitiveSearch(query), query).toBe(true);
  }
});

it("aceita conhecimento geral sem fontes", () => {
  for (const query of ["Quem é Thomás Edson?", "quem inventou a lâmpada", "o que é inflação", "capital da Austrália"]) {
    expect(isTimeSensitiveSearch(query), query).toBe(false);
  }
});
