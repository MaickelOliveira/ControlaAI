import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());
const modelOptions = vi.hoisted(() => vi.fn());

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel(options: unknown) {
      modelOptions(options);
      return { generateContent };
    }
  },
}));

vi.mock("./whatsapp-config", () => ({
  getConfig: vi.fn(async () => ({ geminiApiKey: "gemini-test-key" })),
}));

import {
  MAX_AGENT_COMMANDS, ZELO_AGENT_DEFAULT_MODEL, isExplicitHelpCommand, normalizeAgentPlan, planWithZeloAgent,
  replyDeferredAgentCommands, shouldUseZeloAgent, zeloAgentMode,
} from "./zelo-agent";

const geminiReturns = (value: unknown) => generateContent.mockResolvedValueOnce({
  response: { text: () => typeof value === "string" ? value : JSON.stringify(value) },
});

const ctx = { userId: "user-1", phone: "5544999887766", locale: "pt-BR", activeMode: "personal" as const };
const originalModel = process.env.ZELO_AGENT_MODEL;

beforeEach(() => {
  generateContent.mockReset();
  modelOptions.mockReset();
  delete process.env.ZELO_AGENT_MODEL;
});
afterEach(() => {
  if (originalModel === undefined) delete process.env.ZELO_AGENT_MODEL;
  else process.env.ZELO_AGENT_MODEL = originalModel;
});

describe("rollout", () => {
  it.each([
    [undefined, "off"], ["", "off"], ["false", "off"], ["qualquer", "off"],
    ["canary", "canary"], ["all", "all"], ["true", "all"], [" ALL ", "all"],
  ] as const)("ZELO_AGENT_ENABLED=%s → %s", (setting, mode) => {
    expect(zeloAgentMode(setting)).toBe(mode);
  });

  it("fica desligado para todos quando a variável não existe", () => {
    expect(shouldUseZeloAgent("user-1", "5544999887766", undefined, "5544999887766")).toBe(false);
  });

  it("no canary só liga para os números de teste", () => {
    expect(shouldUseZeloAgent("user-1", "+55 (44) 99988-7766", "canary", "5544999887766, 5511900000000")).toBe(true);
    expect(shouldUseZeloAgent("user-1", "5544999880000", "canary", "5544999887766")).toBe(false);
    expect(shouldUseZeloAgent("user-1", "5544999887766", "canary", "")).toBe(false);
  });

  it("reconhece o celular com e sem o nono dígito, como o WhatsApp entrega", () => {
    expect(shouldUseZeloAgent("user-1", "551187654321", "canary", "5511987654321")).toBe(true);
    expect(shouldUseZeloAgent("user-1", "5511987654321", "canary", "551187654321")).toBe(true);
    expect(shouldUseZeloAgent("user-1", "551187650000", "canary", "5511987654321")).toBe(false);
  });

  it("nunca liga para quem não é cliente identificado", () => {
    expect(shouldUseZeloAgent(undefined, "5544999887766", "all", "")).toBe(false);
  });
});

describe("normalizeAgentPlan", () => {
  it("separa vários pedidos em comandos, sem duplicar", () => {
    expect(normalizeAgentPlan({ reply: null, commands: [" registrar despesa de 120 de luz ", "me lembrar da água sexta", "me lembrar da água sexta"] }))
      .toEqual({ kind: "commands", commands: ["registrar despesa de 120 de luz", "me lembrar da água sexta"] });
  });

  it("aceita conversa como resposta natural", () => {
    expect(normalizeAgentPlan({ reply: "De nada! Qualquer coisa é só chamar.", commands: [] }))
      .toEqual({ kind: "reply", reply: "De nada! Qualquer coisa é só chamar." });
  });

  it("recusa resposta que finge ter executado algo", () => {
    expect(normalizeAgentPlan({ reply: "Pronto, registrei sua despesa de 50 reais!", commands: [] })).toBeNull();
    expect(normalizeAgentPlan({ reply: "Listo, agendé tu reunión.", commands: [] })).toBeNull();
  });

  it("devolve ao fluxo antigo quando a saída é estranha", () => {
    expect(normalizeAgentPlan(null)).toBeNull();
    expect(normalizeAgentPlan("texto")).toBeNull();
    expect(normalizeAgentPlan({ reply: "", commands: [] })).toBeNull();
    expect(normalizeAgentPlan({ commands: [1, null] })).toBeNull();
    expect(normalizeAgentPlan({ commands: Array.from({ length: MAX_AGENT_COMMANDS + 1 }, (_, i) => `comando ${i}`) })).toBeNull();
  });
});

describe("planWithZeloAgent", () => {
  it("usa o Gemini 3.8 Flash por padrão e envia o histórico", async () => {
    geminiReturns({ reply: null, commands: ["corrigir o último lançamento: o valor é 50"] });
    const plan = await planWithZeloAgent("na vdd foi 50", {
      ...ctx, history: [{ role: "user", content: "gastei 40 no mercado" }, { role: "assistant", content: "Registrei 40 em Alimentação." }],
    });
    expect(plan).toEqual({ kind: "commands", commands: ["corrigir o último lançamento: o valor é 50"] });
    expect(modelOptions).toHaveBeenCalledWith(expect.objectContaining({ model: ZELO_AGENT_DEFAULT_MODEL }));
    const prompt = generateContent.mock.calls[0][0] as string;
    expect(prompt).toContain("Cliente: gastei 40 no mercado");
    expect(prompt).toContain("\"na vdd foi 50\"");
  });

  it("permite trocar o modelo por variável de ambiente", async () => {
    process.env.ZELO_AGENT_MODEL = "gemini-3.5-flash-lite";
    geminiReturns({ reply: "Oi! Como posso ajudar?", commands: [] });
    await planWithZeloAgent("oi", ctx);
    expect(modelOptions).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3.5-flash-lite" }));
  });

  it("aceita JSON dentro de bloco de código", async () => {
    geminiReturns("```json\n{\"reply\":\"Oi!\",\"commands\":[]}\n```");
    expect(await planWithZeloAgent("oi", ctx)).toEqual({ kind: "reply", reply: "Oi!" });
  });

  it("qualquer falha do modelo devolve null para o fluxo antigo", async () => {
    generateContent.mockRejectedValueOnce(new Error("503 Service Unavailable"));
    expect(await planWithZeloAgent("gastei 30 de uber", ctx)).toBeNull();
    geminiReturns("isso não é json");
    expect(await planWithZeloAgent("gastei 30 de uber", ctx)).toBeNull();
  });

  it("não chama o modelo para mensagem vazia", async () => {
    expect(await planWithZeloAgent("   ", ctx)).toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
  });
});

it("manda pedidos de ajuda direto ao guia completo", () => {
  for (const text of ["ajuda", "Ajuda!", "menu", "comandos", "zelo, ajuda", "¿ayuda?", "guia completo"]) {
    expect(isExplicitHelpCommand(text), text).toBe(true);
  }
  for (const text of ["preciso de ajuda com minhas contas", "como faço pra cadastrar funcionário?", "gastei 30 de uber"]) {
    expect(isExplicitHelpCommand(text), text).toBe(false);
  }
});

it("avisa no idioma do cliente o que ainda falta fazer", () => {
  expect(replyDeferredAgentCommands(["me lembrar da água sexta"])).toContain("• me lembrar da água sexta");
  expect(replyDeferredAgentCommands(["recordarme el agua"], "es")).toMatch(/^Cuando respondas/);
});
