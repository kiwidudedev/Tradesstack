"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Upload as TusUpload } from "tus-js-client";
import { CheckCircle2, ChevronDown, ExternalLink, FileText, Loader2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/use-auth";
import {
  MAX_DRAWING_SET_UPLOAD_SIZE_BYTES,
  PROJECT_DRAWING_SETS_BUCKET,
  formatFileSize,
  toDrawingSetStoragePath,
  type ProjectDrawingSet,
} from "@/lib/drawing-sets";
import {
  TRADE_PACK_TRADES,
  analyzePageForTrade,
  analyzePagePrefilterForTrade,
  getTradeById,
} from "@/lib/trade-pack-builder";
import { toTradePackPdfUrl } from "@/lib/trade-packs";
import {
  clampConfidence,
  type TradePackVlmPageRequest,
  type TradePackVlmPageResult,
} from "@/lib/trade-pack-vlm";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TradePackBuilderUploaderProps {
  projectId: string;
  organizationId: string;
  initialDrawingSets: ProjectDrawingSet[];
}

interface LastGenerationSummary {
  sourceName: string;
  tradeLabel: string;
  matchedPages: number;
  totalPages: number;
  supportPages: number;
  avgConfidence: number;
  vlmPages: number;
  fallbackPages: number;
  rulesOnlyPages: number;
  reasons: string[];
}

interface PersistedExtractionReason {
  pageNumber: number;
  reason: string;
  confidence: number;
  isSupportSheet: boolean;
}

interface PdfJsTextContent {
  items: Array<{ str?: string }>;
}

interface PdfJsPage {
  getTextContent: () => Promise<PdfJsTextContent>;
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => {
    promise: Promise<void>;
  };
}

interface PdfJsDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
}

interface PdfJsLoadingTask {
  promise: Promise<PdfJsDocument>;
}

interface PdfJsModule {
  getDocument: (params: unknown) => PdfJsLoadingTask;
  GlobalWorkerOptions: {
    workerSrc: string;
  };
}

type TradePackPageIndexInsert = Database["public"]["Tables"]["project_trade_pack_page_index"]["Insert"];
type TradePackReasonSnapshotInsert = Database["public"]["Tables"]["project_trade_pack_reason_snapshots"]["Insert"];
type TradePackInsert = Database["public"]["Tables"]["trade_packs"]["Insert"];

const PROJECT_DRAWING_SET_SELECT =
  "id, organization_id, project_id, uploaded_by, file_name, storage_path, file_size_bytes, mime_type, uploaded_at, created_at, updated_at";

function formatUploadedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toDefaultDraftName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return "Untitled drawing set";
  }

  const lastDotIndex = trimmed.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    return trimmed;
  }

  return trimmed.slice(0, lastDotIndex);
}

function toSafeDownloadBaseName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const noExtension = trimmed.endsWith(".pdf") ? trimmed.slice(0, -4) : trimmed;
  const slug = noExtension
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "trade-pack";
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

