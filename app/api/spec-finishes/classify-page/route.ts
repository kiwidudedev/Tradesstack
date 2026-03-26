import { NextResponse } from "next/server";
import { getSpecFinishesTradeById, analyzePageForSpecFinishesTrade } from "@/lib/spec-finishes-builder";
import { clampConfidence, type TradePackVlmPageRequest, type TradePackVlmPageResult } from "@/lib/trade-pack-vlm";
import { getCurrentOrganizationMember } from "@/lib/projects-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { enforceRouteGuard } from "@/lib/security/abuse-guard";
import { fetchWithTimeout } from "@/lib/security/fetch-timeout";

export const runtime = "nodejs";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_VLM_MODEL = "gpt-5.2";
const MAX_CLASSIFY_PAGE_TEXT_CHARS = 12000;
const MAX_CLASSIFY_IMAGE_BYTES = 1_500_000;
const CLASSIFY_TIMEOUT_MS = 20_000;
const ENABLE_SPEC_FINISHES_CLASSIFY_LOGS = true;

interface SpecFinishesPrefilterSignal {
  shouldSendToVlm: boolean;
  score: number;
  matchedSheetPrefixes: string[];
  matchedStructuredKeywords: string[];
  matchedSecondaryKeywords: string[];
  matchedAbbreviations: string[];
  supportMatches: string[];
  isSupportSheet: boolean;
  reason: string;
}

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

  try {
    const parsed = JSON.parse(trimmed);
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

function estimateBase64Bytes(base64Data: string): number {
  const padding = base64Data.endsWith("==") ? 2 : base64Data.endsWith("=") ? 1 : 0;
  return Math.floor((base64Data.length * 3) / 4) - padding;
}

function buildFallbackClassification(params: {
  tradeId: string;
  pageText: string;
  prefilter: SpecFinishesPrefilterSignal;
  fallbackReason: string;
}): TradePackVlmPageResult {
  const { tradeId, pageText, prefilter, fallbackReason } = params;
  const trade = getSpecFinishesTradeById(tradeId);
  const signal = trade ? analyzePageForSpecFinishesTrade(pageText, trade) : null;

  const confidence = signal ? clampConfidence(signal.confidence + (prefilter.isSupportSheet ? 0.06 : 0)) : 0.32;
  const isRelevant = Boolean(signal?.isRelevant || prefilter.isSupportSheet);
  const reason = signal?.reason ?? prefilter.reason;
  const tradeSignals = signal
    ? [
      ...signal.matchedTradeKeywords.slice(0, 3),
      ...signal.matchedHeadings.slice(0, 2),
      ...signal.matchedSchedules.slice(0, 2),
    ]
    : [
      ...prefilter.matchedStructuredKeywords.slice(0, 2),
      ...prefilter.matchedSecondaryKeywords.slice(0, 2),
    ];

  return {
    classificationMode: "fallback-rules",
    isRelevant,
    confidence,
    isSupportSheet: prefilter.isSupportSheet,
    reason: `${reason} (${fallbackReason})`,
    supportReason: prefilter.isSupportSheet ? prefilter.supportMatches[0] ?? "Support-sheet keyword match" : null,
    tradeSignals,
    secondaryTradeIds: [],
    provider: "rules",
    model: "spec-finishes-rules",
    escalatedFromPrimary: false,
  };
}

function normalizeVlmClassification(params: {
  raw: unknown;
  fallback: TradePackVlmPageResult;
  model: string;
}): TradePackVlmPageResult {
  const { raw, fallback, model } = params;
  if (!isRecord(raw)) {
    return fallback;
  }

  const isRelevant = typeof raw.is_relevant === "boolean" ? raw.is_relevant : fallback.isRelevant;
  const confidence = typeof raw.confidence === "number" ? clampConfidence(raw.confidence) : fallback.confidence;
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
    provider: "openai",
    model,
    escalatedFromPrimary: false,
  };
}

