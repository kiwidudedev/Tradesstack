import { NextResponse } from "next/server";
import { PROJECT_DRAWING_SETS_BUCKET } from "@/lib/drawing-sets";
import { enforceRouteGuard } from "@/lib/security/abuse-guard";
import { fetchWithTimeout } from "@/lib/security/fetch-timeout";
import { hasPdfSignature } from "@/lib/security/pdf-signature";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getTradeById } from "@/lib/trade-pack-builder";

export const runtime = "nodejs";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_SCOPE_MODEL = "gpt-5.2";
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const DEFAULT_SCOPE_MAX_OUTPUT_TOKENS = 128000;
const SCOPE_RETRY_MAX_OUTPUT_TOKENS = 128000;
const SCOPE_AI_TIMEOUT_MS = 120_000;

interface ScopeStructuredItem {
  title: string;
  description: string;
}

interface ScopePricingStructure {
  costBreakdownCategories: ScopeStructuredItem[];
  measurementUnits: ScopeStructuredItem[];
  keyCostDrivers: ScopeStructuredItem[];
  marginSensitiveItems: ScopeStructuredItem[];
}

interface ScopeBuilderResponsePayload {
  tradeLabel: string;
  summary: ScopeStructuredItem[];
  generalRequirements: ScopeStructuredItem[];
  coordinationInterfaces: ScopeStructuredItem[];
  assumptions: ScopeStructuredItem[];
  exclusions: ScopeStructuredItem[];
  risksClarificationsRequired: ScopeStructuredItem[];
  pricingStructure: ScopePricingStructure;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStructuredItemFromString(value: string): ScopeStructuredItem | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const delimiters = [" — ", " – ", " - ", ": ", "; "];
  for (const delimiter of delimiters) {
    const index = normalized.indexOf(delimiter);
    if (index > 1 && index < 80) {
      const title = normalized.slice(0, index).trim();
      const description = normalized.slice(index + delimiter.length).trim();
      if (title && description) {
        return { title, description };
      }
    }
  }

  return {
    title: normalized,
    description: "Not specified in drawings",
  };
}