async function uploadPdfToStorageWithResumable(params: {
  supabase: SupabaseClient<Database>;
  file: File;
  storagePath: string;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}): Promise<void> {
  const { url, anonKey } = getSupabaseEnv();
  const { data: sessionData, error: sessionError } = await params.supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? null;

  if (sessionError || !accessToken) {
    throw new Error("Your auth session expired. Please refresh and try again.");
  }

  const endpoint = `${url}/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    const upload = new TusUpload(params.file, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      // Avoid sending file bytes in the initial POST create request.
      uploadDataDuringCreation: false,
      removeFingerprintOnSuccess: true,
      chunkSize: 5 * 1024 * 1024,
      metadata: {
        bucketName: PROJECT_DRAWING_SETS_BUCKET,
        objectName: params.storagePath,
        contentType: "application/pdf",
        cacheControl: "3600",
      },
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
        "x-upsert": "false",
      },
      onError(uploadError) {
        reject(uploadError);
      },
      onProgress(uploadedBytes, totalBytes) {
        params.onProgress?.(uploadedBytes, totalBytes);
      },
      onSuccess() {
        resolve();
      },
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    }).catch(reject);
  });
}

function getPageTextFromPdfJsTextContent(textContent: PdfJsTextContent): string {
  return textContent.items.map((item) => item.str ?? "").join(" ");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const byteOffset = bytes.byteOffset;
  const byteLength = bytes.byteLength;
  const rawBuffer = bytes.buffer;
  return rawBuffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
}

function hasPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 5) {
    return false;
  }

  const header = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  const maxStart = Math.min(bytes.length - header.length, 1024);

  for (let start = 0; start <= maxStart; start += 1) {
    let matches = true;
    for (let i = 0; i < header.length; i += 1) {
      if (bytes[start + i] !== header[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
}

function toBytePreview(bytes: Uint8Array, count = 32): string {
  const preview = Array.from(bytes.slice(0, count));
  if (preview.length === 0) {
    return "(empty)";
  }

  return preview.map((value) => value.toString(16).padStart(2, "0")).join(" ");
}

function toCompactReasonText(reason: string, maxChars = 150): string {
  const normalized = reason.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Matched trade signal.";
  }

  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  const preferred = firstSentence.length >= 40 ? firstSentence : normalized;
  if (preferred.length <= maxChars) {
    return preferred;
  }

  return `${preferred.slice(0, maxChars - 1).trimEnd()}…`;
}

function formatEtaSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  if (safeSeconds < 60) {
    return `${safeSeconds}s`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

const FLOOR_PLAN_SIGNAL_PATTERNS: RegExp[] = [
  /\bSET\s+OUT\b/,
  /\bSETTING\s+OUT\b/,
  /\bDIMENSION\s+PLAN\b/,
  /\bDIMENSIONED\b/,
  /\bGA\s+PLAN\b/,
];

function hasFloorPlanSignal(text: string): boolean {
  const normalized = text.toUpperCase().replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  return FLOOR_PLAN_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function shouldForceIncludeFloorPlanPage(params: {
  pageText: string;
  classification: TradePackVlmPageResult;
  prefilterSignal: ReturnType<typeof analyzePagePrefilterForTrade>;
}): boolean {
  if (hasFloorPlanSignal(params.pageText)) {
    return true;
  }

  if (hasFloorPlanSignal(params.classification.reason)) {
    return true;
  }

  if (hasFloorPlanSignal(params.classification.tradeSignals.join(" "))) {
    return true;
  }

  const prefilterText = [
    params.prefilterSignal.reason,
    params.prefilterSignal.matchedStructuredKeywords.join(" "),
    params.prefilterSignal.matchedSecondaryKeywords.join(" "),
    params.prefilterSignal.matchedAbbreviations.join(" "),
  ].join(" ");

  return hasFloorPlanSignal(prefilterText);
}

function toSupabaseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message.trim() : "";
    const details = typeof record.details === "string" ? record.details.trim() : "";
    const hint = typeof record.hint === "string" ? record.hint.trim() : "";
    const code = typeof record.code === "string" ? record.code.trim() : "";

    const parts = [message, details, hint].filter((part) => part.length > 0);
    if (parts.length > 0) {
      const body = parts.join(" | ");
      return code ? `${body} (code: ${code})` : body;
    }
  }

  return fallback;
}

function isMissingTableInSchemaCacheError(error: unknown, tableName: string): boolean {
  const record = toRecordOrNull(error);
  if (!record) {
    return false;
  }

  const code = typeof record.code === "string" ? record.code.trim().toUpperCase() : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  const details = typeof record.details === "string" ? record.details.toLowerCase() : "";
  const needle = tableName.toLowerCase();

  if (code === "PGRST205" && (message.includes(needle) || details.includes(needle))) {
    return true;
  }

  return message.includes("schema cache") && message.includes(needle);
}

function toRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toCompactPageIndexInsertRow(row: TradePackPageIndexInsert): TradePackPageIndexInsert {
  const metadataRecord = toRecordOrNull(row.metadata);
  const compactMetadata: Record<string, unknown> = {
    compacted: true,
    prefilterPass: row.prefilter_pass,
    classifier: row.classifier,
    modelProvider: typeof metadataRecord?.modelProvider === "string" ? metadataRecord.modelProvider : null,
    modelName: typeof metadataRecord?.modelName === "string" ? metadataRecord.modelName : null,
    supportReason:
      typeof metadataRecord?.supportReason === "string"
        ? toCompactReasonText(metadataRecord.supportReason, 180)
        : null,
  };

  return {
    ...row,
    reason: toCompactReasonText(typeof row.reason === "string" ? row.reason : "", 480),
    metadata: compactMetadata,
  };
}

function toPersistedExtractionReasonsFromSnapshot(value: unknown): PersistedExtractionReason[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: PersistedExtractionReason[] = [];

  for (const item of value) {
    const record = toRecordOrNull(item);
    if (!record) {
      continue;
    }

    const pageRaw = record.pageNumber ?? record.page_number;
    const confidenceRaw = record.confidence;
    const supportRaw = record.isSupportSheet ?? record.is_support_sheet;
    const reasonRaw = record.reason;

    const pageNumber = typeof pageRaw === "number" ? Math.trunc(pageRaw) : Number(pageRaw);
    const confidenceValue = typeof confidenceRaw === "number" ? confidenceRaw : Number(confidenceRaw);
    const reason = typeof reasonRaw === "string" ? reasonRaw.trim() : "";
    const isSupportSheet = typeof supportRaw === "boolean" ? supportRaw : false;

    if (!Number.isFinite(pageNumber) || pageNumber <= 0 || reason.length === 0) {
      continue;
    }

    normalized.push({
      pageNumber,
      reason,
      confidence: clampConfidence(Number.isFinite(confidenceValue) ? confidenceValue : 0),
      isSupportSheet,
    });
  }

  return normalized.sort((left, right) => left.pageNumber - right.pageNumber);
}

function escapeRegexValue(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toSourceDocumentNameFromGeneratedPackName(fileName: string, tradeLabel: string): string | null {
  const trimmed = fileName.trim().replace(/\.pdf$/i, "");
  if (!trimmed) {
    return null;
  }

  const exactSuffixPattern = new RegExp(`\\s*-\\s*${escapeRegexValue(tradeLabel)}\\s*TRADE PACK$`, "i");
  if (exactSuffixPattern.test(trimmed)) {
    const sourceName = trimmed.replace(exactSuffixPattern, "").trim();
    return sourceName || null;
  }

  const genericSuffixPattern = /\s*-\s*.+\s+TRADE PACK$/i;
  if (genericSuffixPattern.test(trimmed)) {
    const sourceName = trimmed.replace(genericSuffixPattern, "").trim();
    return sourceName || null;
  }

  return null;
}

function isGeneratedTradePackDrawingSet(drawingSet: ProjectDrawingSet): boolean {
  const fileName = drawingSet.file_name.toUpperCase();
  const storagePath = drawingSet.storage_path.toUpperCase();
  return fileName.includes("TRADE PACK") || storagePath.includes("-TRADE-PACK.PDF");
}

function getGeneratedTradePackTradeLabel(drawingSet: ProjectDrawingSet): string {
  const upperFileName = drawingSet.file_name.toUpperCase();
  const lowerStoragePath = drawingSet.storage_path.toLowerCase();

  const matchedTrade = TRADE_PACK_TRADES.find(
    (trade) =>
      upperFileName.includes(`${trade.label.toUpperCase()} TRADE PACK`) ||
      lowerStoragePath.includes(`-${trade.slug}-trade-pack.pdf`) ||
      lowerStoragePath.includes(`-${trade.slug}-trade-pack`)
  );

  if (matchedTrade) {
    return matchedTrade.label;
  }

  const fallbackMatch = drawingSet.file_name.match(/-\s*(.+?)\s*TRADE PACK$/i);
  if (fallbackMatch?.[1]) {
    return fallbackMatch[1].trim();
  }

  return "Trade Pack";
}

function toExtractionReasonParts(reason: string): { pageLabel: string; detail: string } {
  const trimmed = reason.trim();
  const match = trimmed.match(/^Page\s+(\d+):\s*(.+)$/i);
  if (!match) {
    return { pageLabel: "Page", detail: trimmed };
  }

  return {
    pageLabel: `Page ${match[1]}`,
    detail: match[2].trim(),
  };
}

function downloadPdf(bytes: Uint8Array, fileName: string) {
  const arrayBuffer = toArrayBuffer(bytes);
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function saveGeneratedTradePackToProject(params: {
  supabase: SupabaseClient<Database>;
  sessionUserId: string;
  organizationId: string;
  projectId: string;
  outputDisplayName: string;
  outputFileName: string;
  outputPdfBytes: Uint8Array;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}): Promise<ProjectDrawingSet> {
  const outputFile = new File([toArrayBuffer(params.outputPdfBytes)], params.outputFileName, {
    type: "application/pdf",
  });

  const storagePath = toDrawingSetStoragePath({
    organizationId: params.organizationId,
    projectId: params.projectId,
    fileName: params.outputFileName,
  });

  await uploadPdfToStorageWithResumable({
    supabase: params.supabase,
    file: outputFile,
    storagePath,
    onProgress: params.onProgress,
  });

  const { data: insertedRow, error: insertError } = await params.supabase
    .from("project_drawing_sets")
    .insert({
      organization_id: params.organizationId,
      project_id: params.projectId,
      uploaded_by: params.sessionUserId,
      file_name: params.outputDisplayName,
      storage_path: storagePath,
      file_size_bytes: outputFile.size,
      mime_type: "application/pdf",
    })
    .select(PROJECT_DRAWING_SET_SELECT)
    .single();

  if (insertError || !insertedRow) {
    await params.supabase.storage.from(PROJECT_DRAWING_SETS_BUCKET).remove([storagePath]);
    const fallbackMessage = insertedRow
      ? "Failed to save trade pack output."
      : "Trade pack output upload succeeded, but metadata insert returned no row.";
    throw new Error(toSupabaseErrorMessage(insertError, fallbackMessage));
  }

  return insertedRow;
}

async function upsertGeneratedTradePackMetadata(params: {
  supabase: SupabaseClient<Database>;
  drawingSet: ProjectDrawingSet;
  sessionUserId: string;
  organizationId: string;
  projectId: string;
  tradeId: string;
  tradeLabel: string;
}): Promise<void> {
  const payload: TradePackInsert = {
    id: params.drawingSet.id,
    organization_id: params.organizationId,
    project_id: params.projectId,
    trade_id: params.tradeId,
    trade_label: params.tradeLabel,
    pdf_url: toTradePackPdfUrl(params.drawingSet.storage_path),
    page_index_json: [],
    created_by: params.sessionUserId,
  };

  const maxAttempts = 3;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { error } = await params.supabase
      .from("trade_packs")
      .upsert(payload, { onConflict: "id" });

    if (!error) {
      return;
    }

    if (isMissingTableInSchemaCacheError(error, "trade_packs")) {
      throw new Error("Trade pack metadata table is not deployed (trade_packs).");
    }

    lastError = error;
    if (attempt < maxAttempts) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt * 300));
    }
  }

  throw new Error(
    toSupabaseErrorMessage(lastError, "Unable to save trade pack metadata.")
  );
}

function toRuleConfidenceFromScore(score: number, isSupportSheet: boolean): number {
  return clampConfidence(0.24 + Math.max(0, score) * 0.08 + (isSupportSheet ? 0.1 : 0));
}

async function renderPdfJsPageAsHighQualityImageDataUrl(page: PdfJsPage): Promise<string> {
  const baseViewport = page.getViewport({ scale: 1 });
  const largestDimension = Math.max(baseViewport.width, baseViewport.height);
  const targetLargestDimension = 2200;
  const scale = largestDimension > 0 ? Math.min(3.5, targetLargestDimension / largestDimension) : 1;
  const viewport = page.getViewport({ scale: Math.max(0.7, scale) });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Could not create canvas context for VLM page rendering.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  return canvas.toDataURL("image/jpeg", 0.92);
}

async function classifyTradePackPageWithVlm(
  request: TradePackVlmPageRequest
): Promise<TradePackVlmPageResult> {
  const response = await fetch("/api/trade-pack/classify-page", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(responseText || `VLM request failed with status ${response.status}.`);
  }

  const responseJson = (await response.json()) as { result?: TradePackVlmPageResult };
  if (!responseJson.result) {
    throw new Error("VLM returned no classification result.");
  }

  return responseJson.result;
}

async function saveTradePackPageIndexEntries(params: {
  supabase: SupabaseClient<Database>;
  rows: TradePackPageIndexInsert[];
}): Promise<void> {
  if (params.rows.length === 0) {
    return;
  }

  const batchSize = 100;
  for (let startIndex = 0; startIndex < params.rows.length; startIndex += batchSize) {
    const batch = params.rows.slice(startIndex, startIndex + batchSize);
    const { error: insertError } = await params.supabase
      .from("project_trade_pack_page_index")
      .insert(batch);

    if (!insertError) {
      continue;
    }

    const compactBatch = batch.map((row) => toCompactPageIndexInsertRow(row));
    const { error: compactInsertError } = await params.supabase
      .from("project_trade_pack_page_index")
      .insert(compactBatch);

    if (compactInsertError) {
      const initialMessage = toSupabaseErrorMessage(insertError, "Unable to insert page index batch.");
      const retryMessage = toSupabaseErrorMessage(
        compactInsertError,
        "Unable to insert compact page index batch."
      );
      throw new Error(
        `Unable to store page-level trade index (batch ${startIndex + 1}-${startIndex + batch.length}): ${initialMessage} | compact retry failed: ${retryMessage}`
      );
    }
  }
}

async function saveTradePackReasonSnapshot(params: {
  supabase: SupabaseClient<Database>;
  sessionUserId: string;
  organizationId: string;
  projectId: string;
  generatedDrawingSetId: string;
  sourceDocumentName: string;
  tradeId: string;
  tradeLabel: string;
  matchedPages: number;
  totalPages: number;
  supportPages: number;
  averageConfidence: number;
  reasons: PersistedExtractionReason[];
}): Promise<void> {
  const reasonItems = params.reasons.slice(0, 160).map((entry) => ({
    pageNumber: entry.pageNumber,
    reason: toCompactReasonText(entry.reason, 520),
    confidence: clampConfidence(entry.confidence),
    isSupportSheet: entry.isSupportSheet,
  }));

  const payload: TradePackReasonSnapshotInsert = {
    organization_id: params.organizationId,
    project_id: params.projectId,
    generated_drawing_set_id: params.generatedDrawingSetId,
    created_by: params.sessionUserId,
    source_document_name: params.sourceDocumentName,
    trade_id: params.tradeId,
    trade_label: params.tradeLabel,
    matched_pages: Math.max(0, params.matchedPages),
    total_pages: Math.max(0, params.totalPages),
    support_pages: Math.max(0, params.supportPages),
    average_confidence: clampConfidence(Number(params.averageConfidence.toFixed(4))),
    reasons: reasonItems as Record<string, unknown>[],
  };

  const { error: insertError } = await params.supabase
    .from("project_trade_pack_reason_snapshots")
    .insert(payload);

  if (insertError) {
    throw new Error(toSupabaseErrorMessage(insertError, "Unable to store extraction reason snapshot."));
  }
}

export function TradePackBuilderUploader({
  projectId,
  organizationId,
  initialDrawingSets,
}: TradePackBuilderUploaderProps) {
  const { session, isLoading: isAuthLoading } = useAuth();
  const [drawingSets, setDrawingSets] = useState<ProjectDrawingSet[]>(initialDrawingSets);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [editingDrawingSetId, setEditingDrawingSetId] = useState<string | null>(null);
  const [settingsMenuDrawingSetId, setSettingsMenuDrawingSetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingDrawingSetId, setDeletingDrawingSetId] = useState<string | null>(null);
  const [localSourceFile, setLocalSourceFile] = useState<File | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string>(TRADE_PACK_TRADES[0]?.id ?? "");
  const [selectedOutputDrawingSetId, setSelectedOutputDrawingSetId] = useState<string | null>(null);
  const [isGeneratingPack, setIsGeneratingPack] = useState(false);
  const [generationStep, setGenerationStep] = useState<string | null>(null);
  const [generationStartedAtMs, setGenerationStartedAtMs] = useState<number | null>(null);
  const [generationClockMs, setGenerationClockMs] = useState<number>(Date.now());
  const [lastGenerationSummary, setLastGenerationSummary] = useState<LastGenerationSummary | null>(null);
  const [persistedExtractionReasons, setPersistedExtractionReasons] = useState<PersistedExtractionReason[]>([]);
  const [isLoadingPersistedReasons, setIsLoadingPersistedReasons] = useState(false);
  const [persistedReasonsError, setPersistedReasonsError] = useState<string | null>(null);

  const supabase = useMemo(() => {
    try {
      return createBrowserSupabaseClient();
    } catch {
      return null;
    }
  }, []);

  const generatedTradePacks = useMemo(
    () => drawingSets.filter((drawingSet) => isGeneratedTradePackDrawingSet(drawingSet)),
    [drawingSets]
  );

  useEffect(() => {
    if (!isGeneratingPack || generationStartedAtMs === null) {
      return;
    }

    setGenerationClockMs(Date.now());
    const intervalId = window.setInterval(() => {
      setGenerationClockMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isGeneratingPack, generationStartedAtMs]);

  const onLocalSourceFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) {
      return;
    }

    setError(null);
    setStatus(null);

    if (!isPdfFile(file)) {
      setError(`${file.name}: only PDF files are supported.`);
      return;
    }

    if (file.size <= 0) {
      setError(`${file.name}: empty files are not supported.`);
      return;
    }

    if (file.size > MAX_DRAWING_SET_UPLOAD_SIZE_BYTES) {
      setError(
        `${file.name}: file is too large. Max size is ${formatFileSize(MAX_DRAWING_SET_UPLOAD_SIZE_BYTES)}.`
      );
      return;
    }

    setLocalSourceFile(file);
    setLastGenerationSummary(null);
  };

  const downloadDrawingSet = async (drawingSet: ProjectDrawingSet) => {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setError(null);
    setDownloadingPath(drawingSet.storage_path);

    try {
      const { data, error: downloadError } = await supabase
        .storage
        .from(PROJECT_DRAWING_SETS_BUCKET)
        .download(drawingSet.storage_path);

      if (downloadError || !data) {
        throw downloadError ?? new Error("Could not download drawing set.");
      }

      const downloadName = drawingSet.file_name.toLowerCase().endsWith(".pdf")
        ? drawingSet.file_name
        : `${drawingSet.file_name}.pdf`;
      const objectUrl = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadActionError) {
      setError(downloadActionError instanceof Error ? downloadActionError.message : "Unable to download drawing set.");
    } finally {
      setDownloadingPath(null);
    }
  };

  const startRenameDrawingSet = (drawingSet: ProjectDrawingSet) => {
    setError(null);
    setStatus(null);
    setSettingsMenuDrawingSetId(null);
    setEditingDrawingSetId(drawingSet.id);
    setRenameDraft(drawingSet.file_name);
  };

  const cancelRenameDrawingSet = () => {
    setEditingDrawingSetId(null);
    setRenameDraft("");
  };

  const saveDrawingSetRename = async (drawingSet: ProjectDrawingSet) => {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const nextName = renameDraft.trim();
    if (!nextName) {
      setError("File name cannot be blank.");
      return;
    }

    if (nextName === drawingSet.file_name) {
      cancelRenameDrawingSet();
      return;
    }

    setError(null);
    setStatus(null);
    setRenamingId(drawingSet.id);

    try {
      const { data: updatedRow, error: renameError } = await supabase
        .from("project_drawing_sets")
        .update({ file_name: nextName })
        .eq("id", drawingSet.id)
        .select("id, file_name, updated_at")
        .single();

      if (renameError || !updatedRow) {
        throw renameError ?? new Error("Unable to rename this file.");
      }

      setDrawingSets((current) =>
        current.map((currentRow) =>
          currentRow.id === drawingSet.id
            ? {
                ...currentRow,
                file_name: updatedRow.file_name,
                updated_at: updatedRow.updated_at,
              }
            : currentRow
        )
      );
      setStatus("File name updated.");
      cancelRenameDrawingSet();
    } catch (renameUpdateError) {
      setError(renameUpdateError instanceof Error ? renameUpdateError.message : "Unable to rename this file.");
    } finally {
      setRenamingId(null);
    }
  };

  const deleteDrawingSet = async (drawingSet: ProjectDrawingSet) => {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setSettingsMenuDrawingSetId(null);
    const confirmed = window.confirm(`Delete "${drawingSet.file_name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setError(null);
    setStatus(null);
    setDeletingDrawingSetId(drawingSet.id);

    try {
      const { error: storageDeleteError } = await supabase.storage
        .from(PROJECT_DRAWING_SETS_BUCKET)
        .remove([drawingSet.storage_path]);

      if (storageDeleteError) {
        throw storageDeleteError;
      }

      const { error: metadataDeleteError } = await supabase
        .from("project_drawing_sets")
        .delete()
        .eq("id", drawingSet.id);

      if (metadataDeleteError) {
        throw metadataDeleteError;
      }

      setDrawingSets((current) => current.filter((row) => row.id !== drawingSet.id));
      if (editingDrawingSetId === drawingSet.id) {
        cancelRenameDrawingSet();
      }
      setStatus("Drawing set deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete this drawing set.");
    } finally {
      setDeletingDrawingSetId(null);
    }
  };

  const generateTradePack = async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    if (isAuthLoading) {
      setError("Loading your account. Please try again in a moment.");
      return;
    }

    if (!session) {
      setError("You are not signed in. Please sign in again.");
      return;
    }

    if (!session.organizationId || session.organizationId !== organizationId) {
      setError("Your account is not linked to this project's organization.");
      return;
    }

    const trade = getTradeById(selectedTradeId);
    if (!trade) {
      setError("Select a valid trade.");
      return;
    }

    const existingGeneratedPack = drawingSets.some((drawingSet) => isGeneratedTradePackDrawingSet(drawingSet));
    if (existingGeneratedPack) {
      setError("Trade Pack already generated.\nThe Trade Pack Builder can only be used once per Trade Pack.");
      return;
    }

    setError(null);
    setStatus(null);
    setLastGenerationSummary(null);
    setIsGeneratingPack(true);
    setGenerationStartedAtMs(Date.now());

    try {
      setGenerationStep("Preparing source PDF...");

      if (!localSourceFile) {
        setError("Select a local source PDF.");
        return;
      }

      const sourceDisplayName = toDefaultDraftName(localSourceFile.name);
      const sourcePdfBytes = new Uint8Array(await localSourceFile.arrayBuffer());

      if (!hasPdfHeader(sourcePdfBytes)) {
        throw new Error(
          `"${sourceDisplayName}" is not a valid PDF byte stream (missing PDF header). Re-upload this set or use Local mode with the original PDF.`
        );
      }

      const [{ PDFDocument }, pdfjs] = await Promise.all([
        import("pdf-lib"),
        import("pdfjs-dist/legacy/build/pdf.mjs"),
      ]);

      // Required for browser builds in Next.js so pdf.js can spawn its worker.
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }

      // Keep independent byte buffers; pdf.js may consume/transfer the input.
      const pdfJsInputBytes = sourcePdfBytes.slice();
      const pdfLibInputBytes = sourcePdfBytes.slice();

      const loadingTask = (pdfjs as unknown as PdfJsModule).getDocument({
        data: pdfJsInputBytes,
        disableWorker: true,
      });
      let sourcePdf: PdfJsDocument;
      try {
        sourcePdf = await loadingTask.promise;
      } catch (parseError) {
        throw new Error(
          `Unable to parse "${sourceDisplayName}" as PDF. First bytes: ${toBytePreview(sourcePdfBytes)}. ${
            parseError instanceof Error ? parseError.message : "Unknown parser error."
          }`
        );
      }

      const matchedPageIndexes: number[] = [];
      const reasons: string[] = [];
      const pageIndexRowsDraft: TradePackPageIndexInsert[] = [];
      const runId = crypto.randomUUID();
      let supportPagesIncluded = 0;
      let vlmPages = 0;
      let fallbackPages = 0;
      let rulesOnlyPages = 0;
      let floorPlanPagesIncluded = 0;
      let confidenceAccumulator = 0;
      let confidenceCount = 0;

      for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber += 1) {
        const page = await sourcePdf.getPage(pageNumber);
        setGenerationStep(`Reading page ${pageNumber} of ${sourcePdf.numPages}...`);
        const textContent = await page.getTextContent();
        const pageText = getPageTextFromPdfJsTextContent(textContent);
        const prefilterSignal = analyzePagePrefilterForTrade(pageText, trade);
        const shouldRunVlm = true;
        const fallbackRuleSignal = analyzePageForTrade(pageText, trade);

        let classification: TradePackVlmPageResult;

        if (shouldRunVlm) {
          setGenerationStep(`Reviewing drawings… (${pageNumber} of ${sourcePdf.numPages})`);

          try {
            const pageImageDataUrl = await renderPdfJsPageAsHighQualityImageDataUrl(page);
            const pageTextForVlm = pageText.slice(0, 12000);
            classification = await classifyTradePackPageWithVlm({
              organizationId,
              projectId,
              tradeId: trade.id,
              tradeLabel: trade.label,
              pageNumber,
              totalPages: sourcePdf.numPages,
              pageText: pageTextForVlm,
              pageImageDataUrl,
              prefilter: prefilterSignal,
            });
          } catch {
            classification = {
              classificationMode: "fallback-rules",
              isRelevant: fallbackRuleSignal.isRelevant || prefilterSignal.isSupportSheet,
              confidence: toRuleConfidenceFromScore(
                fallbackRuleSignal.score || prefilterSignal.score,
                prefilterSignal.isSupportSheet
              ),
              isSupportSheet: prefilterSignal.isSupportSheet,
              reason: fallbackRuleSignal.reason || prefilterSignal.reason,
              supportReason: prefilterSignal.isSupportSheet ? prefilterSignal.supportMatches[0] ?? null : null,
              tradeSignals: [
                ...prefilterSignal.matchedSheetPrefixes.slice(0, 2),
                ...prefilterSignal.matchedStructuredKeywords.slice(0, 1),
                ...prefilterSignal.matchedAbbreviations.slice(0, 2),
              ],
              secondaryTradeIds: [],
              provider: "rules",
              model: "rules-engine",
              escalatedFromPrimary: false,
            };
          }
        } else {
          classification = {
            classificationMode: "rules-only",
            isRelevant: fallbackRuleSignal.isRelevant,
            confidence: toRuleConfidenceFromScore(fallbackRuleSignal.score, prefilterSignal.isSupportSheet),
            isSupportSheet: prefilterSignal.isSupportSheet,
            reason: fallbackRuleSignal.reason,
            supportReason: prefilterSignal.isSupportSheet ? prefilterSignal.supportMatches[0] ?? null : null,
            tradeSignals: [
              ...prefilterSignal.matchedSheetPrefixes.slice(0, 2),
              ...prefilterSignal.matchedStructuredKeywords.slice(0, 1),
              ...prefilterSignal.matchedAbbreviations.slice(0, 2),
            ],
            secondaryTradeIds: [],
            provider: "rules",
            model: "rules-engine",
            escalatedFromPrimary: false,
          };
        }

        if (classification.classificationMode === "vlm") {
          vlmPages += 1;
        } else if (classification.classificationMode === "fallback-rules") {
          fallbackPages += 1;
        } else {
          rulesOnlyPages += 1;
        }

        confidenceAccumulator += classification.confidence;
        confidenceCount += 1;

        // Always include the first page so project/cover information is present in every trade pack.
        const includeByMandatoryCoverPage = pageNumber === 1;
        const includeAsRelevant = classification.isRelevant && classification.confidence >= 0.52;
        const includeAsSupport = classification.isSupportSheet && classification.confidence >= 0.42;
        const includeByMandatoryFloorPlan = shouldForceIncludeFloorPlanPage({
          pageText,
          classification,
          prefilterSignal,
        });
        const includeInPack =
          includeAsRelevant || includeAsSupport || includeByMandatoryFloorPlan || includeByMandatoryCoverPage;
        const forcedReasonSuffix: string[] = [];
        if (includeByMandatoryCoverPage && !includeAsRelevant && !includeAsSupport) {
          forcedReasonSuffix.push("Included by mandatory cover page rule.");
        }
        if (includeByMandatoryFloorPlan && !includeAsRelevant && !includeAsSupport) {
          forcedReasonSuffix.push("Included by mandatory floor plan rule.");
        }
        const finalReason =
          forcedReasonSuffix.length > 0
            ? `${classification.reason} ${forcedReasonSuffix.join(" ")}`.trim()
            : classification.reason;

        if (includeInPack) {
          matchedPageIndexes.push(pageNumber - 1);
          if (classification.isSupportSheet) {
            supportPagesIncluded += 1;
          }
          if (includeByMandatoryFloorPlan) {
            floorPlanPagesIncluded += 1;
          }

          if (reasons.length < 12) {
            const pct = Math.round(classification.confidence * 100);
            reasons.push(`Page ${pageNumber}: ${toCompactReasonText(finalReason)} (${pct}%)`);
          }
        }

        pageIndexRowsDraft.push({
          run_id: runId,
          organization_id: organizationId,
          project_id: projectId,
          source_drawing_set_id: null,
          generated_drawing_set_id: null,
          created_by: session.id,
          source_document_name: sourceDisplayName,
          trade_id: trade.id,
          trade_label: trade.label,
          page_number: pageNumber,
          include_in_pack: includeInPack,
          confidence: classification.confidence,
          classifier: classification.classificationMode,
          prefilter_pass: prefilterSignal.shouldSendToVlm,
          is_support_sheet: classification.isSupportSheet,
          reason: finalReason,
          metadata: {
            supportReason: classification.supportReason,
            prefilter: prefilterSignal,
            tradeSignals: classification.tradeSignals,
            secondaryTradeIds: classification.secondaryTradeIds,
            modelProvider: classification.provider,
            modelName: classification.model,
            escalatedFromPrimary: classification.escalatedFromPrimary,
            forcedCoverPageInclude: includeByMandatoryCoverPage,
            forcedFloorPlanInclude: includeByMandatoryFloorPlan,
          },
        });
      }

      if (matchedPageIndexes.length === 0) {
        throw new Error(
          `No ${trade.label} pages were detected. Try another trade or rename/review your uploaded drawing set.`
        );
      }

      setGenerationStep("Building trade pack PDF...");

      let sourcePdfLibDocument;
      try {
        sourcePdfLibDocument = await PDFDocument.load(pdfLibInputBytes);
      } catch (copyParseError) {
        throw new Error(
          `Unable to prepare "${sourceDisplayName}" for page extraction. First bytes: ${toBytePreview(pdfLibInputBytes)}. ${
            copyParseError instanceof Error ? copyParseError.message : "Unknown PDF copy error."
          }`
        );
      }
      const tradePackDocument = await PDFDocument.create();
      const copiedPages = await tradePackDocument.copyPages(sourcePdfLibDocument, matchedPageIndexes);

      for (const copiedPage of copiedPages) {
        tradePackDocument.addPage(copiedPage);
      }

      tradePackDocument.setTitle(`${sourceDisplayName} - ${trade.label} Trade Pack`);
      tradePackDocument.setProducer("Tradesstack Trade Pack Builder");
      tradePackDocument.setSubject(`${trade.label} filtered drawing pages`);

      const tradePackPdfBytes = await tradePackDocument.save();
      const downloadBase = toSafeDownloadBaseName(sourceDisplayName);
      const outputFileName = `${downloadBase}-${trade.slug}-trade-pack.pdf`;
      const outputDisplayName = `${sourceDisplayName} - ${trade.label} Trade Pack`;
      downloadPdf(tradePackPdfBytes, outputFileName);

      setGenerationStep("Saving trade pack output...");
      let outputRow: ProjectDrawingSet | null = null;
      let outputSaveError: string | null = null;

      try {
        outputRow = await saveGeneratedTradePackToProject({
          supabase,
          sessionUserId: session.id,
          organizationId,
          projectId,
          outputDisplayName,
          outputFileName,
          outputPdfBytes: tradePackPdfBytes,
          onProgress(uploadedBytes, totalBytes) {
            if (totalBytes <= 0) {
              return;
            }
            const pct = Math.min(100, Math.max(0, Math.round((uploadedBytes / totalBytes) * 100)));
            setGenerationStep(`Saving trade pack output... (${pct}%)`);
          },
        });
      } catch (saveError) {
        outputSaveError = toSupabaseErrorMessage(saveError, "Unable to save trade pack output.");
        const normalizedSaveError = outputSaveError.toLowerCase();
        if (normalizedSaveError.includes("row-level security") || normalizedSaveError.includes("policy")) {
          outputSaveError = "Trade Pack already generated.\nThe Trade Pack Builder can only be used once per Trade Pack.";
        }
      }

      if (outputRow) {
        setGenerationStep("Recording trade pack metadata...");
        await upsertGeneratedTradePackMetadata({
          supabase,
          drawingSet: outputRow,
          sessionUserId: session.id,
          organizationId,
          projectId,
          tradeId: trade.id,
          tradeLabel: trade.label,
        });

        setDrawingSets((current) => [outputRow, ...current]);
        setSelectedOutputDrawingSetId(outputRow.id);
      }

      const includedReasonRows = pageIndexRowsDraft
        .filter((row) => row.include_in_pack)
        .sort((left, right) => left.page_number - right.page_number);

      let reasonSnapshotSaveError: string | null = null;
      if (outputRow) {
        setGenerationStep("Saving extraction reasons...");
        try {
          await saveTradePackReasonSnapshot({
            supabase,
            sessionUserId: session.id,
            organizationId,
            projectId,
            generatedDrawingSetId: outputRow.id,
            sourceDocumentName: sourceDisplayName,
            tradeId: trade.id,
            tradeLabel: trade.label,
            matchedPages: matchedPageIndexes.length,
            totalPages: sourcePdf.numPages,
            supportPages: supportPagesIncluded,
            averageConfidence: confidenceCount > 0 ? confidenceAccumulator / confidenceCount : 0,
            reasons: includedReasonRows.map((row) => ({
              pageNumber: row.page_number,
              reason: row.reason ?? "",
              confidence: row.confidence ?? 0,
              isSupportSheet: row.is_support_sheet ?? false,
            })),
          });
        } catch (snapshotError) {
          reasonSnapshotSaveError = toSupabaseErrorMessage(
            snapshotError,
            "Unable to save extraction reason snapshot."
          );
        }
      }

      setGenerationStep("Saving page-level trade index...");
      let pageIndexSaveError: string | null = null;
      let pageIndexSkippedMissingTable = false;
      try {
        await saveTradePackPageIndexEntries({
          supabase,
          rows: pageIndexRowsDraft.map((row) => ({
            ...row,
            generated_drawing_set_id: outputRow?.id ?? null,
          })),
        });
      } catch (indexError) {
        if (isMissingTableInSchemaCacheError(indexError, "project_trade_pack_page_index")) {
          pageIndexSkippedMissingTable = true;
        } else {
          pageIndexSaveError = toSupabaseErrorMessage(indexError, "Unable to store page-level trade index.");
        }
      }

      setLastGenerationSummary({
        sourceName: sourceDisplayName,
        tradeLabel: trade.label,
        matchedPages: matchedPageIndexes.length,
        totalPages: sourcePdf.numPages,
        supportPages: supportPagesIncluded,
        avgConfidence: confidenceCount > 0 ? confidenceAccumulator / confidenceCount : 0,
        vlmPages,
        fallbackPages,
        rulesOnlyPages,
        reasons,
      });

      if (outputSaveError) {
        setStatus(
          `${trade.label} trade pack generated: ${matchedPageIndexes.length} pages from ${sourcePdf.numPages}. Download started.`
        );
        setError(`Trade pack generated, but output could not be saved: ${outputSaveError}`);
      } else if (reasonSnapshotSaveError && pageIndexSaveError) {
        setStatus(
          `${trade.label} trade pack generated: ${matchedPageIndexes.length} pages from ${sourcePdf.numPages}. Download started and output saved.`
        );
        setError(
          `Trade pack generated, but saved reasoning and page index both failed: ${reasonSnapshotSaveError} | ${pageIndexSaveError}`
        );
      } else if (reasonSnapshotSaveError) {
        setStatus(
          `${trade.label} trade pack generated: ${matchedPageIndexes.length} pages from ${sourcePdf.numPages}. Download started, output saved, and reasoning saved via page index.`
        );
      } else if (pageIndexSkippedMissingTable) {
        setStatus(
          `${trade.label} trade pack generated: ${matchedPageIndexes.length} pages from ${sourcePdf.numPages}. Download started, output saved, and reasoning saved. Page index table is not deployed yet, so indexing was skipped.`
        );
      } else if (pageIndexSaveError) {
        setStatus(
          `${trade.label} trade pack generated: ${matchedPageIndexes.length} pages from ${sourcePdf.numPages}. Download started and output saved.`
        );
        setError(
          `Trade pack generated and saved with reasoning, but page index storage failed: ${pageIndexSaveError}`
        );
      } else {
        setStatus(
          `${trade.label} trade pack generated: ${matchedPageIndexes.length} pages from ${sourcePdf.numPages}. Includes ${floorPlanPagesIncluded} floor plan page(s). Download started, output saved, reasoning saved, and page index stored.`
        );
      }
    } catch (generationError) {
      setError(toSupabaseErrorMessage(generationError, "Unable to build trade pack."));
    } finally {
      setGenerationStep(null);
      setGenerationStartedAtMs(null);
      setIsGeneratingPack(false);
    }
  };

  const canGenerateTradePack = Boolean(localSourceFile);
  const latestGeneratedTradePack = generatedTradePacks[0] ?? null;
  const selectedGeneratedTradePack =
    generatedTradePacks.find((drawingSet) => drawingSet.id === selectedOutputDrawingSetId) ?? latestGeneratedTradePack;
  const selectedTrade = TRADE_PACK_TRADES.find((tradeOption) => tradeOption.id === selectedTradeId) ?? null;
  const outputFilePreview =
    localSourceFile && selectedTrade
      ? `${toSafeDownloadBaseName(toDefaultDraftName(localSourceFile.name))}-${selectedTrade.slug}-trade-pack.pdf`
      : "Generated after run";
  const generationProgress = useMemo(() => {
    if (!generationStep || generationStartedAtMs === null) {
      return null;
    }

    const match =
      generationStep.match(/Reviewing drawings(?:\.\.\.|…)\s*\((\d+)\s+of\s+(\d+)\)/i) ??
      generationStep.match(/VLM classifying page\s+(\d+)\s+of\s+(\d+)/i) ??
      generationStep.match(/Reading page\s+(\d+)\s+of\s+(\d+)/i);
    if (!match) {
      return null;
    }

    const pagesProcessed = Number.parseInt(match[1] ?? "0", 10);
    const totalPages = Number.parseInt(match[2] ?? "0", 10);
    if (!Number.isFinite(pagesProcessed) || !Number.isFinite(totalPages) || pagesProcessed <= 0 || totalPages <= 0) {
      return null;
    }

    const elapsedMs = Math.max(generationClockMs - generationStartedAtMs, 0);
    const remainingPages = Math.max(totalPages - pagesProcessed, 0);
    const avgMsPerPage = elapsedMs / pagesProcessed;
    const estimatedRemainingSeconds = Math.max(Math.round((avgMsPerPage * remainingPages) / 1000), 0);
    const percent = Math.min(100, Math.max(0, Math.round((pagesProcessed / totalPages) * 100)));

    return {
      pagesProcessed,
      totalPages,
      remainingPages,
      estimatedRemainingSeconds,
      percent,
    };
  }, [generationClockMs, generationStartedAtMs, generationStep]);
  const extractedPageReasons = useMemo(() => {
    if (persistedExtractionReasons.length > 0) {
      return persistedExtractionReasons.map((entry) => {
        const pct = Math.round(entry.confidence * 100);
        const supportSuffix = entry.isSupportSheet ? " [support]" : "";
        return `Page ${entry.pageNumber}: ${toCompactReasonText(entry.reason)} (${pct}%)${supportSuffix}`;
      });
    }

    const lastRunMatchesSelected =
      Boolean(selectedGeneratedTradePack?.id) && selectedGeneratedTradePack?.id === latestGeneratedTradePack?.id;
    if (lastRunMatchesSelected && lastGenerationSummary?.reasons.length) {
      return lastGenerationSummary.reasons;
    }

    return [];
  }, [
    lastGenerationSummary,
    latestGeneratedTradePack?.id,
    persistedExtractionReasons,
    selectedGeneratedTradePack?.id,
  ]);

  useEffect(() => {
    if (generatedTradePacks.length === 0) {
      setSelectedOutputDrawingSetId(null);
      return;
    }

    const selectedStillExists = generatedTradePacks.some((drawingSet) => drawingSet.id === selectedOutputDrawingSetId);
    if (!selectedStillExists) {
      setSelectedOutputDrawingSetId(null);
    }
  }, [generatedTradePacks, selectedOutputDrawingSetId]);

  useEffect(() => {
    if (!supabase || !selectedGeneratedTradePack?.id) {
      setPersistedExtractionReasons([]);
      setPersistedReasonsError(null);
      setIsLoadingPersistedReasons(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingPersistedReasons(true);
    setPersistedReasonsError(null);

    const loadPersistedReasons = async () => {
      try {
        const { data: snapshotRow, error: snapshotError } = await supabase
          .from("project_trade_pack_reason_snapshots")
          .select("reasons")
          .eq("organization_id", organizationId)
          .eq("project_id", projectId)
          .eq("generated_drawing_set_id", selectedGeneratedTradePack.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (isCancelled) {
          return;
        }

        if (!snapshotError) {
          const snapshotReasons = toPersistedExtractionReasonsFromSnapshot(snapshotRow?.reasons);
          if (snapshotReasons.length > 0) {
            setPersistedExtractionReasons(snapshotReasons);
            return;
          }
        }

        const snapshotErrorMessage = snapshotError
          ? toSupabaseErrorMessage(snapshotError, "Unable to load extraction reasons.")
          : null;

        const { data: directRows, error: directError } = await supabase
          .from("project_trade_pack_page_index")
          .select("page_number, reason, confidence, is_support_sheet")
          .eq("organization_id", organizationId)
          .eq("project_id", projectId)
          .eq("generated_drawing_set_id", selectedGeneratedTradePack.id)
          .eq("include_in_pack", true)
          .order("page_number", { ascending: true })
          .limit(80);

        if (isCancelled) {
          return;
        }

        if (!directError && (directRows ?? []).length > 0) {
          setPersistedExtractionReasons(
            (directRows ?? []).map((row) => ({
              pageNumber: row.page_number,
              reason: row.reason,
              confidence: row.confidence,
              isSupportSheet: row.is_support_sheet,
            }))
          );
          return;
        }

        const directErrorMessage = directError
          ? toSupabaseErrorMessage(directError, snapshotErrorMessage ?? "Unable to load extraction reasons.")
          : snapshotErrorMessage;

        const pageIndexTableMissing =
          isMissingTableInSchemaCacheError(directError, "project_trade_pack_page_index") ||
          isMissingTableInSchemaCacheError(snapshotError, "project_trade_pack_page_index");
        if (pageIndexTableMissing) {
          setPersistedExtractionReasons([]);
          setPersistedReasonsError(null);
          return;
        }

        const fallbackTradeLabel = getGeneratedTradePackTradeLabel(selectedGeneratedTradePack);
        const fallbackSourceDocumentName = toSourceDocumentNameFromGeneratedPackName(
          selectedGeneratedTradePack.file_name,
          fallbackTradeLabel
        );

        if (!fallbackSourceDocumentName) {
          setPersistedExtractionReasons([]);
          setPersistedReasonsError(directErrorMessage);
          return;
        }

        const { data: fallbackRows, error: fallbackError } = await supabase
          .from("project_trade_pack_page_index")
          .select("run_id, page_number, reason, confidence, is_support_sheet, created_at")
          .eq("organization_id", organizationId)
          .eq("project_id", projectId)
          .eq("source_document_name", fallbackSourceDocumentName)
          .eq("trade_label", fallbackTradeLabel)
          .eq("include_in_pack", true)
          .order("created_at", { ascending: false })
          .limit(400);

        if (isCancelled) {
          return;
        }

        if (fallbackError) {
          if (isMissingTableInSchemaCacheError(fallbackError, "project_trade_pack_page_index")) {
            setPersistedExtractionReasons([]);
            setPersistedReasonsError(null);
            return;
          }

          setPersistedExtractionReasons([]);
          setPersistedReasonsError(
            toSupabaseErrorMessage(fallbackError, directErrorMessage ?? "Unable to load extraction reasons.")
          );
          return;
        }

        const latestRunId = fallbackRows?.[0]?.run_id ?? null;
        if (!latestRunId) {
          setPersistedExtractionReasons([]);
          setPersistedReasonsError(null);
          return;
        }

        const latestRunRows = (fallbackRows ?? [])
          .filter((row) => row.run_id === latestRunId)
          .sort((left, right) => left.page_number - right.page_number);

        setPersistedExtractionReasons(
          latestRunRows.map((row) => ({
            pageNumber: row.page_number,
            reason: row.reason,
            confidence: row.confidence,
            isSupportSheet: row.is_support_sheet,
          }))
        );
      } catch (loadError) {
        if (!isCancelled) {
          setPersistedExtractionReasons([]);
          setPersistedReasonsError(
            toSupabaseErrorMessage(loadError, "Unable to load extraction reasons from saved page index.")
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingPersistedReasons(false);
        }
      }
    };

    void loadPersistedReasons();

    return () => {
      isCancelled = true;
    };
  }, [organizationId, projectId, selectedGeneratedTradePack, selectedGeneratedTradePack?.id, supabase]);

  const renderDrawingSetRow = (drawingSet: ProjectDrawingSet, showTradePackBadge: boolean) => (
    <div
      key={drawingSet.id}
      className="rounded-[10px] border border-[#E6EAF0] bg-white px-4 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editingDrawingSetId === drawingSet.id ? (
            <div className="space-y-2">
              <label
                htmlFor={`rename-${drawingSet.id}`}
                className="block text-xs font-medium uppercase tracking-[0.12em] text-[#8b98ad]"
              >
                Drawing Set Name
              </label>
              <Input
                id={`rename-${drawingSet.id}`}
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                disabled={renamingId === drawingSet.id || isGeneratingPack || deletingDrawingSetId !== null}
                className="h-10 rounded-[12px] border-[#cdd6e6] bg-white text-[#1d2433]"
              />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[15px] font-semibold text-[#1d2433]">
                  {showTradePackBadge ? getGeneratedTradePackTradeLabel(drawingSet) : drawingSet.file_name}
                </p>
                {showTradePackBadge ? (
                  <span className="inline-flex items-center rounded-[6px] border border-[#E2E8F0] bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#334155]">
                    Trade Pack
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[13px] text-[#64748B]">
                {formatFileSize(drawingSet.file_size_bytes)} • Uploaded {formatUploadedAt(drawingSet.uploaded_at)}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editingDrawingSetId === drawingSet.id ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => saveDrawingSetRename(drawingSet)}
                disabled={renamingId === drawingSet.id || isGeneratingPack || deletingDrawingSetId !== null}
                className="h-8 rounded-[8px] border-[#E6EAF0] bg-white px-3 text-[13px] text-[#1d2433] hover:bg-[#F8FAFC]"
              >
                {renamingId === drawingSet.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={cancelRenameDrawingSet}
                disabled={renamingId === drawingSet.id || isGeneratingPack || deletingDrawingSetId !== null}
                className="h-8 rounded-[8px] px-3 text-[13px] text-[#5f6f89] hover:bg-[#eef3fb]"
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadDrawingSet(drawingSet)}
                disabled={downloadingPath === drawingSet.storage_path || isGeneratingPack || deletingDrawingSetId !== null}
                className="h-8 rounded-[8px] border-[#E6EAF0] bg-white px-3 text-[13px] text-[#1d2433] hover:bg-[#F8FAFC]"
              >
                {downloadingPath === drawingSet.storage_path ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                Download
              </Button>

              {showTradePackBadge ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setSelectedOutputDrawingSetId((currentId) => (currentId === drawingSet.id ? null : drawingSet.id))
                  }
                  disabled={isGeneratingPack || deletingDrawingSetId !== null}
                  className="h-8 rounded-[8px] border-[#E6EAF0] bg-white px-3 text-[13px] text-[#1d2433] hover:bg-[#F8FAFC]"
                >
                  Why
                  <ChevronDown
                    className={`ml-1 h-4 w-4 transition-transform ${
                      selectedOutputDrawingSetId === drawingSet.id ? "rotate-180" : "rotate-0"
                    }`}
                  />
                </Button>
              ) : null}

              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setSettingsMenuDrawingSetId((currentId) => (currentId === drawingSet.id ? null : drawingSet.id))
                  }
                  disabled={renamingId !== null || isGeneratingPack || deletingDrawingSetId !== null}
                  className="h-8 rounded-[8px] border-[#E6EAF0] bg-white px-3 text-[13px] text-[#1d2433] hover:bg-[#F8FAFC]"
                >
                  Settings
                  <ChevronDown
                    className={`ml-1 h-4 w-4 transition-transform ${
                      settingsMenuDrawingSetId === drawingSet.id ? "rotate-180" : "rotate-0"
                    }`}
                  />
                </Button>

                {settingsMenuDrawingSetId === drawingSet.id ? (
                  <div className="absolute right-0 top-11 z-20 min-w-[140px] rounded-[10px] border border-[#d7deeb] bg-white p-1.5 shadow-[0_10px_20px_rgba(16,24,40,0.12)]">
                    <button
                      type="button"
                      onClick={() => startRenameDrawingSet(drawingSet)}
                      disabled={renamingId !== null || isGeneratingPack || deletingDrawingSetId !== null}
                      className="flex h-8 w-full items-center rounded-[8px] px-2.5 text-left text-sm text-[#1d2433] hover:bg-[#f6f9ff] disabled:text-[#8b98ad]"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteDrawingSet(drawingSet);
                      }}
                      disabled={deletingDrawingSetId === drawingSet.id || isGeneratingPack || renamingId !== null}
                      className="flex h-8 w-full items-center rounded-[8px] px-2.5 text-left text-sm text-[#b83a3a] hover:bg-[#fdeeee] disabled:text-[#cf9090]"
                    >
                      {deletingDrawingSetId === drawingSet.id ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {showTradePackBadge && selectedOutputDrawingSetId === drawingSet.id ? (
        <div className="mt-4 border-t border-[#E6EAF0] pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B]">Why pages were extracted</p>
          {extractedPageReasons.length > 0 ? (
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {extractedPageReasons.map((reason, reasonIndex) => {
                const { pageLabel, detail } = toExtractionReasonParts(reason);

                return (
                  <div key={`${reasonIndex}-${reason}`} className="rounded-[8px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2.5">
                    <p className="text-[13px] font-semibold text-[#334155]">{pageLabel}</p>
                    <p className="mt-1 text-[13px] leading-[1.6] text-[#475569]">{detail}</p>
                  </div>
                );
              })}
            </div>
          ) : isLoadingPersistedReasons ? (
            <p className="mt-2 text-[13px] text-[#5f7292]">Loading extraction reasons...</p>
          ) : persistedReasonsError ? (
            <p className="mt-2 text-[13px] text-red-700">{persistedReasonsError}</p>
          ) : (
            <p className="mt-2 text-[13px] text-[#5f7292]">No extraction reasons found for this output.</p>
          )}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-8 pb-8">
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Trade Pack Builder</h2>
        <p className="max-w-3xl text-base text-[#4f5f79]">Upload the full set. Pick a trade. Download only the pages that matter.</p>
      </section>

      <section className="grid gap-5 xl:grid-cols-12">
        <div className="rounded-[12px] border border-[#E6EAF0] bg-white p-6 xl:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mt-1 text-xl font-semibold tracking-[-0.01em] text-[#1d2433]">Create Trade Pack</p>
            </div>
            <Button
              type="button"
              onClick={generateTradePack}
              disabled={isGeneratingPack || !canGenerateTradePack || deletingDrawingSetId !== null}
              className="h-10 rounded-[8px] bg-[#F74917] px-[18px] text-sm font-medium text-white hover:bg-[#E63F10] disabled:bg-[#f6a47f]"
            >
              {isGeneratingPack ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Building Pack
                </>
              ) : (
                "Generate & Download"
              )}
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="localSourcePdfInput" className="text-xs font-medium uppercase tracking-[0.16em] text-[#8b98ad]">
                Source PDF
              </label>
              <div className="flex h-11 items-center gap-2 rounded-[10px] border border-[#cdd6e6] bg-white px-2">
                <input
                  id="localSourcePdfInput"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={onLocalSourceFileSelect}
                  disabled={isGeneratingPack || deletingDrawingSetId !== null}
                  className="hidden"
                />
                <label
                  htmlFor="localSourcePdfInput"
                  className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-[8px] bg-[#161922] px-3 text-xs font-medium text-white hover:bg-[#101217]"
                >
                  Select PDF
                </label>
                <p className="truncate pr-1 text-sm text-[#5f6f89]">
                  {localSourceFile ? localSourceFile.name : "No source PDF selected"}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="tradeSelector" className="text-xs font-medium uppercase tracking-[0.16em] text-[#8b98ad]">
                Trade
              </label>
              <select
                id="tradeSelector"
                value={selectedTradeId}
                onChange={(event) => setSelectedTradeId(event.target.value)}
                disabled={isGeneratingPack || deletingDrawingSetId !== null}
                className="h-11 w-full rounded-[10px] border border-[#cdd6e6] bg-white px-3 text-sm text-[#1d2433] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5406]/35"
              >
                {TRADE_PACK_TRADES.map((trade) => (
                  <option key={trade.id} value={trade.id}>
                    {trade.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="mt-3 text-xs text-[#6f7f98]">
            Source PDF stays on your device during generation. Only generated trade packs are saved in this project.
          </p>

          <div className="mt-4 space-y-2">
            {generationStep ? (
              <div className="space-y-2 rounded-[10px] border border-[#dbe1eb] bg-[#f8fafc] px-3 py-2">
                <p className="inline-flex items-center gap-2 text-sm text-[#4f5f79]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#ff5406]" />
                  {generationStep}
                </p>
                {generationProgress ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-[#4f5f79]">
                      Analyzing drawing set for {(selectedTrade?.label ?? "selected trade").toLowerCase()} scope
                    </p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#e3e9f3]">
                      <div
                        className="h-full rounded-full bg-[#ff5406] transition-[width] duration-500"
                        style={{ width: `${generationProgress.percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-[#5f6f89]">
                      Estimated time remaining: ~{formatEtaSeconds(generationProgress.estimatedRemainingSeconds)}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {status ? (
              <p className="inline-flex items-center gap-2 rounded-[10px] border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {status}
              </p>
            ) : null}
            {error ? <p className="rounded-[10px] border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          </div>
        </div>

        <div className="space-y-3 xl:col-span-4">
          <div className="rounded-[12px] border border-[#E6EAF0] bg-white p-6">
            <p className="text-xl font-semibold tracking-[-0.01em] text-[#1d2433]">Current Selection</p>
            <div className="mt-4 space-y-2">
              <div className="rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b98ad]">Trade</p>
                <p className="mt-1 text-sm font-semibold text-[#1d2433]">{selectedTrade?.label ?? "Not selected"}</p>
              </div>
              <div className="rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b98ad]">Source</p>
                <p className="mt-1 truncate text-sm text-[#4f5f79]">{localSourceFile?.name ?? "No source PDF selected"}</p>
              </div>
              <div className="rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b98ad]">Output File</p>
                <p className="mt-1 truncate text-sm text-[#4f5f79]">{outputFilePreview}</p>
              </div>
            </div>
          </div>

        </div>
      </section>

      <section className="space-y-5">
        <h3 className="text-2xl font-semibold tracking-[-0.02em] text-[#0F172A]">Produced Trade Packs</h3>
        <div className="space-y-2">
          {generatedTradePacks.length === 0 ? (
            <div className="rounded-[10px] border border-[#E6EAF0] bg-[#F8FAFC] px-4 py-3">
              <p className="text-sm text-[#687996]">No generated trade packs yet.</p>
            </div>
          ) : (
            generatedTradePacks.map((drawingSet) => renderDrawingSetRow(drawingSet, true))
          )}
        </div>
      </section>

      <div className="rounded-[12px] border border-[#E6EAF0] bg-[#F8FAFC] px-4 py-3 text-xs text-[#6d7c94]">
        <p className="inline-flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#8b98ad]" />
          Trade Pack Builder filters pages by selected trade and stores only generated outputs for this project.
        </p>
      </div>
    </div>
  );
}
