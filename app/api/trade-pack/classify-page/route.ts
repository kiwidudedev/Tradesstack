import { NextResponse } from "next/server";
import {
  analyzePageForTrade,
  getTradeById,
  type TradePackTrade,
  type TradePagePrefilterSignal,
} from "@/lib/trade-pack-builder";
import {
  clampConfidence,
  type TradePackVlmPageRequest,
  type TradePackVlmPageResult,
} from "@/lib/trade-pack-vlm";

export const runtime = "nodejs";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_VLM_MODEL = "gpt-5.2";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_ANTHROPIC_VLM_MODEL = "claude-opus-4-6";
const CLAUDE_FALLBACK_ENABLED = false;
const AMBIGUOUS_CONFIDENCE_MIN = 0.42;
const AMBIGUOUS_CONFIDENCE_MAX = 0.68;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function parseJsonObjectFromText(payload: string): Record<string, unknown> | null {
  const trimmed = payload.trim();
  if (!trimmed) {
    return null;
  }

  const directParse = (() => {
    try {
      const parsed = JSON.parse(trimmed);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  })();
  if (directParse) {
    return directParse;
  }

  const openBraceIndex = trimmed.indexOf("{");
  const closeBraceIndex = trimmed.lastIndexOf("}");
  if (openBraceIndex < 0 || closeBraceIndex <= openBraceIndex) {
    return null;
  }

  const jsonSlice = trimmed.slice(openBraceIndex, closeBraceIndex + 1);
  try {
    const parsed = JSON.parse(jsonSlice);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractOpenAiResponseText(responseJson: unknown): string {
  if (!isRecord(responseJson)) {
    return "";
  }

  if (typeof responseJson.output_text === "string" && responseJson.output_text.trim().length > 0) {
    return responseJson.output_text.trim();
  }

  const output = responseJson.output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const outputItem of output) {
    if (!isRecord(outputItem)) {
      continue;
    }
    const content = outputItem.content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const contentItem of content) {
      if (!isRecord(contentItem)) {
        continue;
      }
      if (contentItem.type === "output_text" && typeof contentItem.text === "string") {
        chunks.push(contentItem.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function buildFallbackClassification(params: {
  tradeId: string;
  pageText: string;
  prefilter: TradePagePrefilterSignal;
  fallbackReason: string;
}): TradePackVlmPageResult {
  const { tradeId, pageText, prefilter, fallbackReason } = params;
  const trade = getTradeById(tradeId);
  const fallbackSignal = trade ? analyzePageForTrade(pageText, trade) : null;

  const score = fallbackSignal?.score ?? prefilter.score;
  const isRelevant = Boolean(fallbackSignal?.isRelevant || prefilter.isSupportSheet);
  const confidence = clampConfidence(0.25 + score * 0.08 + (prefilter.isSupportSheet ? 0.1 : 0));
  const reason = fallbackSignal?.reason ?? prefilter.reason;

  return {
    classificationMode: "fallback-rules",
    isRelevant,
    confidence,
    isSupportSheet: prefilter.isSupportSheet,
    reason: `${reason} (${fallbackReason})`,
    supportReason: prefilter.isSupportSheet ? prefilter.supportMatches[0] ?? "Support-sheet keyword match" : null,
    tradeSignals: [
      ...prefilter.matchedSheetPrefixes.slice(0, 2),
      ...prefilter.matchedStructuredKeywords.slice(0, 1),
      ...prefilter.matchedSecondaryKeywords.slice(0, 2),
      ...prefilter.matchedAbbreviations.slice(0, 2),
    ],
    secondaryTradeIds: [],
    provider: "rules",
    model: "rules-engine",
    escalatedFromPrimary: false,
  };
}

function normalizeVlmClassification(params: {
  raw: unknown;
  fallback: TradePackVlmPageResult;
  provider: "openai" | "anthropic";
  model: string;
  escalatedFromPrimary: boolean;
}): TradePackVlmPageResult {
  const { raw, fallback, provider, model, escalatedFromPrimary } = params;
  if (!isRecord(raw)) {
    return fallback;
  }

  const isRelevant = typeof raw.is_relevant === "boolean" ? raw.is_relevant : fallback.isRelevant;
  const confidence =
    typeof raw.confidence === "number" ? clampConfidence(raw.confidence) : fallback.confidence;
  const isSupportSheet =
    typeof raw.is_support_sheet === "boolean" ? raw.is_support_sheet : fallback.isSupportSheet;
  const reason = typeof raw.reason === "string" && raw.reason.trim().length > 0 ? raw.reason.trim() : fallback.reason;
  const supportReason =
    typeof raw.support_reason === "string" && raw.support_reason.trim().length > 0
      ? raw.support_reason.trim()
      : null;
  const tradeSignals = toStringArray(raw.trade_signals).slice(0, 8);
  const secondaryTradeIds = toStringArray(raw.secondary_trade_ids).slice(0, 5);

  return {
    classificationMode: "vlm",
    isRelevant,
    confidence,
    isSupportSheet,
    reason,
    supportReason,
    tradeSignals,
    secondaryTradeIds,
    provider,
    model,
    escalatedFromPrimary,
  };
}

function extractAnthropicResponseText(responseJson: unknown): string {
  if (!isRecord(responseJson) || !Array.isArray(responseJson.content)) {
    return "";
  }

  const content = responseJson.content;
  const chunks: string[] = [];
  for (const chunk of content) {
    if (!isRecord(chunk)) {
      continue;
    }

    if (chunk.type === "text" && typeof chunk.text === "string") {
      chunks.push(chunk.text);
    }
  }

  return chunks.join("\n").trim();
}

function parseImageDataUrl(dataUrl: string): { mediaType: string; base64Data: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return null;
  }

  const [, mediaType, base64Data] = match;
  if (!mediaType || !base64Data) {
    return null;
  }

  return {
    mediaType,
    base64Data,
  };
}

function isGrayBandConfidence(confidence: number): boolean {
  return confidence >= AMBIGUOUS_CONFIDENCE_MIN && confidence <= AMBIGUOUS_CONFIDENCE_MAX;
}

function shouldEscalateToClaude(result: TradePackVlmPageResult): boolean {
  const grayBandConfidence = isGrayBandConfidence(result.confidence);
  const multiTradeAmbiguity = result.secondaryTradeIds.length > 0;
  const weakSignalShape = result.tradeSignals.length === 0;

  return grayBandConfidence || multiTradeAmbiguity || weakSignalShape;
}

function buildSystemPrompt(): string {
  return (
    "You are a construction document classifier for AU/NZ projects. " +
    "Classify one drawing page for a selected trade. " +
    "First perform OCR-style reading from the provided page image, then combine that with the extracted text snippet. " +
    "A page is relevant when it directly supports the selected trade (plans, sections, details, notes, schedules, symbols). " +
    "Support sheets should be marked when they are needed to interpret trade pages. " +
    "Prioritize sheet prefixes and primary trade keywords; use secondary keywords and abbreviations as confidence boosters. " +
    "Avoid false positives from other disciplines. Return strict JSON only."
  );
}

function formatKeywordGroup(values: string[], maxItems = 32): string {
  if (values.length === 0) {
    return "(none)";
  }

  if (values.length <= maxItems) {
    return values.join(", ");
  }

  const shown = values.slice(0, maxItems).join(", ");
  return `${shown}, ... (+${values.length - maxItems} more)`;
}

function buildTradeKeywordHint(trade: TradePackTrade): string {
  return (
    `Sheet prefixes: ${formatKeywordGroup(trade.sheetPrefixes)}\n` +
    `Primary keywords (high-confidence triggers): ${formatKeywordGroup(trade.structuredKeywords)}\n` +
    `Secondary keywords (confidence boosters): ${formatKeywordGroup(trade.secondaryKeywords)}\n` +
    `Abbreviations (confidence boosters): ${formatKeywordGroup(trade.abbreviations)}`
  );
}

function buildUserPrompt(params: {
  tradeLabel: string;
  tradeId: string;
  tradeKeywordHint: string;
  pageNumber: number;
  totalPages: number;
  textExcerpt: string;
  prefilterHint: string;
}): string {
  return (
    `Selected trade: ${params.tradeLabel} (${params.tradeId})\n` +
    `Page: ${params.pageNumber} of ${params.totalPages}\n\n` +
    "OCR task:\n" +
    "- Read title block, sheet number/prefix, schedules, legends, notes, callouts, and detail labels from the image.\n" +
    "- Match what you read against the trade keyword profile below.\n\n" +
    `Trade keyword profile (AU/NZ):\n${params.tradeKeywordHint}\n\n` +
    "Signal weighting rules:\n" +
    "- Primary keywords and sheet prefixes are the strongest relevance signals.\n" +
    "- Secondary keywords/abbreviations increase confidence but should not dominate alone.\n" +
    "- Trade_signals should include the strongest OCR words/prefixes that drove your decision.\n" +
    "- Avoid cross-discipline false positives when another trade has clearer title/prefix evidence.\n\n" +
    `Prefilter hints:\n${params.prefilterHint}\n\n` +
    "Extracted text snippet:\n" +
    params.textExcerpt
  );
}

async function classifyWithClaudeFallback(params: {
  anthropicApiKey: string;
  anthropicModel: string;
  systemPrompt: string;
  userPrompt: string;
  pageImageDataUrl: string;
  fallbackResult: TradePackVlmPageResult;
  escalatedFromPrimary: boolean;
}): Promise<TradePackVlmPageResult | null> {
  const imageData = parseImageDataUrl(params.pageImageDataUrl);
  if (!imageData) {
    return null;
  }

  try {
    const claudeResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": params.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: params.anthropicModel,
        temperature: 0,
        max_tokens: 700,
        system: params.systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: params.userPrompt },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: imageData.mediaType,
                  data: imageData.base64Data,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      return null;
    }

    const claudeJson = (await claudeResponse.json()) as unknown;
    const claudeText = extractAnthropicResponseText(claudeJson);
    const claudeParsedOutput = parseJsonObjectFromText(claudeText);
    if (!claudeParsedOutput) {
      return null;
    }

    return normalizeVlmClassification({
      raw: claudeParsedOutput,
      fallback: params.fallbackResult,
      provider: "anthropic",
      model: params.anthropicModel,
      escalatedFromPrimary: params.escalatedFromPrimary,
    });
  } catch {
    return null;
  }
}

function isValidRequestBody(body: unknown): body is TradePackVlmPageRequest {
  if (!isRecord(body)) {
    return false;
  }

  return (
    typeof body.tradeId === "string" &&
    body.tradeId.length > 0 &&
    typeof body.tradeLabel === "string" &&
    body.tradeLabel.length > 0 &&
    typeof body.pageNumber === "number" &&
    Number.isInteger(body.pageNumber) &&
    body.pageNumber > 0 &&
    typeof body.totalPages === "number" &&
    Number.isInteger(body.totalPages) &&
    body.totalPages > 0 &&
    typeof body.pageText === "string" &&
    typeof body.pageImageDataUrl === "string" &&
    body.pageImageDataUrl.startsWith("data:image/") &&
    isRecord(body.prefilter)
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!isValidRequestBody(payload)) {
    return NextResponse.json({ error: "Invalid page classification request." }, { status: 400 });
  }

  const trade = getTradeById(payload.tradeId);
  if (!trade) {
    return NextResponse.json({ error: "Unknown trade id." }, { status: 400 });
  }

  const prefilter: TradePagePrefilterSignal = {
    shouldSendToVlm: Boolean(payload.prefilter.shouldSendToVlm),
    score: typeof payload.prefilter.score === "number" ? payload.prefilter.score : 0,
    matchedSheetPrefixes: toStringArray(payload.prefilter.matchedSheetPrefixes),
    matchedStructuredKeywords: toStringArray(payload.prefilter.matchedStructuredKeywords),
    matchedSecondaryKeywords: toStringArray(payload.prefilter.matchedSecondaryKeywords),
    matchedAbbreviations: toStringArray(payload.prefilter.matchedAbbreviations),
    supportMatches: toStringArray(payload.prefilter.supportMatches),
    isSupportSheet: Boolean(payload.prefilter.isSupportSheet),
    reason: typeof payload.prefilter.reason === "string" ? payload.prefilter.reason : "No prefilter reason",
  };

  const fallbackResult = buildFallbackClassification({
    tradeId: payload.tradeId,
    pageText: payload.pageText,
    prefilter,
    fallbackReason: "VLM unavailable",
  });

  const openAiApiKey = process.env.OPENAI_API_KEY;
  const openAiModel = process.env.OPENAI_VLM_MODEL || DEFAULT_OPENAI_VLM_MODEL;
  const anthropicApiKey = CLAUDE_FALLBACK_ENABLED
    ? process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? ""
    : "";
  const anthropicModel = process.env.ANTHROPIC_VLM_MODEL || DEFAULT_ANTHROPIC_VLM_MODEL;
  const textExcerpt = payload.pageText.slice(0, 12000);
  const prefilterHint = JSON.stringify(
    {
      shouldSendToVlm: prefilter.shouldSendToVlm,
      matchedSheetPrefixes: prefilter.matchedSheetPrefixes,
      matchedStructuredKeywords: prefilter.matchedStructuredKeywords,
      matchedSecondaryKeywords: prefilter.matchedSecondaryKeywords,
      matchedAbbreviations: prefilter.matchedAbbreviations,
      supportMatches: prefilter.supportMatches,
      reason: prefilter.reason,
    },
    null,
    2
  );

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({
    tradeLabel: payload.tradeLabel,
    tradeId: payload.tradeId,
    tradeKeywordHint: buildTradeKeywordHint(trade),
    pageNumber: payload.pageNumber,
    totalPages: payload.totalPages,
    textExcerpt,
    prefilterHint,
  });

  const responseSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      is_relevant: { type: "boolean" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      is_support_sheet: { type: "boolean" },
      reason: { type: "string" },
      support_reason: { type: "string" },
      trade_signals: { type: "array", items: { type: "string" } },
      secondary_trade_ids: { type: "array", items: { type: "string" } },
    },
    required: [
      "is_relevant",
      "confidence",
      "is_support_sheet",
      "reason",
      "support_reason",
      "trade_signals",
      "secondary_trade_ids",
    ],
  };

  if (!openAiApiKey) {
    if (anthropicApiKey) {
      const claudeOnlyResult = await classifyWithClaudeFallback({
        anthropicApiKey,
        anthropicModel,
        systemPrompt,
        userPrompt,
        pageImageDataUrl: payload.pageImageDataUrl,
        fallbackResult: buildFallbackClassification({
          tradeId: payload.tradeId,
          pageText: payload.pageText,
          prefilter,
          fallbackReason: "OpenAI primary unavailable",
        }),
        escalatedFromPrimary: true,
      });

      if (claudeOnlyResult) {
        return NextResponse.json({ result: claudeOnlyResult });
      }
    }

    return NextResponse.json({ result: fallbackResult });
  }

  try {
    const openAiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model: openAiModel,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: userPrompt },
              { type: "input_image", image_url: payload.pageImageDataUrl },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "trade_pack_page_classification",
            schema: responseSchema,
            strict: true,
          },
        },
      }),
    });

    if (!openAiResponse.ok) {
      if (anthropicApiKey) {
        const claudeOnPrimaryFailure = await classifyWithClaudeFallback({
          anthropicApiKey,
          anthropicModel,
          systemPrompt,
          userPrompt,
          pageImageDataUrl: payload.pageImageDataUrl,
          fallbackResult: buildFallbackClassification({
            tradeId: payload.tradeId,
            pageText: payload.pageText,
            prefilter,
            fallbackReason: `OpenAI primary failed with ${openAiResponse.status}`,
          }),
          escalatedFromPrimary: true,
        });

        if (claudeOnPrimaryFailure) {
          return NextResponse.json({ result: claudeOnPrimaryFailure });
        }
      }

      const message = `${openAiResponse.status} ${openAiResponse.statusText}`.trim();
      return NextResponse.json({
        result: buildFallbackClassification({
          tradeId: payload.tradeId,
          pageText: payload.pageText,
          prefilter,
          fallbackReason: `VLM request failed: ${message}`,
        }),
      });
    }

    const openAiJson = (await openAiResponse.json()) as unknown;
    const outputText = extractOpenAiResponseText(openAiJson);
    const parsedOutput = parseJsonObjectFromText(outputText);
    if (!parsedOutput) {
      if (anthropicApiKey) {
        const claudeOnSchemaAnomaly = await classifyWithClaudeFallback({
          anthropicApiKey,
          anthropicModel,
          systemPrompt,
          userPrompt,
          pageImageDataUrl: payload.pageImageDataUrl,
          fallbackResult: buildFallbackClassification({
            tradeId: payload.tradeId,
            pageText: payload.pageText,
            prefilter,
            fallbackReason: "OpenAI schema anomaly",
          }),
          escalatedFromPrimary: true,
        });

        if (claudeOnSchemaAnomaly) {
          return NextResponse.json({ result: claudeOnSchemaAnomaly });
        }
      }

      return NextResponse.json({
        result: buildFallbackClassification({
          tradeId: payload.tradeId,
          pageText: payload.pageText,
          prefilter,
          fallbackReason: "VLM returned unparsable output",
        }),
      });
    }

    const openAiResult = normalizeVlmClassification({
      raw: parsedOutput,
      fallback: buildFallbackClassification({
        tradeId: payload.tradeId,
        pageText: payload.pageText,
        prefilter,
        fallbackReason: "OpenAI returned invalid fields",
      }),
      provider: "openai",
      model: openAiModel,
      escalatedFromPrimary: false,
    });

    if (anthropicApiKey && shouldEscalateToClaude(openAiResult)) {
      const claudeOnAmbiguity = await classifyWithClaudeFallback({
        anthropicApiKey,
        anthropicModel,
        systemPrompt,
        userPrompt,
        pageImageDataUrl: payload.pageImageDataUrl,
        fallbackResult: openAiResult,
        escalatedFromPrimary: true,
      });

      if (claudeOnAmbiguity) {
        return NextResponse.json({ result: claudeOnAmbiguity });
      }
    }

    return NextResponse.json({ result: openAiResult });
  } catch {
    if (anthropicApiKey) {
      const claudeOnRequestError = await classifyWithClaudeFallback({
        anthropicApiKey,
        anthropicModel,
        systemPrompt,
        userPrompt,
        pageImageDataUrl: payload.pageImageDataUrl,
        fallbackResult: buildFallbackClassification({
          tradeId: payload.tradeId,
          pageText: payload.pageText,
          prefilter,
          fallbackReason: "OpenAI request error",
        }),
        escalatedFromPrimary: true,
      });

      if (claudeOnRequestError) {
        return NextResponse.json({ result: claudeOnRequestError });
      }
    }

    return NextResponse.json({
      result: buildFallbackClassification({
        tradeId: payload.tradeId,
        pageText: payload.pageText,
        prefilter,
        fallbackReason: "VLM request error",
      }),
    });
  }
}