function toStructuredItemArray(value: unknown): ScopeStructuredItem[] {
  if (typeof value === "string") {
    const parsed = toStructuredItemFromString(value);
    return parsed ? [parsed] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: ScopeStructuredItem[] = [];

  for (const entry of value) {
    if (isRecord(entry)) {
      const title = typeof entry.title === "string" ? entry.title.trim() : "";
      const description = typeof entry.description === "string" ? entry.description.trim() : "";
      if (title && description) {
        normalized.push({ title, description });
        continue;
      }

      // Backward-safe normalization for legacy unit rows.
      const item = typeof entry.item === "string" ? entry.item.trim() : "";
      const unit = typeof entry.unit === "string" ? entry.unit.trim() : "";
      if (item && unit) {
        normalized.push({ title: item, description: unit });
      }
      continue;
    }

    if (typeof entry === "string") {
      const parsed = toStructuredItemFromString(entry);
      if (parsed) {
        normalized.push(parsed);
      }
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

function isMaxOutputTokenIncomplete(responseJson: unknown): boolean {
  if (!isRecord(responseJson)) {
    return false;
  }

  if (responseJson.status !== "incomplete") {
    return false;
  }

  const incompleteDetails = responseJson.incomplete_details;
  if (!isRecord(incompleteDetails)) {
    return false;
  }

  return incompleteDetails.reason === "max_output_tokens";
}

function toScopeBuilderPayload(value: unknown): ScopeBuilderResponsePayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const summary = toStructuredItemArray(value.summary);
  const tradeLabel = typeof value.tradeLabel === "string" ? value.tradeLabel.trim() : "";
  const generalRequirements = toStructuredItemArray(value.generalRequirements);
  const coordinationInterfaces = toStructuredItemArray(value.coordinationInterfaces);
  const assumptions = toStructuredItemArray(value.assumptions);
  const exclusions = toStructuredItemArray(value.exclusions);
  const risksClarificationsRequired = toStructuredItemArray(
    isRecord(value) && "risksClarificationsRequired" in value ? value.risksClarificationsRequired : value.risksClarifications
  );

  const pricingRaw = value.pricingStructure;
  if (!isRecord(pricingRaw)) {
    return null;
  }

  const costBreakdownCategories = toStructuredItemArray(pricingRaw.costBreakdownCategories);
  const measurementUnits = toStructuredItemArray(pricingRaw.measurementUnits);
  const keyCostDrivers = toStructuredItemArray(pricingRaw.keyCostDrivers);
  const marginSensitiveItems = toStructuredItemArray(
    isRecord(pricingRaw) && "marginSensitiveItems" in pricingRaw
      ? pricingRaw.marginSensitiveItems
      : pricingRaw.marginImpactItems
  );

  const hasCoreData =
    summary.length > 0 &&
    generalRequirements.length > 0 &&
    coordinationInterfaces.length > 0 &&
    assumptions.length > 0 &&
    exclusions.length > 0 &&
    risksClarificationsRequired.length > 0;

  const hasPricingData =
    costBreakdownCategories.length > 0 &&
    measurementUnits.length > 0 &&
    keyCostDrivers.length > 0 &&
    marginSensitiveItems.length > 0;

  if (!tradeLabel || !hasCoreData || !hasPricingData) {
    return null;
  }

  return {
    tradeLabel,
    summary,
    generalRequirements,
    coordinationInterfaces,
    assumptions,
    exclusions,
    risksClarificationsRequired,
    pricingStructure: {
      costBreakdownCategories,
      measurementUnits,
      keyCostDrivers,
      marginSensitiveItems,
    },
  };
}

function buildScopePrompt(tradeLabel: string): string {
  return `You are a Senior Quantity Surveyor operating in New Zealand / Australia.

The attached documents represent a fully extracted trade package where irrelevant drawings have already been removed.

Your task is to review this trade package and generate a professional, pricing-ready subcontract Scope of Works suitable for initial subcontract tender pricing.

Trade: ${tradeLabel}

Assume this package is for:

Subcontract tender pricing

Pricing based primarily on drawings

NZ/AUS residential or commercial construction

Drawings may be incomplete or missing specification data

Think like a Senior QS preparing a subcontract pricing package.

Focus only on information affecting:

Cost

Scope

Coordination

Risk

Buildability

Do NOT provide general drawing summaries.

CRITICAL OUTPUT FORMAT

The output must be structured using the following sections in this exact order.

Each section must contain clear bullet items, where each item includes:

Title
Description

The Title must be a short professional heading.
The Description must explain the item clearly.

Never output generic headings such as:

Cost Category 1
Item 1
Other
Miscellaneous

REQUIRED OUTPUT STRUCTURE
1. Summary

Provide a short overview of the trade scope.

Format:

Title
Description

Example:

Trade scope overview
High level summary of the systems and work included in this subcontract package.

2. General Requirements

Identify key construction scope requirements.

Each item must follow:

Title
Description

Examples:

Installation scope
Supply and installation of all carpentry works shown on drawings.

Referenced systems
Timber framing systems, bulkheads and support framing indicated in architectural details.

Drawing references
Work to be carried out in accordance with architectural drawings and relevant schedules.

3. Cost Breakdown Categories

Provide subcontract pricing categories suitable for pricing breakdown.

Each item must follow:

Title
Description

Examples:

Preliminaries
Set-out, shop drawings, coordination and site measure.

Partition framing
Timber or metal stud framing to new partitions.

Bulkhead framing
Feature bulkheads including trimming around services.

Joinery backing / nogging
In-wall support framing for joinery, signage and wall mounted equipment.

Glazing support framing
Structural support framing to frameless glazing channels above head.

Making good / remedial works
Making good to existing walls and structure where carpentry works occur.

Fixings and anchors
Fixings to slab, columns and base building structure including proprietary anchors.

Allowances / provisional sums
Allowances for works pending issue of detailed elevations or joinery drawings.

RULES FOR COST BREAKDOWN

- Titles must be 3-8 words maximum
- Titles must read like real subcontract pricing categories
- Do NOT output placeholders such as Cost Category 5
- Descriptions must expand on the title, not repeat it

4. Measurement Units

Suggest suitable measurement units for pricing.

Format:

Title
Description

Example:

Partition framing
Measured in square metres (m2)

Bulkhead framing
Measured in linear metres (lm)

Joinery backing
Measured in linear metres (lm)

5. Key Cost Drivers

Identify elements that significantly influence subcontract pricing.

Format:

Title
Description

Example:

Structural complexity
Additional framing required around openings or glazing systems.

Access conditions
Work at height or confined installation areas.

Material specification
Higher grade materials or proprietary systems specified.

6. Margin-Sensitive Items

Identify scope elements likely to impact subcontract margin.

Format:

Title
Description

Example:

Incomplete detailing
Bulkhead dimensions or joinery details not fully defined.

Coordination dependencies
Framing dependent on mechanical or electrical services routing.

7. Coordination & Interfaces

Identify coordination with other trades.

Format:

Title
Description

Example:

Electrical coordination
Framing to accommodate electrical services and switchboard penetrations.

Hydraulic coordination
Allowance for pipe penetrations through framing.

8. Assumptions

Provide reasonable QS assumptions required to price the works.

Format:

Title
Description

Example:

Standard framing spacing assumed
Assumed typical framing centres where not specified.

9. Exclusions

Identify items clearly outside the subcontract scope.

Format:

Title
Description

Example:

Structural steel
Structural steel framing by others.

Mechanical supports
HVAC support structures by mechanical contractor.

10. Risks & Clarifications Required

Identify pricing risks or missing information.

Format:

Title
Description

Example:

Missing joinery details
Joinery elevations not included in the current drawing set.

Unclear glazing interface
Framing requirements around glazing channels require confirmation.

EXTRACTION RULES

When reviewing drawings, extract only information affecting:

construction scope

pricing

installation method

coordination

buildability

Capture details such as:

system types

materials

sizes and dimensions

spacing / centres

fire or acoustic requirements

fixing methods

finishes

referenced schedules

special construction details

Where visible, include drawing sheet references.

Example:

90mm timber studs at 600 centres (A401 - Wall Type W3)

IMPORTANT RULES

- Do not invent specifications
- If information is missing, state "Not specified in drawings"
- Do not describe architecture or design intent
- Focus only on construction and pricing scope
- Preserve numeric values exactly as shown in drawings
- Maintain professional QS tone

The output should read like a professional subcontract pricing scope prepared by a Senior Quantity Surveyor.`;
}

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tradeLabel: { type: "string" },
    summary: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title", "description"],
      },
    },
    generalRequirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title", "description"],
      },
    },
    coordinationInterfaces: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title", "description"],
      },
    },
    assumptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title", "description"],
      },
    },
    exclusions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title", "description"],
      },
    },
    risksClarificationsRequired: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title", "description"],
      },
    },
    pricingStructure: {
      type: "object",
      additionalProperties: false,
      properties: {
        costBreakdownCategories: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              description: { type: "string" },
            },
            required: ["title", "description"],
          },
        },
        measurementUnits: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              description: { type: "string" },
            },
            required: ["title", "description"],
          },
        },
        keyCostDrivers: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              description: { type: "string" },
            },
            required: ["title", "description"],
          },
        },
        marginSensitiveItems: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              description: { type: "string" },
            },
            required: ["title", "description"],
          },
        },
      },
      required: ["costBreakdownCategories", "measurementUnits", "keyCostDrivers", "marginSensitiveItems"],
    },
  },
  required: [
    "tradeLabel",
    "summary",
    "generalRequirements",
    "coordinationInterfaces",
    "assumptions",
    "exclusions",
    "risksClarificationsRequired",
    "pricingStructure",
  ],
};

