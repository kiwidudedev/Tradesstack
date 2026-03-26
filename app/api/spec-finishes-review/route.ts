import { NextResponse } from "next/server";
import { enforceRouteGuard } from "@/lib/security/abuse-guard";
import { fetchWithTimeout } from "@/lib/security/fetch-timeout";
import { hasPdfSignature } from "@/lib/security/pdf-signature";
import { getSpecFinishesTradeById } from "@/lib/spec-finishes-builder";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.2";
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const AI_TIMEOUT_MS = 120_000;

interface StructuredItem {
  title: string;
  description: string;
}

interface SpecFinishesReviewPayload {
  tradeLabel: string;
  projectSummary: StructuredItem[];
  keyFinishes: StructuredItem[];
  materials: StructuredItem[];
  fixtures: StructuredItem[];
  systems: StructuredItem[];
  assumptions: StructuredItem[];
  exclusions: StructuredItem[];
  risksClarificationsRequired: StructuredItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTrimmedFormString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStructuredItemArray(value: unknown): StructuredItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: StructuredItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const description = typeof entry.description === "string" ? entry.description.trim() : "";
    if (title && description) {
      normalized.push({ title, description });
    }
  }

  return normalized;
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

function toReviewPayload(value: unknown): SpecFinishesReviewPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const tradeLabel = typeof value.tradeLabel === "string" ? value.tradeLabel.trim() : "";
  const projectSummary = toStructuredItemArray(value.projectSummary);
  const keyFinishes = toStructuredItemArray(value.keyFinishes);
  const materials = toStructuredItemArray(value.materials);
  const fixtures = toStructuredItemArray(value.fixtures);
  const systems = toStructuredItemArray(value.systems);
  const assumptions = toStructuredItemArray(value.assumptions);
  const exclusions = toStructuredItemArray(value.exclusions);
  const risksClarificationsRequired = toStructuredItemArray(value.risksClarificationsRequired);

  const isValid =
    tradeLabel.length > 0 &&
    projectSummary.length > 0 &&
    keyFinishes.length > 0 &&
    materials.length > 0 &&
    fixtures.length > 0 &&
    systems.length > 0 &&
    assumptions.length > 0 &&
    exclusions.length > 0 &&
    risksClarificationsRequired.length > 0;

  if (!isValid) {
    return null;
  }

  return {
    tradeLabel,
    projectSummary,
    keyFinishes,
    materials,
    fixtures,
    systems,
    assumptions,
    exclusions,
    risksClarificationsRequired,
  };
}

function isMissingTableInSchemaCacheError(error: unknown, tableName: string): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === "string" ? error.code.trim().toUpperCase() : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const details = typeof error.details === "string" ? error.details.toLowerCase() : "";
  const needle = tableName.toLowerCase();

  if (code === "PGRST205" && (message.includes(needle) || details.includes(needle))) {
    return true;
  }

  return message.includes("schema cache") && message.includes(needle);
}

