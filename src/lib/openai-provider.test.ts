import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isOpenAITestUser,
  openAIJson,
  openAIText,
  openAIWebSearch,
} from "./openai-provider";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;
const originalTestUserIds = process.env.OPENAI_TEST_USER_IDS;
const originalModel = process.env.OPENAI_MODEL;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenAI canary provider", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_TEST_USER_IDS = "user-a,user-b";
    process.env.OPENAI_MODEL = "gpt-test";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();

    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalTestUserIds === undefined) delete process.env.OPENAI_TEST_USER_IDS;
    else process.env.OPENAI_TEST_USER_IDS = originalTestUserIds;
    if (originalModel === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  });

  it("fails closed unless the exact user ID is allowlisted", () => {
    expect(isOpenAITestUser("user-a")).toBe(true);
    expect(isOpenAITestUser("user")).toBe(false);
    expect(isOpenAITestUser("user-c")).toBe(false);
    expect(isOpenAITestUser()).toBe(false);

    process.env.OPENAI_TEST_USER_IDS = "*";
    expect(isOpenAITestUser("user-a")).toBe(false);

    delete process.env.OPENAI_API_KEY;
    expect(isOpenAITestUser("*")).toBe(false);
  });

  it("uses the Responses API without storing the response", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      output: [{ type: "message", content: [{ type: "output_text", text: "resposta" }] }],
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(openAIText({ prompt: "olá" })).resolves.toBe("resposta");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "gpt-test",
      input: "olá",
      store: false,
      reasoning: { effort: "none" },
    });
  });

  it("requests structured JSON and parses the model output", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      output: [{ type: "message", content: [{ type: "output_text", text: '{"intent":"help","confidence":1}' }] }],
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(openAIJson<{ intent: string }>({
      prompt: "ajuda",
      schemaName: "intent",
      schema: { type: "object", additionalProperties: true },
    })).resolves.toEqual({ intent: "help", confidence: 1 });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "intent", strict: false });
  });

  it("returns web sources supplied by the search tool", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      output: [
        { type: "web_search_call", action: { sources: [{ title: "Fonte oficial", url: "https://example.com/fonte" }] } },
        { type: "message", content: [{ type: "output_text", text: "resultado atual" }] },
      ],
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(openAIWebSearch({ prompt: "pesquise" })).resolves.toEqual({
      text: "resultado atual",
      sources: [{ title: "Fonte oficial", url: "https://example.com/fonte" }],
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.tools).toEqual([{ type: "web_search" }]);
    expect(body.include).toEqual(["web_search_call.action.sources"]);
  });
});