function toTrimmedFormString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function toOptionalTrimmedFormString(value: FormDataEntryValue | null): string | null {
  const normalized = toTrimmedFormString(value);
  return normalized.length > 0 ? normalized : null;
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

function toTradePackPdfUrl(storagePath: string | null, fileName: string): string {
  if (storagePath && storagePath.length > 0) {
    return `supabase://${PROJECT_DRAWING_SETS_BUCKET}/${storagePath}`;
  }

  return `upload://${fileName}`;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const guard = await enforceRouteGuard({
    routeKey: "scope-builder",
    request,
    userId: user.id,
    userPerMinute: 6,
    ipPerMinute: 20,
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

  const tradeId = toTrimmedFormString(formData.get("tradeId"));
  if (!tradeId) {
    return NextResponse.json({ error: "tradeId is required." }, { status: 400 });
  }

  const selectedTrade = getTradeById(tradeId);
  if (!selectedTrade) {
    return NextResponse.json({ error: `Unknown trade id: ${tradeId}` }, { status: 400 });
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

  const projectId = toOptionalTrimmedFormString(formData.get("projectId"));
  const organizationId = toOptionalTrimmedFormString(formData.get("organizationId"));
  const drawingSetId = toOptionalTrimmedFormString(formData.get("drawingSetId"));
  const providedStoragePath = toOptionalTrimmedFormString(formData.get("storagePath"));
  const forceRefresh = toTrimmedFormString(formData.get("forceRefresh")).toLowerCase() === "true";

  const cacheContextProvided = Boolean(projectId && organizationId && drawingSetId);
  let cacheTradePackId: string | null = drawingSetId;
  let cacheRunId: string | null = null;
  let cacheStored = false;
  let cacheReason: string | null = null;
  let canPersistCache = false;
  let shouldCreateTradePack = false;
  let resolvedStoragePath: string | null = providedStoragePath;

  if (cacheContextProvided) {
    const { data: projectRow, error: projectError } = await supabase
      .from("organization_projects")
      .select("id")
      .eq("id", projectId!)
      .eq("organization_id", organizationId!)
      .limit(1)
      .maybeSingle();

    if (projectError || !projectRow) {
      cacheReason = "Project context unavailable for cache.";
    } else {
      const { data: existingScopeRun, error: existingScopeRunError } = await supabase
        .from("scope_runs")
        .select("id")
        .eq("project_id", projectId!)
        .eq("organization_id", organizationId!)
        .eq("status", "complete")
        .limit(1)
        .maybeSingle();

      if (existingScopeRunError) {
        cacheReason = "Unable to validate Scope Builder limit.";
      } else if (existingScopeRun) {
        return NextResponse.json(
          { error: "Scope Builder already used for this project (1 of 1)." },
          { status: 429 }
        );
      }

      const { data: drawingSetRow, error: drawingSetError } = await supabase
        .from("project_drawing_sets")
        .select("id, storage_path")
        .eq("id", drawingSetId!)
        .eq("project_id", projectId!)
        .eq("organization_id", organizationId!)
        .limit(1)
        .maybeSingle();

      if (drawingSetError || !drawingSetRow) {
        cacheReason = "Drawing set context unavailable for cache.";
      } else {
        resolvedStoragePath = resolvedStoragePath ?? drawingSetRow.storage_path;

        const { data: tradePackRow, error: tradePackError } = await supabase
          .from("trade_packs")
          .select("id, trade_id")
          .eq("id", drawingSetId!)
          .eq("project_id", projectId!)
          .eq("organization_id", organizationId!)
          .limit(1)
          .maybeSingle();

        if (tradePackError) {
          if (isMissingTableInSchemaCacheError(tradePackError, "trade_packs")) {
            cacheReason = "Cache tables not deployed (trade_packs).";
          } else {
            cacheReason = "Unable to read scope cache.";
          }
        } else if (tradePackRow) {
          cacheTradePackId = tradePackRow.id;
          if (tradePackRow.trade_id !== selectedTrade.id) {
            cacheReason = "Selected trade does not match this generated trade pack.";
          } else {
            canPersistCache = true;

            if (!forceRefresh) {
              const { data: latestRun, error: latestRunError } = await supabase
                .from("scope_runs")
                .select("id, status, result_json, created_at")
                .eq("trade_pack_id", tradePackRow.id)
                .eq("project_id", projectId!)
                .eq("organization_id", organizationId!)
                .eq("status", "complete")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (latestRunError) {
                if (isMissingTableInSchemaCacheError(latestRunError, "scope_runs")) {
                  canPersistCache = false;
                  cacheReason = "Cache tables not deployed (scope_runs).";
                } else {
                  cacheReason = "Unable to read cached scope run.";
                }
              } else if (latestRun?.result_json) {
                const cachedResult = toScopeBuilderPayload(latestRun.result_json);
                if (cachedResult) {
                  return NextResponse.json({
                    tradeId: selectedTrade.id,
                    tradeLabel: selectedTrade.label,
                    model: process.env.OPENAI_SCOPE_MODEL || DEFAULT_SCOPE_MODEL,
                    fileName: fileValue.name,
                    generatedAt: latestRun.created_at,
                    result: cachedResult,
                    cache: {
                      hit: true,
                      stored: true,
                      tradePackId: tradePackRow.id,
                      runId: latestRun.id,
                      reason: "Loaded from scope_runs cache.",
                    },
                  });
                }
              }
            }
          }
        } else {
          canPersistCache = true;
          shouldCreateTradePack = true;
        }
      }
    }
  }

  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
  }

  if (canPersistCache && cacheContextProvided && shouldCreateTradePack) {
    const insertTradePack = {
      id: drawingSetId!,
      organization_id: organizationId!,
      project_id: projectId!,
      trade_id: selectedTrade.id,
      trade_label: selectedTrade.label,
      pdf_url: toTradePackPdfUrl(resolvedStoragePath, fileValue.name),
      page_index_json: [] as Record<string, unknown>[],
      created_by: user.id,
    };

    const { data: createdTradePack, error: createTradePackError } = await supabase
      .from("trade_packs")
      .insert(insertTradePack)
      .select("id, trade_id")
      .single();

    if (createTradePackError) {
      const duplicate = `${createTradePackError.code ?? ""}` === "23505";
      if (duplicate) {
        const { data: existingTradePack, error: existingTradePackError } = await supabase
          .from("trade_packs")
          .select("id, trade_id")
          .eq("id", drawingSetId!)
          .eq("project_id", projectId!)
          .eq("organization_id", organizationId!)
          .limit(1)
          .maybeSingle();

        if (existingTradePackError || !existingTradePack || existingTradePack.trade_id !== selectedTrade.id) {
          canPersistCache = false;
          cacheReason = "Unable to resolve cache key for this trade pack.";
        } else {
          cacheTradePackId = existingTradePack.id;
        }
      } else if (isMissingTableInSchemaCacheError(createTradePackError, "trade_packs")) {
        canPersistCache = false;
        cacheReason = "Cache tables not deployed (trade_packs).";
      } else {
        canPersistCache = false;
        cacheReason = "Unable to initialize scope cache record.";
      }
    } else {
      cacheTradePackId = createdTradePack.id;
    }
  }

  let scopeRunId: string | null = null;
  if (canPersistCache && cacheContextProvided && cacheTradePackId) {
    const { data: createdRun, error: createRunError } = await supabase
      .from("scope_runs")
      .insert({
        organization_id: organizationId!,
        project_id: projectId!,
        trade_pack_id: cacheTradePackId,
        created_by: user.id,
        status: "running",
        result_json: {},
      })
      .select("id")
      .single();

    if (createRunError) {
      if (isMissingTableInSchemaCacheError(createRunError, "scope_runs")) {
        cacheReason = "Cache tables not deployed (scope_runs).";
      } else {
        cacheReason = "Unable to create scope cache run.";
      }
      canPersistCache = false;
    } else {
      scopeRunId = createdRun.id;
      cacheRunId = createdRun.id;
    }
  }

  const markRunFailed = async (errorMessage: string) => {
    if (!scopeRunId) {
      return;
    }

    await supabase
      .from("scope_runs")
      .update({
        status: "failed",
        error_message: errorMessage.slice(0, 4000),
      })
      .eq("id", scopeRunId);
  };

  const arrayBuffer = await fileValue.arrayBuffer();
  const pdfBase64 = Buffer.from(arrayBuffer).toString("base64");
  const model = process.env.OPENAI_SCOPE_MODEL || DEFAULT_SCOPE_MODEL;
  const prompt = buildScopePrompt(selectedTrade.label);
  const initialMaxOutputTokens = Number.parseInt(
    process.env.OPENAI_SCOPE_MAX_OUTPUT_TOKENS ?? `${DEFAULT_SCOPE_MAX_OUTPUT_TOKENS}`,
    10
  );
  const firstAttemptMaxOutputTokens = Number.isFinite(initialMaxOutputTokens) && initialMaxOutputTokens > 0
    ? initialMaxOutputTokens
    : DEFAULT_SCOPE_MAX_OUTPUT_TOKENS;

  const requestScopeFromOpenAi = async (maxOutputTokens: number): Promise<unknown> => {
    const openAiResponse = await fetchWithTimeout(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_output_tokens: maxOutputTokens,
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
                filename: fileValue.name || "trade-pack.pdf",
                file_data: `data:application/pdf;base64,${pdfBase64}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "scope_builder_output",
            schema: RESPONSE_JSON_SCHEMA,
            strict: true,
          },
        },
      }),
    }, SCOPE_AI_TIMEOUT_MS);

    if (!openAiResponse.ok) {
      throw new Error(`OpenAI request failed (${openAiResponse.status}).`);
    }

    return openAiResponse.json();
  };

  let responseJson: unknown;
  try {
    responseJson = await requestScopeFromOpenAi(firstAttemptMaxOutputTokens);
    if (isMaxOutputTokenIncomplete(responseJson)) {
      const retryMaxOutputTokens = Math.max(firstAttemptMaxOutputTokens + 1000, SCOPE_RETRY_MAX_OUTPUT_TOKENS);
      responseJson = await requestScopeFromOpenAi(retryMaxOutputTokens);
    }
  } catch (openAiError) {
    console.error("[scope-builder] upstream request failed", openAiError);
    await markRunFailed("AI provider request failed.");
    return NextResponse.json({ error: "AI provider request failed." }, { status: 502 });
  }

  if (isMaxOutputTokenIncomplete(responseJson)) {
    await markRunFailed("Model response truncated by max_output_tokens.");
    return NextResponse.json(
      {
        error:
          "Scope output was truncated by model token limits. Reduce package size or increase OPENAI_SCOPE_MAX_OUTPUT_TOKENS.",
      },
      { status: 502 }
    );
  }

  const outputText = extractOpenAiResponseText(responseJson);
  const parsedOutput = parseJsonObjectFromText(outputText);

  if (process.env.NODE_ENV !== "production") {
    console.log("[scope-builder] responseJson", responseJson);
    console.log("[scope-builder] outputText", outputText);
    console.log("[scope-builder] parsedOutput", parsedOutput);
  }

  const scopePayload = toScopeBuilderPayload(parsedOutput);

  if (!scopePayload) {
    await markRunFailed("Model returned invalid scope JSON.");
    return NextResponse.json(
      { error: "Model returned invalid scope JSON. Please rerun." },
      { status: 502 }
    );
  }

  if (scopeRunId) {
    const { error: updateRunError } = await supabase
      .from("scope_runs")
      .update({
        status: "complete",
        result_json: scopePayload as unknown as Record<string, unknown>,
        error_message: null,
      })
      .eq("id", scopeRunId);

    if (!updateRunError) {
      cacheStored = true;
    } else if (isMissingTableInSchemaCacheError(updateRunError, "scope_runs")) {
      cacheReason = "Cache tables not deployed (scope_runs).";
    } else {
      cacheReason = "Unable to persist scope result cache.";
    }
  }

  return NextResponse.json({
    tradeId: selectedTrade.id,
    tradeLabel: selectedTrade.label,
    model,
    fileName: fileValue.name,
    generatedAt: new Date().toISOString(),
    result: scopePayload,
    cache: {
      hit: false,
      stored: cacheStored,
      tradePackId: cacheContextProvided ? cacheTradePackId : null,
      runId: cacheRunId,
      reason: cacheReason,
    },
  });
  } finally {
    await guard.release();
  }
}
