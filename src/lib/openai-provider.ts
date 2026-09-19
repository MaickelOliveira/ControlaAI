const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const MAX_ERROR_MESSAGE_LENGTH = 500;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

class NonRetryableOpenAIError extends Error {}

type JsonSchema = Record<string, unknown>;

type OpenAIContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "auto" }
  | { type: "input_file"; filename: string; file_data: string };

type OpenAIInput = string | Array<{
  role: "user";
  content: OpenAIContentPart[];
}>;

type ResponseRequestOptions = {
  input: OpenAIInput;
  instructions?: string;
  maxOutputTokens?: number;
  responseSchema?: JsonSchema;
  schemaName?: string;
  userId?: string;
  webSearch?: boolean;
};

type OpenAIResponse = Record<string, unknown>;

export type OpenAIWebSearchResult = {
  text: string;
  sources: Array<{ title: string; url: string }>;
};

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada");
  }
  return apiKey;
}

function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function getTranscriptionModel(): string {
  return process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
}

function getTestUserIds(): Set<string> {
  const rawIds = process.env.OPENAI_TEST_USER_IDS || "";
  return new Set(
    rawIds
      .split(/[\s,;]+/)
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

/**
 * A OpenAI fica fechada por padrão. Somente IDs explicitamente listados podem
 * usá-la; curingas não são aceitos e a existência da chave também é exigida.
 */
export function isOpenAITestUser(userId?: string): boolean {
  if (!userId?.trim() || !process.env.OPENAI_API_KEY?.trim()) return false;
  return getTestUserIds().has(userId.trim());
}

function sanitizeSchemaName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return sanitized || "response";
}

function getErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "erro desconhecido";
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "erro desconhecido";
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string" || !message.trim()) return "erro desconhecido";
  return message.trim().slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchOpenAIJson(
  path: string,
  init: RequestInit,
  timeoutMs = 45_000,
): Promise<OpenAIResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${OPENAI_API_BASE_URL}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });

      const payload = await response.json().catch(() => ({})) as OpenAIResponse;
      if (response.ok) return payload;

      const error = new Error(
        `OpenAI respondeu HTTP ${response.status}: ${getErrorMessage(payload)}`,
      );
      if (!RETRYABLE_STATUS_CODES.has(response.status)) {
        throw new NonRetryableOpenAIError(error.message);
      }
      if (attempt === 2) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (error instanceof NonRetryableOpenAIError) throw error;
      if (attempt === 2) throw lastError;
    }

    await sleep(250 * (2 ** attempt));
  }

  throw lastError || new Error("Falha inesperada ao acessar a OpenAI");
}

function extractResponseText(response: OpenAIResponse): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const texts: string[] = [];
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) texts.push(text.trim());
    }
  }

  const result = texts.join("\n").trim();
  if (!result) throw new Error("A OpenAI não retornou conteúdo textual");
  return result;
}

function stripJsonFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

async function createResponse(options: ResponseRequestOptions): Promise<OpenAIResponse> {
  const body: Record<string, unknown> = {
    model: getModel(),
    input: options.input,
    store: false,
    reasoning: { effort: "none" },
    max_output_tokens: options.maxOutputTokens || 4_096,
  };

  if (options.instructions) body.instructions = options.instructions;
  if (options.responseSchema) {
    body.text = {
      format: {
        type: "json_schema",
        name: sanitizeSchemaName(options.schemaName || "response"),
        strict: false,
        schema: options.responseSchema,
      },
    };
  }
  if (options.webSearch) {
    body.tools = [{ type: "web_search" }];
    body.tool_choice = "auto";
    body.include = ["web_search_call.action.sources"];
  }

  return fetchOpenAIJson("/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function openAIText(options: {
  prompt: string;
  instructions?: string;
  maxOutputTokens?: number;
  userId?: string;
}): Promise<string> {
  const response = await createResponse({
    input: options.prompt,
    instructions: options.instructions,
    maxOutputTokens: options.maxOutputTokens,
    userId: options.userId,
  });
  return extractResponseText(response);
}

