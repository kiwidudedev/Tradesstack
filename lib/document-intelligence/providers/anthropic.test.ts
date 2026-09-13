import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ANTHROPIC_DOCUMENT_MAX_OUTPUT_TOKENS,
  DEFAULT_ANTHROPIC_DOCUMENT_TIMEOUT_MS,
  interpretStructuredDocumentWithAnthropic,
} from "@/lib/document-intelligence/providers/anthropic";
import { MATERIAL_SUPPLIER_PRICING_JSON_SCHEMA } from "@/lib/materials/supplier-pricing-intelligence/schema";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("shared Anthropic structured output", () => {
  it("keeps the Material schema within Anthropic union limits", () => {
    const serialized = JSON.stringify(MATERIAL_SUPPLIER_PRICING_JSON_SCHEMA);
    expect(serialized).not.toMatch(/"type":\[/);
    expect(serialized).not.toMatch(/"minimum"|"maximum"|"minItems"|"maxItems"/);
  });

  it("sends native PDF without exposing it in result and normalizes usage", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.messages[0].content[1].type).toBe("document");
      expect(body.output_config.format.type).toBe("json_schema");
      expect(body.max_tokens).toBe(DEFAULT_ANTHROPIC_DOCUMENT_MAX_OUTPUT_TOKENS);
      return new Response(JSON.stringify({ id: "req_1", structured_output: { ok: true }, usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await interpretStructuredDocumentWithAnthropic({
      systemInstruction: "system", userInstruction: "user", schema: { type: "object" },
      sourceParts: [{ id: "p1", kind: "pdf", fileName: "prices.pdf", mimeType: "application/pdf", sizeBytes: 5, pageCount: 1, content: new Uint8Array([1, 2, 3]), metadata: {} }],
      contractVersion: "v1", promptVersion: "p1",
    });
    expect(result.value).toEqual({ ok: true });
    expect(result.run).toMatchObject({ requestId: "req_1", inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it("classifies rate limiting without leaking response content", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("sensitive", { status: 429, headers: { "retry-after": "7" } })));
    await expect(interpretStructuredDocumentWithAnthropic({ systemInstruction: "s", userInstruction: "u", schema: {}, sourceParts: [], contractVersion: "v1", promptVersion: "p1" }))
      .rejects.toMatchObject({ code: "provider_rate_limited", retryable: true, status: 429, safeMetadata: { retryAfterMs: 7000 } });
  });

  it("classifies provider authentication and server failures", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const request = { systemInstruction: "s", userInstruction: "u", schema: {}, sourceParts: [], contractVersion: "v1", promptVersion: "p1" };
    await expect(interpretStructuredDocumentWithAnthropic(request))
      .rejects.toMatchObject({ code: "provider_auth_error", retryable: false, status: 401 });
    await expect(interpretStructuredDocumentWithAnthropic(request))
      .rejects.toMatchObject({ code: "provider_server_error", retryable: true, status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows one long successful request within the bounded document timeout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T00:00:00.000Z"));
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      setTimeout(() => resolve(new Response(JSON.stringify({
        id: "req_long",
        structured_output: { ok: true },
        usage: { input_tokens: 100, output_tokens: 25 },
      }), { status: 200 })), 120_000);
    }));
    vi.stubGlobal("fetch", fetchMock);
    const interpretation = interpretStructuredDocumentWithAnthropic({
      systemInstruction: "s", userInstruction: "u", schema: {}, sourceParts: [], contractVersion: "v1", promptVersion: "p1",
    });
    await vi.advanceTimersByTimeAsync(120_000);
    await expect(interpretation).resolves.toMatchObject({
      value: { ok: true },
      run: { requestId: "req_long", durationMs: 120_000, inputTokens: 100, outputTokens: 25 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains only bounded provider error metadata for rejected requests", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { type: "invalid_request_error", message: "Account cannot currently process this request." },
    }), { status: 400 })));
    await expect(interpretStructuredDocumentWithAnthropic({
      systemInstruction: "s",
      userInstruction: "u",
      schema: {},
      sourceParts: [],
      contractVersion: "v1",
      promptVersion: "p1",
    })).rejects.toMatchObject({
      code: "provider_bad_response",
      retryable: false,
      status: 400,
      safeMetadata: {
        providerErrorType: "invalid_request_error",
        providerErrorMessage: "Account cannot currently process this request.",
      },
    });
  });

  it("classifies exhausted Anthropic credits as a non-retryable billing failure", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." },
    }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(interpretStructuredDocumentWithAnthropic({
      systemInstruction: "s",
      userInstruction: "u",
      schema: {},
      sourceParts: [],
      contractVersion: "v1",
      promptVersion: "p1",
    })).rejects.toMatchObject({
      code: "provider_billing_error",
      retryable: false,
      message: "Anthropic billing credits are unavailable for document interpretation.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses one bounded document call for a provider timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const interpretation = interpretStructuredDocumentWithAnthropic({
      systemInstruction: "s", userInstruction: "u", schema: {}, sourceParts: [], contractVersion: "v1", promptVersion: "p1",
    });
    const assertion = expect(interpretation).rejects.toMatchObject({ code: "provider_timeout", retryable: false });
    await vi.advanceTimersByTimeAsync(DEFAULT_ANTHROPIC_DOCUMENT_TIMEOUT_MS);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry max-token or structured-output failures", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const maxTokenFetch = vi.fn(async () => new Response(JSON.stringify({
      id: "req_max",
      stop_reason: "max_tokens",
      usage: { input_tokens: 321, output_tokens: 32_000 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", maxTokenFetch);
    await expect(interpretStructuredDocumentWithAnthropic({
      systemInstruction: "s", userInstruction: "u", schema: {}, sourceParts: [], contractVersion: "v1", promptVersion: "p1",
    })).rejects.toMatchObject({
      code: "provider_max_tokens",
      retryable: false,
      safeMetadata: { requestId: "req_max", inputTokens: 321, outputTokens: 32_000, attemptNumber: 1 },
    });
    expect(maxTokenFetch).toHaveBeenCalledTimes(1);

    const invalidOutputFetch = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "not-json" }] }), { status: 200 }));
    vi.stubGlobal("fetch", invalidOutputFetch);
    await expect(interpretStructuredDocumentWithAnthropic({
      systemInstruction: "s", userInstruction: "u", schema: {}, sourceParts: [], contractVersion: "v1", promptVersion: "p1",
    })).rejects.toMatchObject({ code: "provider_schema_parse_failed", retryable: false });
    expect(invalidOutputFetch).toHaveBeenCalledTimes(1);
  });
});
