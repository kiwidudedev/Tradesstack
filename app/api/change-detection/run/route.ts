import { NextResponse } from "next/server";
import { PROJECT_DRAWING_SETS_BUCKET } from "@/lib/drawing-sets";
import { enforceRouteGuard } from "@/lib/security/abuse-guard";
import { fetchWithTimeout } from "@/lib/security/fetch-timeout";
import { hasPdfSignature } from "@/lib/security/pdf-signature";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { analyzePagePrefilterForTrade, getTradeById } from "@/lib/trade-pack-builder";
import { getGeneratedTradePackTradeId, getGeneratedTradePackTradeLabel, isGeneratedTradePackDrawingSet } from "@/lib/trade-packs";

export const runtime = "nodejs";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_CHANGE_MODEL = "gpt-5.2";
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const MAX_PAGE_TEXT_CHARS = 1400;
const MAX_RELEVANT_PAGES_FOR_PROMPT = 42;
const MAX_REVISED_FILES = 6;
const CHANGE_DETECTION_TIMEOUT_MS = 90_000;

interface StructuredItem {
  title: string;
  description: string;
}

interface ChangeDetectionResponsePayload {
  tradeLabel: string;
  revisionSummary: StructuredItem[];
  addedScope: StructuredItem[];
  removedScope: StructuredItem[];
  modifiedScope: StructuredItem[];
  quantityOrSizeChanges: StructuredItem[];
  coordinationChanges: StructuredItem[];
  costImpactChanges: StructuredItem[];
  risksClarifications: StructuredItem[];
}

interface ExtractedPdfPage {
  pageNumber: number;
  text: string;
  sheetNumber: string | null;
  sheetTitle: string;
  sourceFileName: string;
}

interface MatchCandidate {
  revisedPage: ExtractedPdfPage;
  baselinePage: ExtractedPdfPage;
  reason: string;
  score: number;
}

type PdfJsWorkerGlobal = typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler?: unknown;
  };
};