export async function openAIJson<T>(options: {
  prompt: string;
  instructions?: string;
  schema?: JsonSchema;
  schemaName?: string;
  maxOutputTokens?: number;
  userId?: string;
}): Promise<T> {
  const response = await createResponse({
    input: options.prompt,
    instructions: options.instructions,
    responseSchema: options.schema || { type: "object", additionalProperties: true },
    schemaName: options.schemaName,
    maxOutputTokens: options.maxOutputTokens,
    userId: options.userId,
  });
  return JSON.parse(stripJsonFences(extractResponseText(response))) as T;
}

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("pdf")) return "pdf";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("csv")) return "csv";
  if (normalized.includes("json")) return "json";
  if (normalized.includes("plain")) return "txt";
  if (normalized.includes("ogg") || normalized.includes("opus")) return "ogg";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  return "bin";
}

function mediaInput(
  prompt: string,
  buffer: Buffer,
  mimeType: string,
  filename?: string,
): OpenAIInput {
  const fileData = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const content: OpenAIContentPart[] = [{ type: "input_text", text: prompt }];

  if (mimeType.toLowerCase().startsWith("image/")) {
    content.push({ type: "input_image", image_url: fileData, detail: "auto" });
  } else {
    content.push({
      type: "input_file",
      filename: filename || `documento.${extensionForMimeType(mimeType)}`,
      file_data: fileData,
    });
  }

  return [{ role: "user", content }];
}

export async function openAIMediaJson<T>(options: {
  prompt: string;
  buffer: Buffer;
  mimeType: string;
  filename?: string;
  instructions?: string;
  schema?: JsonSchema;
  schemaName?: string;
  maxOutputTokens?: number;
  userId?: string;
}): Promise<T> {
  const response = await createResponse({
    input: mediaInput(options.prompt, options.buffer, options.mimeType, options.filename),
    instructions: options.instructions,
    responseSchema: options.schema || { type: "object", additionalProperties: true },
    schemaName: options.schemaName,
    maxOutputTokens: options.maxOutputTokens,
    userId: options.userId,
  });
  return JSON.parse(stripJsonFences(extractResponseText(response))) as T;
}

export async function openAIMediaText(options: {
  prompt: string;
  buffer: Buffer;
  mimeType: string;
  filename?: string;
  instructions?: string;
  maxOutputTokens?: number;
  userId?: string;
}): Promise<string> {
  const response = await createResponse({
    input: mediaInput(options.prompt, options.buffer, options.mimeType, options.filename),
    instructions: options.instructions,
    maxOutputTokens: options.maxOutputTokens,
    userId: options.userId,
  });
  return extractResponseText(response);
}

function collectWebSources(value: unknown, sources: Map<string, string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectWebSources(item, sources);
    return;
  }
  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (typeof record.url === "string" && /^https?:\/\//i.test(record.url)) {
    const title = typeof record.title === "string" && record.title.trim()
      ? record.title.trim()
      : record.url;
    sources.set(record.url, title);
  }

  for (const nested of Object.values(record)) collectWebSources(nested, sources);
}

export async function openAIWebSearch(options: {
  prompt: string;
  instructions?: string;
  maxOutputTokens?: number;
  userId?: string;
}): Promise<OpenAIWebSearchResult> {
  const response = await createResponse({
    input: options.prompt,
    instructions: options.instructions,
    maxOutputTokens: options.maxOutputTokens,
    userId: options.userId,
    webSearch: true,
  });
  const sources = new Map<string, string>();
  collectWebSources(response.output, sources);

  return {
    text: extractResponseText(response),
    sources: Array.from(sources, ([url, title]) => ({ title, url })).slice(0, 10),
  };
}

export async function openAITranscribe(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const form = new FormData();
  form.append("model", getTranscriptionModel());
  form.append("response_format", "json");
  form.append(
    "file",
    new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
    `audio.${extensionForMimeType(mimeType)}`,
  );

  const response = await fetchOpenAIJson("/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiKey()}` },
    body: form,
  }, 60_000);

  const text = response.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("A OpenAI não retornou uma transcrição");
  }
  return text.trim();
}