function isValidRequestBody(body: unknown): body is TradePackVlmPageRequest {
  if (!isRecord(body)) {
    return false;
  }

  return (
    typeof body.organizationId === "string" &&
    body.organizationId.length > 0 &&
    typeof body.projectId === "string" &&
    body.projectId.length > 0 &&
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

function buildSystemPrompt(): string {
  return (
    "You are a construction document classifier for AU/NZ architectural specifications and finishes schedules. " +
    "Classify one page for the selected trade. " +
    "Read both the page image and extracted text. " +
    "Return strict JSON only."
  );
}

function buildUserPrompt(params: {
  tradeId: string;
  tradeLabel: string;
  pageNumber: number;
  totalPages: number;
  textExcerpt: string;
  tradeProfileHint: string;
  prefilterHint: string;
}): string {
  return (
    `Selected trade: ${params.tradeLabel} (${params.tradeId})\n` +
    `Page: ${params.pageNumber} of ${params.totalPages}\n\n` +
    "Task: classify whether this page is relevant to trade-specific architectural specification and finishes content.\n" +
    "Weighting:\n" +
    "- Spec headings and schedules are strongest\n" +
    "- Trade-specific terms are required for high confidence\n" +
    "- Support sheets can be included if they aid interpretation\n\n" +
    `Trade profile:\n${params.tradeProfileHint}\n\n` +
    `Prefilter signals:\n${params.prefilterHint}\n\n` +
    `Extracted text:\n${params.textExcerpt}`
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

  const trade = getSpecFinishesTradeById(payload.tradeId);
  if (!trade) {
    return NextResponse.json({ error: "Unknown spec finishes trade id." }, { status: 400 });
  }

  const member = await getCurrentOrganizationMember();
  if (!member) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (payload.organizationId !== member.organization_id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: projectRow, error: projectError } = await supabase
    .from("organization_projects")
    .select("id")
    .eq("id", payload.projectId)
    .eq("organization_id", payload.organizationId)
    .limit(1)
    .maybeSingle();

  if (projectError || !projectRow) {
    return NextResponse.json({ error: "Project context unavailable." }, { status: 403 });
  }

  if (payload.pageText.length > MAX_CLASSIFY_PAGE_TEXT_CHARS) {
    return NextResponse.json({ error: "Page text payload is too large." }, { status: 413 });
  }

  const parsedImage = parseImageDataUrl(payload.pageImageDataUrl);
  if (!parsedImage) {
    return NextResponse.json({ error: "Invalid image payload." }, { status: 400 });
  }

  if (estimateBase64Bytes(parsedImage.base64Data) > MAX_CLASSIFY_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image payload is too large." }, { status: 413 });
  }

  const guard = await enforceRouteGuard({
    routeKey: "spec-finishes-classify-page",
    request,
    userId: member.user_id,
    userPerMinute: 90,
    ipPerMinute: 180,
    concurrentPerUser: 4,
  });

  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const prefilter: SpecFinishesPrefilterSignal = {
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
  if (!openAiApiKey) {
    if (ENABLE_SPEC_FINISHES_CLASSIFY_LOGS) {
      console.log(
        `[spec-finishes/classify] page=${payload.pageNumber}/${payload.totalPages} trade=${payload.tradeId} openai=skipped reason=missing_api_key`
      );
    }
    return NextResponse.json({ result: fallbackResult });
  }

  const openAiModel = process.env.OPENAI_SPEC_FINISHES_CLASSIFY_MODEL || DEFAULT_OPENAI_VLM_MODEL;

  const profileHint = JSON.stringify(
    {
      sheetPrefixes: trade.sheetPrefixes,
      primaryKeywords: trade.primaryKeywords,
      secondaryKeywords: trade.secondaryKeywords,
      abbreviations: trade.abbreviations,
      specHeadings: trade.specHeadings,
      scheduleKeywords: trade.scheduleKeywords,
      fixtureKeywords: trade.fixtureKeywords,
      materialKeywords: trade.materialKeywords,
      systemKeywords: trade.systemKeywords,
      excludeKeywords: trade.excludeKeywords,
    },
    null,
    2
  );

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
    tradeId: payload.tradeId,
    tradeLabel: payload.tradeLabel,
    pageNumber: payload.pageNumber,
    totalPages: payload.totalPages,
    textExcerpt: payload.pageText.slice(0, 12000),
    tradeProfileHint: profileHint,
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

  try {
    if (ENABLE_SPEC_FINISHES_CLASSIFY_LOGS) {
      console.log(
        `[spec-finishes/classify] page=${payload.pageNumber}/${payload.totalPages} trade=${payload.tradeId} openai=send`
      );
    }
    const openAiResponse = await fetchWithTimeout(
      OPENAI_API_URL,
      {
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
              name: "spec_finishes_page_classification",
              schema: responseSchema,
              strict: true,
            },
          },
        }),
      },
      CLASSIFY_TIMEOUT_MS
    );

    if (!openAiResponse.ok) {
      if (ENABLE_SPEC_FINISHES_CLASSIFY_LOGS) {
        console.log(
          `[spec-finishes/classify] page=${payload.pageNumber}/${payload.totalPages} trade=${payload.tradeId} openai=fallback reason=status_${openAiResponse.status}`
        );
      }
      return NextResponse.json({
        result: buildFallbackClassification({
          tradeId: payload.tradeId,
          pageText: payload.pageText,
          prefilter,
          fallbackReason: `VLM request failed: ${openAiResponse.status}`,
        }),
      });
    }

    const openAiJson = (await openAiResponse.json()) as unknown;
    const outputText = extractOpenAiResponseText(openAiJson);
    const parsedOutput = parseJsonObjectFromText(outputText);
    if (!parsedOutput) {
      if (ENABLE_SPEC_FINISHES_CLASSIFY_LOGS) {
        console.log(
          `[spec-finishes/classify] page=${payload.pageNumber}/${payload.totalPages} trade=${payload.tradeId} openai=fallback reason=unparsable_output`
        );
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

    const result = normalizeVlmClassification({
      raw: parsedOutput,
      fallback: buildFallbackClassification({
        tradeId: payload.tradeId,
        pageText: payload.pageText,
        prefilter,
        fallbackReason: "OpenAI returned invalid fields",
      }),
      model: openAiModel,
    });

    if (ENABLE_SPEC_FINISHES_CLASSIFY_LOGS) {
      console.log(
        `[spec-finishes/classify] page=${payload.pageNumber}/${payload.totalPages} trade=${payload.tradeId} openai=ok relevant=${result.isRelevant} support=${result.isSupportSheet} confidence=${result.confidence.toFixed(2)}`
      );
    }
    return NextResponse.json({ result });
  } catch {
    if (ENABLE_SPEC_FINISHES_CLASSIFY_LOGS) {
      console.log(
        `[spec-finishes/classify] page=${payload.pageNumber}/${payload.totalPages} trade=${payload.tradeId} openai=fallback reason=request_error`
      );
    }
    return NextResponse.json({
      result: buildFallbackClassification({
        tradeId: payload.tradeId,
        pageText: payload.pageText,
        prefilter,
        fallbackReason: "VLM request error",
      }),
    });
  } finally {
    await guard.release();
  }
}