let pdfJsWorkerBootstrapPromise: Promise<void> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTrimmedFormString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSheetToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function toStructuredItemFromString(value: string): StructuredItem | null {
  const normalized = normalizeWhitespace(value);
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

function toStructuredItemArray(value: unknown): StructuredItem[] {
  if (typeof value === "string") {
    const parsed = toStructuredItemFromString(value);
    return parsed ? [parsed] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: StructuredItem[] = [];
  for (const entry of value) {
    if (isRecord(entry)) {
      const title = typeof entry.title === "string" ? entry.title.trim() : "";
      const description = typeof entry.description === "string" ? entry.description.trim() : "";
      if (title && description) {
        normalized.push({ title, description });
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

function toChangeDetectionPayload(value: unknown): ChangeDetectionResponsePayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const tradeLabel = typeof value.tradeLabel === "string" ? value.tradeLabel.trim() : "";
  const revisionSummary = toStructuredItemArray(value.revisionSummary);
  const addedScope = toStructuredItemArray(value.addedScope);
  const removedScope = toStructuredItemArray(value.removedScope);
  const modifiedScope = toStructuredItemArray(value.modifiedScope);
  const quantityOrSizeChanges = toStructuredItemArray(value.quantityOrSizeChanges);
  const coordinationChanges = toStructuredItemArray(value.coordinationChanges);
  const costImpactChanges = toStructuredItemArray(value.costImpactChanges);
  const risksClarifications = toStructuredItemArray(value.risksClarifications);

  if (!tradeLabel) {
    return null;
  }

  return {
    tradeLabel,
    revisionSummary,
    addedScope,
    removedScope,
    modifiedScope,
    quantityOrSizeChanges,
    coordinationChanges,
    costImpactChanges,
    risksClarifications,
  };
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

function extractSheetNumberFromText(text: string): string | null {
  const source = text.slice(0, 1000);
  const patterns = [
    /(?:SHEET|DRAWING|DWG|DRG)\s*(?:NO\.?|NUMBER|#)?\s*[:\-]?\s*([A-Z]{1,5}[\s\-\.]?\d{1,5}(?:\.\d+)?[A-Z0-9\-\.]*)/i,
    /\b([A-Z]{1,4}[\-\.]?\d{2,5}(?:\.\d+)?[A-Z]?)\b/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const candidate = normalizeWhitespace(match[1]).replace(/\s+/g, "");
    if (candidate.length >= 3) {
      return candidate.toUpperCase();
    }
  }

  return null;
}

function extractSheetTitleFromText(text: string, sheetNumber: string | null, pageNumber: number): string {
  const source = normalizeWhitespace(text).slice(0, 220);
  if (!source) {
    return `Page ${pageNumber}`;
  }

  let candidate = source;
  if (sheetNumber) {
    const escaped = sheetNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    candidate = candidate.replace(new RegExp(`\\b${escaped}\\b`, "i"), "").trim();
  }

  candidate = candidate
    .replace(/^(SHEET|DRAWING|DWG|DRG)\s*(NO\.?|NUMBER|#)?\s*[:\-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!candidate) {
    return `Page ${pageNumber}`;
  }

  return candidate.slice(0, 120);
}

function tokenizeTitle(value: string): Set<string> {
  const tokens = value
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && token !== "SHEET" && token !== "DRAWING");
  return new Set(tokens);
}

function titleSimilarityScore(left: string, right: string): number {
  const leftTokens = tokenizeTitle(left);
  const rightTokens = tokenizeTitle(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = leftTokens.size + rightTokens.size - intersection;
  return union > 0 ? intersection / union : 0;
}

async function ensurePdfJsWorkerBootstrap(): Promise<void> {
  const globalRef = globalThis as PdfJsWorkerGlobal;
  if (globalRef.pdfjsWorker?.WorkerMessageHandler) {
    return;
  }

  if (!pdfJsWorkerBootstrapPromise) {
    pdfJsWorkerBootstrapPromise = (async () => {
      const pdfWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      const workerMessageHandler = (pdfWorker as { WorkerMessageHandler?: unknown }).WorkerMessageHandler;
      if (!workerMessageHandler) {
        throw new Error("pdf.js WorkerMessageHandler is unavailable.");
      }

      globalRef.pdfjsWorker = {
        ...(globalRef.pdfjsWorker ?? {}),
        WorkerMessageHandler: workerMessageHandler,
      };
    })().catch((error) => {
      // Allow a fresh bootstrap attempt on the next request if current init fails.
      pdfJsWorkerBootstrapPromise = null;
      throw error;
    });
  }

  await pdfJsWorkerBootstrapPromise;
}

async function extractPdfPagesFromBytes(pdfBytes: Uint8Array, sourceFileName: string): Promise<ExtractedPdfPage[]> {
  await ensurePdfJsWorkerBootstrap();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = (
    pdfjs as unknown as {
      getDocument: (params: Record<string, unknown>) => {
        promise: Promise<{
          numPages: number;
          getPage: (index: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }>;
          cleanup?: () => void;
          destroy?: () => void;
        }>;
        destroy?: () => Promise<void>;
      };
    }
  ).getDocument({
    data: pdfBytes,
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  });

  let loadedPdf:
    | {
        numPages: number;
        getPage: (index: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }>;
        cleanup?: () => void;
        destroy?: () => void;
      }
    | null = null;

  try {
    loadedPdf = await loadingTask.promise;
    const pages: ExtractedPdfPage[] = [];

    for (let pageIndex = 1; pageIndex <= loadedPdf.numPages; pageIndex += 1) {
      const page = await loadedPdf.getPage(pageIndex);
      const textContent = await page.getTextContent();
      const text = normalizeWhitespace(textContent.items.map((item) => (typeof item.str === "string" ? item.str : "")).join(" "));
      const sheetNumber = extractSheetNumberFromText(text);
      const sheetTitle = extractSheetTitleFromText(text, sheetNumber, pageIndex);

      pages.push({
        pageNumber: pageIndex,
        text,
        sheetNumber,
        sheetTitle,
        sourceFileName,
      });
    }

    return pages;
  } finally {
    try {
      loadedPdf?.cleanup?.();
      loadedPdf?.destroy?.();
    } catch {
      // Ignore cleanup errors from parser internals.
    }
    try {
      await loadingTask.destroy?.();
    } catch {
      // Ignore task destroy errors to avoid masking primary parse failures.
    }
  }
}

function buildChangeDetectionPrompt(params: {
  tradeLabel: string;
  baselineRevision: string;
  revisedRevision: string;
  comparisonBlocks: string[];
}): string {
  const comparisonBody = params.comparisonBlocks.join("\n\n");

  return `You are a Senior Quantity Surveyor operating in New Zealand / Australia.

The documents provided represent two versions of the same trade package:

Baseline Trade Pack - the previously issued drawings used for pricing.
Revised Trade Pack - the updated drawings containing revisions.

Trade: ${params.tradeLabel}
Baseline Revision: ${params.baselineRevision}
Revised Revision: ${params.revisedRevision}

Focus only on changes affecting cost, scope, quantities, coordination, buildability, and subcontract risk.
Do not summarise unchanged information.
Only report new, removed, or modified scope.

Use the exact output sections:
1. Revision Summary
2. Added Scope
3. Removed Scope
4. Modified Scope
5. Quantity or Size Changes
6. Coordination Changes
7. Cost Impact Changes
8. Risk & Clarifications

Each item must include:
- title
- description

Rules:
- Only report differences between revisions.
- Do not invent specifications.
- If information is missing, state "Not specified in drawings".
- Preserve numeric values exactly.
- Include sheet references where possible.

Comparison data:
${comparisonBody}`;
}

const CHANGE_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tradeLabel: { type: "string" },
    revisionSummary: {
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
    addedScope: {
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
    removedScope: {
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
    modifiedScope: {
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
    quantityOrSizeChanges: {
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
    coordinationChanges: {
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
    costImpactChanges: {
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
    risksClarifications: {
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
  required: [
    "tradeLabel",
    "revisionSummary",
    "addedScope",
    "removedScope",
    "modifiedScope",
    "quantityOrSizeChanges",
    "coordinationChanges",
    "costImpactChanges",
    "risksClarifications",
  ],
};

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
    routeKey: "change-detection",
    request,
    userId: user.id,
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

  const projectId = toTrimmedFormString(formData.get("projectId"));
  const organizationId = toTrimmedFormString(formData.get("organizationId"));
  const tradePackId = toTrimmedFormString(formData.get("tradePackId"));
  const baselineRevision = toTrimmedFormString(formData.get("baselineRevision")) || "Rev A";
  const revisedRevision = toTrimmedFormString(formData.get("revisedRevision")) || "Rev B";

  if (!projectId || !organizationId || !tradePackId) {
    return NextResponse.json({ error: "projectId, organizationId, and tradePackId are required." }, { status: 400 });
  }

  const revisedFileValues = formData.getAll("revisedPdf");
  const revisedFiles = revisedFileValues.filter((value): value is File => value instanceof File);
  if (revisedFiles.length === 0) {
    return NextResponse.json({ error: "At least one revised PDF file is required." }, { status: 400 });
  }
  if (revisedFiles.length > MAX_REVISED_FILES) {
    return NextResponse.json({ error: `Maximum ${MAX_REVISED_FILES} revised PDFs allowed per request.` }, { status: 400 });
  }

  for (const revisedFileValue of revisedFiles) {
    const isPdf = revisedFileValue.type === "application/pdf" || revisedFileValue.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json({ error: `Only PDF files are supported (${revisedFileValue.name}).` }, { status: 400 });
    }

    if (revisedFileValue.size <= 0) {
      return NextResponse.json({ error: `Uploaded PDF is empty (${revisedFileValue.name}).` }, { status: 400 });
    }

    if (revisedFileValue.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `PDF is too large (${revisedFileValue.name}). Maximum allowed size is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
        },
        { status: 400 }
      );
    }

    if (!(await hasPdfSignature(revisedFileValue))) {
      return NextResponse.json({ error: `Uploaded file is not a valid PDF (${revisedFileValue.name}).` }, { status: 400 });
    }
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

  const { data: existingChangeDetectionRun, error: existingChangeDetectionRunError } = await supabase
    .from("change_detection_runs")
    .select("id")
    .eq("project_id", projectId)
    .eq("organization_id", organizationId)
    .eq("status", "complete")
    .limit(1)
    .maybeSingle();

  if (existingChangeDetectionRunError) {
    return NextResponse.json({ error: "Unable to validate Change Detection limit." }, { status: 500 });
  }

  if (existingChangeDetectionRun) {
    return NextResponse.json(
      { error: "Change Detection already used for this project (1 of 1)." },
      { status: 429 }
    );
  }

  const { data: drawingSetRow, error: drawingSetError } = await supabase
    .from("project_drawing_sets")
    .select("id, file_name, storage_path, project_id, organization_id")
    .eq("id", tradePackId)
    .eq("project_id", projectId)
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();

  if (drawingSetError || !drawingSetRow) {
    return NextResponse.json({ error: "Stored trade pack not found for this project." }, { status: 404 });
  }

  if (!isGeneratedTradePackDrawingSet(drawingSetRow)) {
    return NextResponse.json({ error: "Selected baseline must be a stored generated trade pack." }, { status: 400 });
  }

  const tradeId = getGeneratedTradePackTradeId(drawingSetRow);
  const tradeLabel = getGeneratedTradePackTradeLabel(drawingSetRow);
  const trade = tradeId ? getTradeById(tradeId) : null;

  if (!tradeId || !trade) {
    return NextResponse.json({ error: "Unable to infer trade from selected baseline trade pack." }, { status: 400 });
  }

  const revisedFileNameDisplay = revisedFiles.length === 1 ? revisedFiles[0].name : `${revisedFiles.length} revised PDFs`;
  let changeDetectionRunId: string | null = null;
  let persistenceStored = false;
  let persistenceReason: string | null = null;

  const { data: createdRun, error: createRunError } = await supabase
    .from("change_detection_runs")
    .insert({
      organization_id: organizationId,
      project_id: projectId,
      trade_pack_id: tradePackId,
      created_by: user.id,
      baseline_revision: baselineRevision,
      revised_revision: revisedRevision,
      revised_file_name: revisedFileNameDisplay,
      status: "running",
      validation_json: {},
      result_json: {},
    })
    .select("id")
    .single();

  if (createRunError || !createdRun) {
    if (isMissingTableInSchemaCacheError(createRunError, "change_detection_runs")) {
      persistenceReason = "Persistence table not deployed (change_detection_runs).";
    } else {
      console.error("[change-detection] unable to create persistence run", createRunError);
      persistenceReason = "Unable to create persistence run record.";
    }
  } else {
    changeDetectionRunId = createdRun.id;
  }

  const markRunFailed = async (errorMessage: string) => {
    if (!changeDetectionRunId) {
      return;
    }

    await supabase
      .from("change_detection_runs")
      .update({
        status: "failed",
        error_message: errorMessage.slice(0, 4000),
      })
      .eq("id", changeDetectionRunId);
  };

  const { data: baselineBlob, error: baselineDownloadError } = await supabase
    .storage
    .from(PROJECT_DRAWING_SETS_BUCKET)
    .download(drawingSetRow.storage_path);

  if (baselineDownloadError || !baselineBlob) {
    await markRunFailed("Unable to download baseline trade pack PDF.");
    return NextResponse.json({ error: "Unable to download baseline trade pack PDF." }, { status: 502 });
  }

  const baselineBytes = new Uint8Array(await baselineBlob.arrayBuffer());

  let baselinePages: ExtractedPdfPage[];
  let revisedPages: ExtractedPdfPage[];

  try {
    baselinePages = await extractPdfPagesFromBytes(baselineBytes, drawingSetRow.file_name);
    const revisedCollections = await Promise.all(
      revisedFiles.map(async (file) => {
        const revisedBytes = new Uint8Array(await file.arrayBuffer());
        return extractPdfPagesFromBytes(revisedBytes, file.name);
      })
    );
    revisedPages = revisedCollections.flat();
  } catch (extractError) {
    await markRunFailed("Unable to parse PDF text for validation.");
    return NextResponse.json(
      {
        error:
          extractError instanceof Error
            ? `Unable to parse PDF text for validation: ${extractError.message}`
            : "Unable to parse PDF text for validation.",
      },
      { status: 400 }
    );
  }

  const baselineBySheet = new Map<string, ExtractedPdfPage[]>();
  for (const page of baselinePages) {
    if (!page.sheetNumber) {
      continue;
    }

    const key = normalizeSheetToken(page.sheetNumber);
    if (!key) {
      continue;
    }

    const existing = baselineBySheet.get(key) ?? [];
    existing.push(page);
    baselineBySheet.set(key, existing);
  }

  const usedBaselinePages = new Set<number>();
  const matchedSheets: Array<{
    revisedPage: ExtractedPdfPage;
    baselinePage: ExtractedPdfPage;
    reason: string;
  }> = [];
  const newSheets: Array<{ revisedPage: ExtractedPdfPage; reason: string }> = [];
  const rejectedSheets: Array<{ revisedPage: ExtractedPdfPage; reason: string }> = [];

  for (const revisedPage of revisedPages) {
    const prefilter = analyzePagePrefilterForTrade(revisedPage.text, trade);
    const isRelevant = prefilter.shouldSendToVlm || prefilter.isSupportSheet;

    if (!isRelevant) {
      rejectedSheets.push({
        revisedPage,
        reason: prefilter.reason || "No relevant trade signals found.",
      });
      continue;
    }

    let bestMatch: MatchCandidate | null = null;

    if (revisedPage.sheetNumber) {
      const keyed = baselineBySheet.get(normalizeSheetToken(revisedPage.sheetNumber)) ?? [];
      for (const candidate of keyed) {
        if (usedBaselinePages.has(candidate.pageNumber)) {
          continue;
        }

        const titleScore = titleSimilarityScore(revisedPage.sheetTitle, candidate.sheetTitle);
        const score = 0.82 + Math.min(0.18, titleScore * 0.18);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            revisedPage,
            baselinePage: candidate,
            reason: "Matched by sheet number",
            score,
          };
        }
      }
    }

    if (!bestMatch) {
      for (const baselinePage of baselinePages) {
        if (usedBaselinePages.has(baselinePage.pageNumber)) {
          continue;
        }

        const titleScore = titleSimilarityScore(revisedPage.sheetTitle, baselinePage.sheetTitle);
        if (titleScore < 0.42) {
          continue;
        }

        const score = titleScore;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            revisedPage,
            baselinePage,
            reason: "Matched by sheet title similarity",
            score,
          };
        }
      }
    }

    if (bestMatch) {
      usedBaselinePages.add(bestMatch.baselinePage.pageNumber);
      matchedSheets.push({
        revisedPage,
        baselinePage: bestMatch.baselinePage,
        reason: bestMatch.reason,
      });
    } else {
      newSheets.push({
        revisedPage,
        reason: "No baseline match found; treated as new relevant scope.",
      });
    }
  }

  const removedBaselineSheets = baselinePages
    .filter((page) => !usedBaselinePages.has(page.pageNumber))
    .map((page) => ({
      revisedPage: null,
      baselinePage: page,
      reason: "No revised match found; potential removed scope.",
    }));

  const relevantComparisonUnits = [...matchedSheets, ...newSheets.map((entry) => ({ ...entry, baselinePage: null }))];

  if (relevantComparisonUnits.length === 0) {
    await markRunFailed("No relevant revised sheets after validation.");
    return NextResponse.json(
      {
        error: "No relevant revised sheets were detected after validation. Upload a revised trade-specific drawing set.",
      },
      { status: 400 }
    );
  }

  const comparisonBlocks: string[] = [];
  let includedCount = 0;

  for (const entry of matchedSheets) {
    if (includedCount >= MAX_RELEVANT_PAGES_FOR_PROMPT) {
      break;
    }

    includedCount += 1;
    comparisonBlocks.push(`Matched sheet ${includedCount}
Baseline: file ${entry.baselinePage.sourceFileName} | page ${entry.baselinePage.pageNumber} | sheet ${entry.baselinePage.sheetNumber ?? "N/A"} | title ${entry.baselinePage.sheetTitle}
Revised: file ${entry.revisedPage.sourceFileName} | page ${entry.revisedPage.pageNumber} | sheet ${entry.revisedPage.sheetNumber ?? "N/A"} | title ${entry.revisedPage.sheetTitle}
Match reason: ${entry.reason}
Baseline text excerpt: ${entry.baselinePage.text.slice(0, MAX_PAGE_TEXT_CHARS) || "Not specified in drawings"}
Revised text excerpt: ${entry.revisedPage.text.slice(0, MAX_PAGE_TEXT_CHARS) || "Not specified in drawings"}`);
  }

  for (const entry of newSheets) {
    if (includedCount >= MAX_RELEVANT_PAGES_FOR_PROMPT) {
      break;
    }

    includedCount += 1;
    comparisonBlocks.push(`New revised sheet ${includedCount}
Revised: file ${entry.revisedPage.sourceFileName} | page ${entry.revisedPage.pageNumber} | sheet ${entry.revisedPage.sheetNumber ?? "N/A"} | title ${entry.revisedPage.sheetTitle}
Reason: ${entry.reason}
Revised text excerpt: ${entry.revisedPage.text.slice(0, MAX_PAGE_TEXT_CHARS) || "Not specified in drawings"}`);
  }

  for (const entry of removedBaselineSheets.slice(0, 18)) {
    comparisonBlocks.push(`Potential removed baseline sheet
Baseline: file ${entry.baselinePage.sourceFileName} | page ${entry.baselinePage.pageNumber} | sheet ${entry.baselinePage.sheetNumber ?? "N/A"} | title ${entry.baselinePage.sheetTitle}
Reason: ${entry.reason}
Baseline text excerpt: ${entry.baselinePage.text.slice(0, MAX_PAGE_TEXT_CHARS) || "Not specified in drawings"}`);
  }

  const prompt = buildChangeDetectionPrompt({
    tradeLabel,
    baselineRevision,
    revisedRevision,
    comparisonBlocks,
  });

  const openAiApiKey = process.env.OPENAI_API_KEY;
  if (!openAiApiKey) {
    await markRunFailed("Missing OPENAI_API_KEY.");
    return NextResponse.json({ error: "Missing OPENAI_API_KEY." }, { status: 500 });
  }

  const model = process.env.OPENAI_CHANGE_DETECTION_MODEL || DEFAULT_CHANGE_MODEL;
  let openAiResponse: Response;
  try {
    openAiResponse = await fetchWithTimeout(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_output_tokens: 3800,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "change_detection_output",
            schema: CHANGE_RESPONSE_JSON_SCHEMA,
            strict: true,
          },
        },
      }),
    }, CHANGE_DETECTION_TIMEOUT_MS);
  } catch (error) {
    console.error("[change-detection] upstream request failed", error);
    await markRunFailed("AI provider request failed.");
    return NextResponse.json({ error: "AI provider request failed." }, { status: 502 });
  }

  if (!openAiResponse.ok) {
    console.error("[change-detection] upstream non-ok response", openAiResponse.status, openAiResponse.statusText);
    await markRunFailed(`OpenAI request failed (${openAiResponse.status}).`);
    return NextResponse.json(
      {
        error: "AI provider request failed.",
      },
      { status: 502 }
    );
  }

  const responseJson = (await openAiResponse.json()) as unknown;
  const outputText = extractOpenAiResponseText(responseJson);
  const parsedOutput = parseJsonObjectFromText(outputText);
  const structuredPayload = toChangeDetectionPayload(parsedOutput);

  if (!structuredPayload) {
    await markRunFailed("Model returned invalid change-detection JSON.");
    return NextResponse.json({ error: "Model returned invalid change-detection JSON. Please rerun." }, { status: 502 });
  }

  if (changeDetectionRunId) {
    const { error: updateRunError } = await supabase
      .from("change_detection_runs")
      .update({
        status: "complete",
        validation_json: {
          baselineSheetCount: baselinePages.length,
          revisedSheetCount: revisedPages.length,
          matchedSheets: matchedSheets.map((entry) => ({
            revisedPageNumber: entry.revisedPage.pageNumber,
            revisedSheetNumber: entry.revisedPage.sheetNumber,
            revisedSheetTitle: entry.revisedPage.sheetTitle,
            baselinePageNumber: entry.baselinePage.pageNumber,
            baselineSheetNumber: entry.baselinePage.sheetNumber,
            baselineSheetTitle: entry.baselinePage.sheetTitle,
            reason: entry.reason,
          })),
          newSheets: newSheets.map((entry) => ({
            revisedPageNumber: entry.revisedPage.pageNumber,
            revisedSheetNumber: entry.revisedPage.sheetNumber,
            revisedSheetTitle: entry.revisedPage.sheetTitle,
            baselinePageNumber: null,
            baselineSheetNumber: null,
            baselineSheetTitle: null,
            reason: entry.reason,
          })),
          rejectedSheets: rejectedSheets.map((entry) => ({
            revisedPageNumber: entry.revisedPage.pageNumber,
            revisedSheetNumber: entry.revisedPage.sheetNumber,
            revisedSheetTitle: entry.revisedPage.sheetTitle,
            reason: entry.reason,
          })),
          removedBaselineSheets: removedBaselineSheets.map((entry) => ({
            revisedPageNumber: 0,
            revisedSheetNumber: null,
            revisedSheetTitle: "Removed baseline sheet",
            baselinePageNumber: entry.baselinePage.pageNumber,
            baselineSheetNumber: entry.baselinePage.sheetNumber,
            baselineSheetTitle: entry.baselinePage.sheetTitle,
            reason: entry.reason,
          })),
        } as unknown as Record<string, unknown>,
        result_json: structuredPayload as unknown as Record<string, unknown>,
        error_message: null,
      })
      .eq("id", changeDetectionRunId);

    if (!updateRunError) {
      persistenceStored = true;
    } else if (isMissingTableInSchemaCacheError(updateRunError, "change_detection_runs")) {
      persistenceReason = "Persistence table not deployed (change_detection_runs).";
    } else {
      console.error("[change-detection] unable to persist run", updateRunError);
      persistenceReason = "Unable to persist change detection result.";
    }
  }

  return NextResponse.json({
    tradeId,
    tradeLabel,
    model,
    baselineFileName: drawingSetRow.file_name,
    revisedFileName: revisedFileNameDisplay,
    baselineRevision,
    revisedRevision,
    generatedAt: new Date().toISOString(),
    validation: {
      baselineSheetCount: baselinePages.length,
      revisedSheetCount: revisedPages.length,
      matchedSheets: matchedSheets.map((entry) => ({
        revisedPageNumber: entry.revisedPage.pageNumber,
        revisedSheetNumber: entry.revisedPage.sheetNumber,
        revisedSheetTitle: entry.revisedPage.sheetTitle,
        baselinePageNumber: entry.baselinePage.pageNumber,
        baselineSheetNumber: entry.baselinePage.sheetNumber,
        baselineSheetTitle: entry.baselinePage.sheetTitle,
        reason: entry.reason,
      })),
      newSheets: newSheets.map((entry) => ({
        revisedPageNumber: entry.revisedPage.pageNumber,
        revisedSheetNumber: entry.revisedPage.sheetNumber,
        revisedSheetTitle: entry.revisedPage.sheetTitle,
        baselinePageNumber: null,
        baselineSheetNumber: null,
        baselineSheetTitle: null,
        reason: entry.reason,
      })),
      rejectedSheets: rejectedSheets.map((entry) => ({
        revisedPageNumber: entry.revisedPage.pageNumber,
        revisedSheetNumber: entry.revisedPage.sheetNumber,
        revisedSheetTitle: entry.revisedPage.sheetTitle,
        reason: entry.reason,
      })),
      removedBaselineSheets: removedBaselineSheets.map((entry) => ({
        revisedPageNumber: 0,
        revisedSheetNumber: null,
        revisedSheetTitle: "Removed baseline sheet",
        baselinePageNumber: entry.baselinePage.pageNumber,
        baselineSheetNumber: entry.baselinePage.sheetNumber,
        baselineSheetTitle: entry.baselinePage.sheetTitle,
        reason: entry.reason,
      })),
    },
    result: structuredPayload,
    persistence: {
      stored: persistenceStored,
      runId: changeDetectionRunId,
      reason: persistenceReason,
    },
  });
  } finally {
    await guard.release();
  }
}