function buildPrompt(sourceDocumentName: string, extractedPageCount: number, tradeLabel: string): string {
  return `You are a Senior Quantity Surveyor reviewing architectural specifications and finishes schedules for an AU/NZ tender.

You are given only the filtered pages likely to contain specification and finishes content.

Source document: ${sourceDocumentName}
Extracted pages: ${extractedPageCount}
Trade heading: ${tradeLabel}

Produce a structured summary focused on procurement, pricing, and scope clarity.

Rules:
- Use only information present in the document.
- Do not invent brands, model numbers, or performance requirements.
- If detail is missing, say "Not specified in document".
- Preserve numeric values, finish codes, and references exactly.
- Use concise professional QS language.

Return JSON only in the provided schema with these sections:
1) projectSummary
2) keyFinishes
3) materials
4) fixtures
5) systems
6) assumptions
7) exclusions
8) risksClarificationsRequired

For each list item:
- title: short heading
- description: specific detail including references or location when available.`;
}

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "tradeLabel",
    "projectSummary",
    "keyFinishes",
    "materials",
    "fixtures",
    "systems",
    "assumptions",
    "exclusions",
    "risksClarificationsRequired",
  ],
  properties: {
    tradeLabel: { type: "string" },
    projectSummary: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    keyFinishes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    materials: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    fixtures: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    systems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    assumptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    exclusions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    risksClarificationsRequired: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
  },
} as const;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guard = await enforceRouteGuard({
    request,
    userId: user.id,
    routeKey: "spec-finishes-review",
    userPerMinute: 4,
    ipPerMinute: 12,
    concurrentPerUser: 2,
  });
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid multipart request." }, { status: 400 });
    }

    const fileValue = formData.get("pdf");
    if (!(fileValue instanceof File)) {
      return NextResponse.json({ error: "PDF file is required." }, { status: 400 });
    }

    const lowerName = fileValue.name.toLowerCase();
    const isPdf = fileValue.type === "application/pdf" || lowerName.endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }

    if (fileValue.size <= 0) {
      return NextResponse.json({ error: "Uploaded PDF is empty." }, { status: 400 });
    }

    if (fileValue.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `PDF is too large. Maximum allowed size is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.` },
        { status: 400 }
      );
    }

    if (!(await hasPdfSignature(fileValue))) {
      return NextResponse.json({ error: "Uploaded file is not a valid PDF." }, { status: 400 });
    }

    const organizationId = toTrimmedFormString(formData.get("organizationId"));
    const projectId = toTrimmedFormString(formData.get("projectId"));
    const tradeId = toTrimmedFormString(formData.get("tradeId"));
    const sourceDocumentName = toTrimmedFormString(formData.get("sourceDocumentName")) || fileValue.name;
    const extractedPageCountRaw = Number.parseInt(toTrimmedFormString(formData.get("extractedPageCount")), 10);
    const extractedPageCount = Number.isFinite(extractedPageCountRaw) && extractedPageCountRaw > 0
      ? extractedPageCountRaw
      : 0;
    const forceRefresh = toTrimmedFormString(formData.get("forceRefresh")).toLowerCase() === "true";

    if (!organizationId || !projectId) {
      return NextResponse.json({ error: "organizationId and projectId are required." }, { status: 400 });
    }

    if (!tradeId) {
      return NextResponse.json({ error: "tradeId is required." }, { status: 400 });
    }

    const selectedTrade = getSpecFinishesTradeById(tradeId);
    if (!selectedTrade) {
      return NextResponse.json({ error: `Unknown trade id: ${tradeId}` }, { status: 400 });
    }

    const { data: memberRow, error: memberError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (memberError || !memberRow) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (memberRow.organization_id !== organizationId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { data: projectRow, error: projectError } = await supabase
      .from("organization_projects")
      .select("id")
      .eq("id", projectId)
      .eq("organization_id", organizationId)
      .limit(1)
      .maybeSingle();

    if (projectError || !projectRow) {
      return NextResponse.json({ error: "Project context unavailable." }, { status: 403 });
    }

    const cacheContextProvided = Boolean(organizationId && projectId);
    let runId: string | null = null;
    let cacheHit = false;
    let cacheStored = false;
    let cacheReason: string | null = null;

    const supabaseAny = supabase as unknown as {
      from: (table: string) => {
        select: (...args: unknown[]) => {
          eq: (column: string, value: unknown) => unknown;
          order: (column: string, options: { ascending: boolean }) => unknown;
          limit: (value: number) => unknown;
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
        };
        insert: (value: Record<string, unknown>) => {
          select: (...args: unknown[]) => {
            single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
          };
        };
        update: (value: Record<string, unknown>) => {
          eq: (column: string, value: unknown) => Promise<{ error: unknown }>;
        };
      };
    };

    if (cacheContextProvided && !forceRefresh) {
      const latestResultQuery = supabaseAny
        .from("spec_finishes_runs")
        .select("id, result_json, created_at") as {
          eq: (column: string, value: unknown) => {
            eq: (column: string, value: unknown) => {
              eq: (column: string, value: unknown) => {
                eq: (column: string, value: unknown) => {
                  order: (column: string, options: { ascending: boolean }) => {
                    limit: (value: number) => {
                      maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
                    };
                  };
                };
              };
            };
          };
        };

      const { data: latestRun, error: latestRunError } = await latestResultQuery
        .eq("organization_id", organizationId)
        .eq("project_id", projectId)
        .eq("trade_id", selectedTrade.id)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestRunError && latestRun?.result_json) {
        const parsed = toReviewPayload(latestRun.result_json);
        if (parsed) {
          cacheHit = true;
          const normalizedCached: SpecFinishesReviewPayload = {
            ...parsed,
            tradeLabel: selectedTrade.label,
          };
          return NextResponse.json({
            model: process.env.OPENAI_SPEC_FINISHES_MODEL || DEFAULT_MODEL,
            tradeId: selectedTrade.id,
            tradeLabel: selectedTrade.label,
            fileName: fileValue.name,
            generatedAt: latestRun.created_at,
            result: normalizedCached,
            cache: {
              hit: true,
              stored: true,
              runId: latestRun.id,
              reason: "Loaded from spec_finishes_runs cache.",
            },
          });
        }
      } else if (latestRunError && !isMissingTableInSchemaCacheError(latestRunError, "spec_finishes_runs")) {
        cacheReason = "Unable to read existing review cache.";
      }
    }

    if (cacheContextProvided) {
      const { data: insertedRun, error: insertedRunError } = await (supabaseAny
        .from("spec_finishes_runs")
        .insert({
          organization_id: organizationId,
          project_id: projectId,
          trade_id: selectedTrade.id,
          trade_label: selectedTrade.label,
          created_by: user.id,
          status: "running",
          source_document_name: sourceDocumentName,
          extracted_page_count: extractedPageCount,
          result_json: {},
        })
        .select("id")
        .single() as Promise<{ data: Record<string, unknown> | null; error: unknown }>);

      if (!insertedRunError && insertedRun?.id && typeof insertedRun.id === "string") {
        runId = insertedRun.id;
      } else if (isMissingTableInSchemaCacheError(insertedRunError, "spec_finishes_runs")) {
        cacheReason = "Cache table not deployed (spec_finishes_runs).";
      } else if (insertedRunError) {
        cacheReason = "Unable to create spec finishes run.";
      }
    }

    const markRunFailed = async (errorMessage: string) => {
      if (!runId) {
        return;
      }

      await supabaseAny
        .from("spec_finishes_runs")
        .update({
          status: "failed",
          error_message: errorMessage.slice(0, 4000),
        })
        .eq("id", runId);
    };

    const openAiApiKey = process.env.OPENAI_API_KEY;
    if (!openAiApiKey) {
      await markRunFailed("Missing OPENAI_API_KEY.");
      return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
    }

    const pdfBase64 = Buffer.from(await fileValue.arrayBuffer()).toString("base64");
    const model = process.env.OPENAI_SPEC_FINISHES_MODEL || DEFAULT_MODEL;
    const prompt = buildPrompt(sourceDocumentName, extractedPageCount, selectedTrade.label);

    let responseJson: unknown;
    try {
      const openAiResponse = await fetchWithTimeout(
        OPENAI_API_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAiApiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_output_tokens: 120000,
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: prompt,
                  },
                  {
                    type: "input_file",
                    filename: fileValue.name || "spec-finishes-pages.pdf",
                    file_data: `data:application/pdf;base64,${pdfBase64}`,
                  },
                ],
              },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "spec_finishes_review_output",
                schema: RESPONSE_JSON_SCHEMA,
                strict: true,
              },
            },
          }),
        },
        AI_TIMEOUT_MS
      );

      if (!openAiResponse.ok) {
        throw new Error(`OpenAI request failed (${openAiResponse.status}).`);
      }

      responseJson = await openAiResponse.json();
    } catch (error) {
      console.error("[spec-finishes-review] upstream request failed", error);
      await markRunFailed("AI provider request failed.");
      return NextResponse.json({ error: "AI provider request failed." }, { status: 502 });
    }

    const outputText = extractOpenAiResponseText(responseJson);
    const parsedOutput = parseJsonObjectFromText(outputText);
    const reviewPayload = toReviewPayload(parsedOutput);

    if (!reviewPayload) {
      await markRunFailed("Model returned invalid spec finishes JSON.");
      return NextResponse.json({ error: "Model returned invalid spec finishes JSON. Please rerun." }, { status: 502 });
    }
    const normalizedReviewPayload: SpecFinishesReviewPayload = {
      ...reviewPayload,
      tradeLabel: selectedTrade.label,
    };

    if (runId) {
      const { error: updateRunError } = await supabaseAny
        .from("spec_finishes_runs")
        .update({
          status: "complete",
          result_json: normalizedReviewPayload as unknown as Record<string, unknown>,
          error_message: null,
        })
        .eq("id", runId);

      if (!updateRunError) {
        cacheStored = true;
      } else {
        cacheReason = "Unable to persist spec finishes result.";
      }
    }

    return NextResponse.json({
      model,
      tradeId: selectedTrade.id,
      tradeLabel: selectedTrade.label,
      fileName: fileValue.name,
      generatedAt: new Date().toISOString(),
      result: normalizedReviewPayload,
      cache: {
        hit: cacheHit,
        stored: cacheStored,
        runId,
        reason: cacheReason,
      },
    });
  } finally {
    await guard.release();
  }
}
