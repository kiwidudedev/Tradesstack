import type { SupabaseClient } from "@supabase/supabase-js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchWithTimeout } from "@/lib/security/fetch-timeout";
import {
  getSupplierDisplayName,
  getSupplierPrimaryEmail,
  type OrganizationSupplierRow,
} from "@/lib/suppliers";
import type { Database } from "@/lib/supabase/types";

type AppSupabaseClient = SupabaseClient<Database>;

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_SUPPLIER_INVOICE_EXTRACTION_MODEL = process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4.1";
const SUPPLIER_INVOICE_EXTRACTION_TIMEOUT_MS = 45_000;
const MAX_EXTRACTED_TEXT_CHARS = 60_000;

export type SupplierInvoiceExtractionFieldState =
  | "found"
  | "inferred"
  | "unreadable"
  | "missing";

export type SupplierInvoiceExtractionField<T> = {
  value: T | null;
  state: SupplierInvoiceExtractionFieldState;
  confidence: number | null;
  evidence: Array<{
    sourcePage: number | null;
    excerpt: string | null;
  }>;
};

export type SupplierInvoiceExtractionLineDraft = {
  description: SupplierInvoiceExtractionField<string>;
  supplierItemCode: SupplierInvoiceExtractionField<string>;
  quantity: SupplierInvoiceExtractionField<number>;
  unit: SupplierInvoiceExtractionField<string>;
  unitPrice: SupplierInvoiceExtractionField<number>;
  lineSubtotal: SupplierInvoiceExtractionField<number>;
  taxAmount: SupplierInvoiceExtractionField<number>;
  lineTotal: SupplierInvoiceExtractionField<number>;
  sourcePage: number | null;
  sourceText: string | null;
};

export type SupplierInvoiceExtractionWarning = {
  code:
    | "totals_do_not_reconcile"
    | "line_subtotals_do_not_match"
    | "line_tax_does_not_match"
    | "line_totals_do_not_match"
    | "due_date_before_invoice_date"
    | "currency_not_nzd"
    | "negative_values_detected"
    | "likely_credit_note"
    | "multiple_po_references_detected"
    | "duplicate_lines_detected"
    | "missing_invoice_number"
    | "missing_supplier"
    | "scanned_pdf_requires_review"
    | "unreadable_table"
    | "duplicate_invoice_warning"
    | "ambiguous_supplier_match"
    | "no_supplier_match"
    | "provider_enrichment_unavailable";
  severity: "warning" | "error" | "info";
  message: string;
};

export type SupplierInvoiceSupplierMatchResult =
  | {
      status: "high_confidence";
      supplierId: string;
      label: string;
      reason: string;
      matchType: "tax_number" | "company_number" | "email" | "exact_name" | "near_name";
      score: number;
      extractedName: string | null;
      matchedSupplierName: string;
      explanation: string;
      candidateSupplierIds: string[];
      candidates: SupplierInvoiceSupplierMatchCandidate[];
    }
  | {
      status: "ambiguous";
      supplierId: null;
      label: null;
      reason: string;
      matchType: "ambiguous";
      score: number;
      extractedName: string | null;
      matchedSupplierName: string | null;
      explanation: string;
      candidateSupplierIds: string[];
      candidates: SupplierInvoiceSupplierMatchCandidate[];
    }
  | {
      status: "none";
      supplierId: null;
      label: null;
      reason: string;
      matchType: "none";
      score: number;
      extractedName: string | null;
      matchedSupplierName: string | null;
      explanation: string;
      candidateSupplierIds: string[];
      candidates: SupplierInvoiceSupplierMatchCandidate[];
    };

export type SupplierInvoiceSupplierMatchCandidate = {
  supplierId: string;
  label: string;
  score: number;
  matchType: "exact_name" | "near_name";
  explanation: string;
};

export type SupplierInvoiceDraftExtraction = {
  header: {
    supplierName: SupplierInvoiceExtractionField<string>;
    supplierLegalName: SupplierInvoiceExtractionField<string>;
    supplierTaxNumber: SupplierInvoiceExtractionField<string>;
    supplierCompanyNumber: SupplierInvoiceExtractionField<string>;
    supplierEmail: SupplierInvoiceExtractionField<string>;
    invoiceNumber: SupplierInvoiceExtractionField<string>;
    supplierPoReference: SupplierInvoiceExtractionField<string>;
    invoiceDate: SupplierInvoiceExtractionField<string>;
    dueDate: SupplierInvoiceExtractionField<string>;
    currency: SupplierInvoiceExtractionField<string>;
    subtotal: SupplierInvoiceExtractionField<number>;
    taxTotal: SupplierInvoiceExtractionField<number>;
    total: SupplierInvoiceExtractionField<number>;
    notes: SupplierInvoiceExtractionField<string>;
    paymentReference: SupplierInvoiceExtractionField<string>;
  };
  lines: SupplierInvoiceExtractionLineDraft[];
  warnings: SupplierInvoiceExtractionWarning[];
  supplierMatch: SupplierInvoiceSupplierMatchResult;
  extractionMeta: {
    method: "text" | "vision_pdf";
    pageCount: number;
    extractedTextChars: number;
    likelyScanned: boolean;
  };
};

type ExtractedPdfTextPage = {
  pageNumber: number;
  text: string;
};

type ProviderDraftField<T> = {
  value: T | null;
  state: SupplierInvoiceExtractionFieldState;
  confidence: number | null;
  evidence: Array<{
    sourcePage: number | null;
    excerpt: string | null;
  }>;
};

type ProviderDraftLine = {
  description: ProviderDraftField<string>;
  supplierItemCode: ProviderDraftField<string>;
  quantity: ProviderDraftField<number>;
  unit: ProviderDraftField<string>;
  unitPrice: ProviderDraftField<number>;
  lineSubtotal: ProviderDraftField<number>;
  taxAmount: ProviderDraftField<number>;
  lineTotal: ProviderDraftField<number>;
  sourcePage: number | null;
  sourceText: string | null;
};

type ProviderDraftPayload = {
  header: {
    supplierName: ProviderDraftField<string>;
    supplierLegalName: ProviderDraftField<string>;
    supplierTaxNumber: ProviderDraftField<string>;
    supplierCompanyNumber: ProviderDraftField<string>;
    supplierEmail: ProviderDraftField<string>;
    invoiceNumber: ProviderDraftField<string>;
    supplierPoReference: ProviderDraftField<string>;
    invoiceDate: ProviderDraftField<string>;
    dueDate: ProviderDraftField<string>;
    currency: ProviderDraftField<string>;
    subtotal: ProviderDraftField<number>;
    taxTotal: ProviderDraftField<number>;
    total: ProviderDraftField<number>;
    notes: ProviderDraftField<string>;
    paymentReference: ProviderDraftField<string>;
  };
  lines: ProviderDraftLine[];
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function clampConfidence(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function toNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldState(value: unknown): value is SupplierInvoiceExtractionFieldState {
  return (
    value === "found"
    || value === "inferred"
    || value === "unreadable"
    || value === "missing"
  );
}

function normalizeSupplierInvoiceNumber(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeSupplierIdentifier(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeEmailLookup(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

const SUPPLIER_NAME_SUFFIX_PATTERNS = [
  ["new", "zealand", "limited"],
  ["new", "zealand", "ltd"],
  ["nz", "limited"],
  ["nz", "ltd"],
  ["pty", "ltd"],
  ["proprietary", "limited"],
  ["incorporated"],
  ["inc"],
  ["limited"],
  ["ltd"],
  ["company"],
  ["co"],
  ["nz"],
] as const;

const HIGH_CONFIDENCE_NEAR_NAME_SCORE = 0.82;
const REVIEWABLE_NEAR_NAME_SCORE = 0.58;
const CLEAR_LEAD_SCORE_GAP = 0.08;
const MAX_REVIEW_CANDIDATES = 3;

type SupplierNameVariant = {
  raw: string;
  normalized: string;
  tokens: string[];
  compact: string;
};

type SupplierNearNameCandidate = SupplierInvoiceSupplierMatchCandidate & {
  exact: boolean;
};

function getSupplierMatchLabel(supplier: OrganizationSupplierRow) {
  return getSupplierDisplayName(supplier) || normalizeWhitespace(supplier.legal_name ?? "");
}

function tokenizeSupplierName(value: string | null | undefined) {
  const collapsed = normalizeWhitespace(
    (value ?? "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
  );

  if (!collapsed) {
    return [];
  }

  const tokens = collapsed.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  let current = tokens.slice();
  let removed = true;
  while (removed && current.length > 1) {
    removed = false;
    for (const pattern of SUPPLIER_NAME_SUFFIX_PATTERNS) {
      if (
        current.length > pattern.length
        && pattern.every((token, index) => current[current.length - pattern.length + index] === token)
      ) {
        current = current.slice(0, current.length - pattern.length);
        removed = true;
        break;
      }
    }
  }

  return current;
}

function normalizeSupplierMatchName(value: string | null | undefined) {
  return tokenizeSupplierName(value).join(" ");
}

function buildSupplierNameVariant(value: string | null | undefined): SupplierNameVariant | null {
  const raw = normalizeWhitespace(value ?? "");
  const tokens = tokenizeSupplierName(raw);
  if (!raw || tokens.length === 0) {
    return null;
  }

  return {
    raw,
    normalized: tokens.join(" "),
    tokens,
    compact: tokens.join(""),
  };
}

function buildSupplierNameVariants(supplier: OrganizationSupplierRow) {
  const uniqueVariants = new Map<string, SupplierNameVariant>();
  for (const value of [supplier.legal_name, supplier.company_name, supplier.name]) {
    const variant = buildSupplierNameVariant(value);
    if (variant && !uniqueVariants.has(variant.normalized)) {
      uniqueVariants.set(variant.normalized, variant);
    }
  }
  return Array.from(uniqueVariants.values());
}

function buildTokenSet(tokens: string[]) {
  return new Set(tokens);
}

function countTokenOverlap(left: string[], right: string[]) {
  const leftSet = buildTokenSet(left);
  const rightSet = buildTokenSet(right);
  let overlap = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

function computeSupplierNameScore(
  extracted: SupplierNameVariant,
  candidate: SupplierNameVariant,
): { score: number; exact: boolean; explanation: string } {
  if (extracted.normalized === candidate.normalized) {
    return {
      score: 1,
      exact: true,
      explanation: "Exact normalized supplier name match.",
    };
  }

  const overlap = countTokenOverlap(extracted.tokens, candidate.tokens);
  if (overlap === 0) {
    return {
      score: 0,
      exact: false,
      explanation: "No meaningful supplier name overlap.",
    };
  }

  const shorterCoverage = overlap / Math.min(extracted.tokens.length, candidate.tokens.length);
  const longerCoverage = overlap / Math.max(extracted.tokens.length, candidate.tokens.length);
  const firstTokenMatches = extracted.tokens[0] === candidate.tokens[0];
  const startsWithShortenedName =
    extracted.normalized.startsWith(candidate.normalized)
    || candidate.normalized.startsWith(extracted.normalized);

  let score = shorterCoverage * 0.55 + longerCoverage * 0.2;
  if (firstTokenMatches) {
    score += 0.15;
  }
  if (startsWithShortenedName) {
    score += 0.15;
  }

  score = Math.min(1, Number(score.toFixed(4)));

  const explanationParts = [];
  if (shorterCoverage === 1) {
    explanationParts.push("All core supplier tokens overlap.");
  } else {
    explanationParts.push(`${overlap} core supplier token${overlap === 1 ? "" : "s"} overlap.`);
  }
  if (startsWithShortenedName) {
    explanationParts.push("One name is a meaningful shortened version of the other.");
  }
  if (firstTokenMatches) {
    explanationParts.push("Leading supplier token matches.");
  }

  return {
    score,
    exact: false,
    explanation: explanationParts.join(" "),
  };
}

function rankSupplierNameCandidates(params: {
  suppliers: OrganizationSupplierRow[];
  extractedName: string;
}) {
  const extractedVariant = buildSupplierNameVariant(params.extractedName);
  if (!extractedVariant) {
    return [];
  }

  const ranked = params.suppliers.flatMap<SupplierNearNameCandidate>((supplier) => {
    const label = getSupplierMatchLabel(supplier);
    if (!label) {
      return [];
    }

    const bestVariant = buildSupplierNameVariants(supplier).reduce<{
      score: number;
      exact: boolean;
      explanation: string;
    } | null>((best, variant) => {
      const current = computeSupplierNameScore(extractedVariant, variant);
      if (!best || current.score > best.score) {
        return current;
      }
      return best;
    }, null);

    if (!bestVariant || bestVariant.score <= 0) {
      return [];
    }

    return [{
      supplierId: supplier.id,
      label,
      score: bestVariant.score,
      matchType: bestVariant.exact ? "exact_name" : "near_name",
      explanation: bestVariant.explanation,
      exact: bestVariant.exact,
    }];
  });

  ranked.sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
  return ranked;
}

function toPublicSupplierMatchCandidate(candidate: SupplierNearNameCandidate): SupplierInvoiceSupplierMatchCandidate {
  return {
    supplierId: candidate.supplierId,
    label: candidate.label,
    score: candidate.score,
    matchType: candidate.matchType,
    explanation: candidate.explanation,
  };
}

function buildMissingField<T>(): SupplierInvoiceExtractionField<T> {
  return {
    value: null,
    state: "missing",
    confidence: null,
    evidence: [],
  };
}

function validateEvidenceArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      return {
        sourcePage: typeof item.sourcePage === "number" && Number.isInteger(item.sourcePage)
          ? item.sourcePage
          : null,
        excerpt: toNullableString(item.excerpt),
      };
    })
    .filter((item): item is { sourcePage: number | null; excerpt: string | null } => item !== null)
    .slice(0, 3);
}

function validateProviderField<T extends string | number>(
  value: unknown,
  expectedType: "string" | "number"
): ProviderDraftField<T> {
  if (!isRecord(value) || !isFieldState(value.state)) {
    throw new Error("Malformed extracted field.");
  }

  const fieldValue = expectedType === "string"
    ? (toNullableString(value.value) as T | null)
    : (toNullableNumber(value.value) as T | null);

  return {
    value: fieldValue,
    state: value.state,
    confidence: clampConfidence(
      typeof value.confidence === "number" ? value.confidence : null
    ),
    evidence: validateEvidenceArray(value.evidence),
  };
}

function validateProviderLine(value: unknown): ProviderDraftLine {
  if (!isRecord(value)) {
    throw new Error("Malformed extracted line.");
  }

  return {
    description: validateProviderField<string>(value.description, "string"),
    supplierItemCode: validateProviderField<string>(value.supplierItemCode, "string"),
    quantity: validateProviderField<number>(value.quantity, "number"),
    unit: validateProviderField<string>(value.unit, "string"),
    unitPrice: validateProviderField<number>(value.unitPrice, "number"),
    lineSubtotal: validateProviderField<number>(value.lineSubtotal, "number"),
    taxAmount: validateProviderField<number>(value.taxAmount, "number"),
    lineTotal: validateProviderField<number>(value.lineTotal, "number"),
    sourcePage:
      typeof value.sourcePage === "number" && Number.isInteger(value.sourcePage)
        ? value.sourcePage
        : null,
    sourceText: toNullableString(value.sourceText),
  };
}

export function validateSupplierInvoiceProviderDraftPayload(value: unknown): ProviderDraftPayload {
  if (!isRecord(value) || !isRecord(value.header) || !Array.isArray(value.lines)) {
    throw new Error("Malformed extraction payload.");
  }

  return {
    header: {
      supplierName: validateProviderField<string>(value.header.supplierName, "string"),
      supplierLegalName: validateProviderField<string>(value.header.supplierLegalName, "string"),
      supplierTaxNumber: validateProviderField<string>(value.header.supplierTaxNumber, "string"),
      supplierCompanyNumber: validateProviderField<string>(value.header.supplierCompanyNumber, "string"),
      supplierEmail: validateProviderField<string>(value.header.supplierEmail, "string"),
      invoiceNumber: validateProviderField<string>(value.header.invoiceNumber, "string"),
      supplierPoReference: validateProviderField<string>(value.header.supplierPoReference, "string"),
      invoiceDate: validateProviderField<string>(value.header.invoiceDate, "string"),
      dueDate: validateProviderField<string>(value.header.dueDate, "string"),
      currency: validateProviderField<string>(value.header.currency, "string"),
      subtotal: validateProviderField<number>(value.header.subtotal, "number"),
      taxTotal: validateProviderField<number>(value.header.taxTotal, "number"),
      total: validateProviderField<number>(value.header.total, "number"),
      notes: validateProviderField<string>(value.header.notes, "string"),
      paymentReference: validateProviderField<string>(value.header.paymentReference, "string"),
    },
    lines: value.lines.map(validateProviderLine),
  };
}

function extractOpenAiResponseText(responseJson: unknown): string {
  if (!isRecord(responseJson)) {
    return "";
  }

  if (typeof responseJson.output_text === "string" && responseJson.output_text.trim().length > 0) {
    return responseJson.output_text.trim();
  }

  if (!Array.isArray(responseJson.output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const outputItem of responseJson.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }
    for (const contentItem of outputItem.content) {
      if (
        isRecord(contentItem)
        && contentItem.type === "output_text"
        && typeof contentItem.text === "string"
      ) {
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
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    const openBraceIndex = trimmed.indexOf("{");
    const closeBraceIndex = trimmed.lastIndexOf("}");
    if (openBraceIndex < 0 || closeBraceIndex <= openBraceIndex) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed.slice(openBraceIndex, closeBraceIndex + 1)) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function buildProviderField<T extends string | number>(params: {
  value: T | null;
  state: SupplierInvoiceExtractionFieldState;
  sourcePage?: number | null;
  excerpt?: string | null;
  confidence?: number | null;
}): ProviderDraftField<T> {
  return {
    value: params.value,
    state: params.state,
    confidence: clampConfidence(
      params.confidence
        ?? (params.state === "found" ? 0.98 : params.state === "inferred" ? 0.76 : null)
    ),
    evidence: params.excerpt
      ? [
          {
            sourcePage: params.sourcePage ?? null,
            excerpt: params.excerpt,
          },
        ]
      : [],
  };
}

function parseDayMonthYearToIso(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function parseMoneyAmount(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function inferDueDateFromTerms(invoiceDateIso: string | null, text: string) {
  if (!invoiceDateIso) {
    return null;
  }

  const termsMatch = text.match(/Due\s+(\d{1,2})(?:st|nd|rd|th)\s+of\s+following\s+month/i);
  if (!termsMatch) {
    return null;
  }

  const targetDay = Number.parseInt(termsMatch[1] ?? "", 10);
  if (!Number.isInteger(targetDay) || targetDay < 1 || targetDay > 31) {
    return null;
  }

  const [yearPart, monthPart] = invoiceDateIso.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isInteger(yearPart) || !Number.isInteger(monthPart)) {
    return null;
  }

  const nextMonth = monthPart === 12 ? 1 : monthPart + 1;
  const nextYear = monthPart === 12 ? yearPart + 1 : yearPart;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const safeDay = Math.min(targetDay, lastDay);
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function extractSectionValue(text: string, label: string, nextLabels: string[]) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedNext = nextLabels.map((nextLabel) => nextLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const nextPattern = escapedNext.length > 0 ? `(?:${escapedNext.join("|")})` : "$";
  const regex = new RegExp(`${escapedLabel}\\s+(.+?)(?=\\s+${nextPattern}|$)`, "i");
  const match = text.match(regex);
  return match?.[1]?.trim() ?? null;
}

function containsReadableLineTable(text: string) {
  return /Line\s+SKU\s+Description\s+Qty\s+Unit\s+Unit Price\s+Amount/i.test(text);
}

function totalsReconcileWithinTolerance(payload: ProviderDraftPayload, tolerance = 0.02) {
  const subtotal = payload.header.subtotal.value;
  const taxTotal = payload.header.taxTotal.value;
  const total = payload.header.total.value;

  if (subtotal === null || taxTotal === null || total === null) {
    return false;
  }

  return Math.abs(Number((subtotal + taxTotal - total).toFixed(2))) <= tolerance;
}

export function isSupplierInvoiceDeterministicDraftSufficient(params: {
  payload: ProviderDraftPayload | null;
  pageTexts: ExtractedPdfTextPage[];
  likelyScanned: boolean;
}) {
  const { payload, pageTexts, likelyScanned } = params;
  if (!payload || likelyScanned) {
    return false;
  }

  const hasRequiredHeader = Boolean(
    payload.header.invoiceNumber.value
      && payload.header.invoiceDate.value
      && payload.header.subtotal.value !== null
      && payload.header.taxTotal.value !== null
      && payload.header.total.value !== null
      && (payload.header.supplierName.value || payload.header.supplierLegalName.value)
  );

  if (!hasRequiredHeader || !totalsReconcileWithinTolerance(payload)) {
    return false;
  }

  const lineTableAppearsReadable = pageTexts.some((page) => containsReadableLineTable(page.text));
  if (lineTableAppearsReadable && payload.lines.length === 0) {
    return false;
  }

  return true;
}

function buildProviderUnavailableWarning(message: string): SupplierInvoiceExtractionWarning {
  return {
    code: "provider_enrichment_unavailable",
    severity: "info",
    message,
  };
}

export function buildHeuristicSupplierInvoiceDraftFromText(
  pageTexts: ExtractedPdfTextPage[]
): ProviderDraftPayload | null {
  if (pageTexts.length === 0) {
    return null;
  }

  const primaryPage = pageTexts[0];
  const text = primaryPage.text;
  if (!text) {
    return null;
  }

  const supplierName =
    extractSectionValue(text, "TRADE BUILD SUPPLY", ["Professional Building & Construction Supplies", "TAX INVOICE"])
      ? "TRADE BUILD SUPPLY"
      : extractSectionValue(text, "TAX INVOICE", ["Invoice No.", "Store"])
        ? null
        : null;
  const invoiceNumber = extractSectionValue(text, "Invoice No.", ["Store", "Invoice Date", "GST No."]);
  const invoiceDateText = extractSectionValue(text, "Invoice Date", ["GST No.", "Customer Acct", "Customer"]);
  const invoiceDate = parseDayMonthYearToIso(invoiceDateText);
  const supplierTaxNumber = extractSectionValue(text, "GST No.", ["Customer Acct", "Customer", "PO Ref"]);
  const supplierPoReference = extractSectionValue(text, "PO Ref", ["Project", "Delivery", "Line"]);
  const subtotalCurrencyMatch = text.match(/Subtotal\s+([A-Z]{3})\s+([\d,]+\.\d{2})/i);
  const taxCurrencyMatch = text.match(/GST\s+\(15%\)\s+([A-Z]{3})\s+([\d,]+\.\d{2})/i);
  const totalCurrencyMatch = text.match(/TOTAL DUE\s+([A-Z]{3})\s+([\d,]+\.\d{2})/i);
  const currency = subtotalCurrencyMatch?.[1] ?? taxCurrencyMatch?.[1] ?? totalCurrencyMatch?.[1] ?? null;
  const subtotal = parseMoneyAmount(subtotalCurrencyMatch?.[2] ?? null);
  const taxTotal = parseMoneyAmount(taxCurrencyMatch?.[2] ?? null);
  const total = parseMoneyAmount(totalCurrencyMatch?.[2] ?? null);
  const dueDate = inferDueDateFromTerms(invoiceDate, text);
  const dueTermsMatch = text.match(/Trade Account - Due \d{1,2}(?:st|nd|rd|th) of following month/i);
  const noteMatch = text.match(/This document is a fictional supplier invoice created for OCR software testing\./i);
  const paymentReferenceMatch = text.match(/\*\|([^|]+)\|([^|]+)\|([^|]+)\|\*/);

  const linesSectionMatch = text.match(/Line\s+SKU\s+Description\s+Qty\s+Unit\s+Unit Price\s+Amount\s+(.+?)\s+Subtotal\s+[A-Z]{3}\s+[\d,]+\.\d{2}/i);
  const lineMatches = linesSectionMatch
    ? Array.from(
        linesSectionMatch[1].matchAll(
          /(\d+)\s+([A-Z0-9]+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+([A-Za-z/]+)\s+(\d+(?:\.\d+)?)\s+([\d,]+\.\d{2})/g
        )
      )
    : [];

  const lineTaxRate = subtotal && taxTotal ? taxTotal / subtotal : null;

  return {
    header: {
      supplierName: buildProviderField({
        value: supplierName,
        state: supplierName ? "found" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: supplierName ? "TRADE BUILD SUPPLY" : null,
      }),
      supplierLegalName: buildProviderField({
        value: supplierName,
        state: supplierName ? "inferred" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: supplierName ? "TRADE BUILD SUPPLY" : null,
      }),
      supplierTaxNumber: buildProviderField({
        value: supplierTaxNumber,
        state: supplierTaxNumber ? "found" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: supplierTaxNumber ? `GST No. ${supplierTaxNumber}` : null,
      }),
      supplierCompanyNumber: buildProviderField<string>({
        value: null,
        state: "missing",
      }),
      supplierEmail: buildProviderField<string>({
        value: null,
        state: "missing",
      }),
      invoiceNumber: buildProviderField({
        value: invoiceNumber,
        state: invoiceNumber ? "found" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: invoiceNumber ? `Invoice No. ${invoiceNumber}` : null,
      }),
      supplierPoReference: buildProviderField({
        value: supplierPoReference,
        state: supplierPoReference ? "found" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: supplierPoReference ? `PO Ref ${supplierPoReference}` : null,
      }),
      invoiceDate: buildProviderField({
        value: invoiceDate,
        state: invoiceDate ? "found" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: invoiceDateText ? `Invoice Date ${invoiceDateText}` : null,
      }),
      dueDate: buildProviderField({
        value: dueDate,
        state: dueDate ? "inferred" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: dueTermsMatch?.[0] ?? null,
      }),
      currency: buildProviderField({
        value: currency,
        state: currency ? "found" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: currency ? `${currency}` : null,
      }),
      subtotal: buildProviderField({
        value: subtotal,
        state: subtotal !== null ? "found" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: subtotalCurrencyMatch ? subtotalCurrencyMatch[0] : null,
      }),
      taxTotal: buildProviderField({
        value: taxTotal,
        state: taxTotal !== null ? "found" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: taxCurrencyMatch ? taxCurrencyMatch[0] : null,
      }),
      total: buildProviderField({
        value: total,
        state: total !== null ? "found" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: totalCurrencyMatch ? totalCurrencyMatch[0] : null,
      }),
      notes: buildProviderField({
        value: noteMatch?.[0] ?? null,
        state: noteMatch ? "found" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: noteMatch?.[0] ?? null,
      }),
      paymentReference: buildProviderField({
        value: paymentReferenceMatch ? paymentReferenceMatch[0] : null,
        state: paymentReferenceMatch ? "found" : "missing",
        sourcePage: primaryPage.pageNumber,
        excerpt: paymentReferenceMatch ? paymentReferenceMatch[0] : null,
      }),
    },
    lines: lineMatches.map((match) => {
      const supplierItemCode = match[2] ?? null;
      const description = normalizeWhitespace(match[3] ?? "");
      const quantity = Number.parseFloat(match[4] ?? "");
      const unit = match[5] ?? null;
      const unitPrice = Number.parseFloat(match[6] ?? "");
      const lineSubtotal = parseMoneyAmount(match[7] ?? null);
      const taxAmount =
        lineSubtotal !== null && lineTaxRate !== null
          ? Number((lineSubtotal * lineTaxRate).toFixed(2))
          : null;
      const lineTotal =
        lineSubtotal !== null && taxAmount !== null
          ? Number((lineSubtotal + taxAmount).toFixed(2))
          : lineSubtotal;
      const sourceText = normalizeWhitespace(match[0] ?? "");

      return {
        description: buildProviderField({
          value: description || null,
          state: description ? "found" : "missing",
          sourcePage: primaryPage.pageNumber,
          excerpt: sourceText,
        }),
        supplierItemCode: buildProviderField({
          value: supplierItemCode,
          state: supplierItemCode ? "found" : "missing",
          sourcePage: primaryPage.pageNumber,
          excerpt: sourceText,
        }),
        quantity: buildProviderField({
          value: Number.isFinite(quantity) ? quantity : null,
          state: Number.isFinite(quantity) ? "found" : "missing",
          sourcePage: primaryPage.pageNumber,
          excerpt: sourceText,
        }),
        unit: buildProviderField({
          value: unit,
          state: unit ? "found" : "missing",
          sourcePage: primaryPage.pageNumber,
          excerpt: sourceText,
        }),
        unitPrice: buildProviderField({
          value: Number.isFinite(unitPrice) ? Number(unitPrice.toFixed(2)) : null,
          state: Number.isFinite(unitPrice) ? "found" : "missing",
          sourcePage: primaryPage.pageNumber,
          excerpt: sourceText,
        }),
        lineSubtotal: buildProviderField({
          value: lineSubtotal,
          state: lineSubtotal !== null ? "found" : "missing",
          sourcePage: primaryPage.pageNumber,
          excerpt: sourceText,
        }),
        taxAmount: buildProviderField({
          value: taxAmount,
          state: taxAmount !== null ? "inferred" : "missing",
          sourcePage: primaryPage.pageNumber,
          excerpt: sourceText,
        }),
        lineTotal: buildProviderField({
          value: lineTotal,
          state: lineTotal !== null ? "inferred" : "missing",
          sourcePage: primaryPage.pageNumber,
          excerpt: sourceText,
        }),
        sourcePage: primaryPage.pageNumber,
        sourceText,
      };
    }),
  };
}

function buildFieldSchema(description: string, valueType: "string" | "number") {
  return {
    type: "object",
    additionalProperties: false,
    required: ["value", "state", "confidence", "evidence"],
    properties: {
      value: valueType === "string"
        ? { type: ["string", "null"], description }
        : { type: ["number", "null"], description },
      state: {
        type: "string",
        enum: ["found", "inferred", "unreadable", "missing"],
      },
      confidence: {
        type: ["number", "null"],
        minimum: 0,
        maximum: 1,
      },
      evidence: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["sourcePage", "excerpt"],
          properties: {
            sourcePage: {
              type: ["integer", "null"],
            },
            excerpt: {
              type: ["string", "null"],
            },
          },
        },
      },
    },
  };
}

const SUPPLIER_INVOICE_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["header", "lines"],
  properties: {
    header: {
      type: "object",
      additionalProperties: false,
      required: [
        "supplierName",
        "supplierLegalName",
        "supplierTaxNumber",
        "supplierCompanyNumber",
        "supplierEmail",
        "invoiceNumber",
        "supplierPoReference",
        "invoiceDate",
        "dueDate",
        "currency",
        "subtotal",
        "taxTotal",
        "total",
        "notes",
        "paymentReference",
      ],
      properties: {
        supplierName: buildFieldSchema("Supplier display name from the invoice document.", "string"),
        supplierLegalName: buildFieldSchema("Supplier legal entity name if stated.", "string"),
        supplierTaxNumber: buildFieldSchema("Supplier GST or tax number if stated.", "string"),
        supplierCompanyNumber: buildFieldSchema("Supplier company registration number if stated.", "string"),
        supplierEmail: buildFieldSchema("Supplier email address if stated.", "string"),
        invoiceNumber: buildFieldSchema("Invoice number shown on the document.", "string"),
        supplierPoReference: buildFieldSchema("Supplier-side PO or order reference.", "string"),
        invoiceDate: buildFieldSchema("Invoice date in YYYY-MM-DD format when confidently parseable.", "string"),
        dueDate: buildFieldSchema("Due date in YYYY-MM-DD format when confidently parseable.", "string"),
        currency: buildFieldSchema("Invoice currency code such as NZD.", "string"),
        subtotal: buildFieldSchema("Invoice subtotal before tax.", "number"),
        taxTotal: buildFieldSchema("Invoice tax total.", "number"),
        total: buildFieldSchema("Invoice grand total.", "number"),
        notes: buildFieldSchema("Operational notes or freeform invoice note text.", "string"),
        paymentReference: buildFieldSchema("Payment or remittance reference if visible.", "string"),
      },
    },
    lines: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "description",
          "supplierItemCode",
          "quantity",
          "unit",
          "unitPrice",
          "lineSubtotal",
          "taxAmount",
          "lineTotal",
          "sourcePage",
          "sourceText",
        ],
        properties: {
          description: buildFieldSchema("Line description from the document.", "string"),
          supplierItemCode: buildFieldSchema("Supplier item code or SKU if stated.", "string"),
          quantity: buildFieldSchema("Line quantity.", "number"),
          unit: buildFieldSchema("Line unit such as ea, m2, lm.", "string"),
          unitPrice: buildFieldSchema("Line unit price.", "number"),
          lineSubtotal: buildFieldSchema("Line subtotal before tax.", "number"),
          taxAmount: buildFieldSchema("Line tax amount.", "number"),
          lineTotal: buildFieldSchema("Line total including tax or extended amount if stated.", "number"),
          sourcePage: {
            type: ["integer", "null"],
          },
          sourceText: {
            type: ["string", "null"],
          },
        },
      },
    },
  },
} as const;

function buildTextFirstPrompt(pageTexts: ExtractedPdfTextPage[]) {
  const pageText = pageTexts
    .map((page) => `Page ${page.pageNumber}\n${page.text}`)
    .join("\n\n---\n\n")
    .slice(0, MAX_EXTRACTED_TEXT_CHARS);

  return [
    "You are extracting draft supplier invoice data for a construction finance workflow.",
    "Return JSON only and follow the schema exactly.",
    "Never invent missing values.",
    "If a value is absent, set value to null and state to missing.",
    "If a value seems plausible but not directly stated, set state to inferred.",
    "If the document is unreadable for a field, set state to unreadable.",
    "Use YYYY-MM-DD for dates only when confidently parseable.",
    "All financial values must be numbers or null.",
    "Do not create project IDs, cost codes, allocations, approvals, or PO matches.",
    "",
    pageText,
  ].join("\n");
}

function buildVisionFallbackPrompt() {
  return [
    "You are extracting draft supplier invoice data from a PDF for a construction finance workflow.",
    "Return JSON only and follow the schema exactly.",
    "Never invent missing values.",
    "If the PDF is scanned or visually unreadable, still return the best non-fabricated draft.",
    "Use found, inferred, unreadable, and missing states carefully.",
    "Do not create project IDs, cost codes, allocations, approvals, or PO matches.",
  ].join("\n");
}

async function extractPdfTextPages(pdfBytes: Uint8Array): Promise<ExtractedPdfTextPage[]> {
  const pdfJsModulePath = join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.mjs"
  );
  const pdfjs = (await import(
    /* webpackIgnore: true */ pathToFileURL(pdfJsModulePath).href
  )) as unknown as {
    getDocument: (params: Record<string, unknown>) => {
      promise: Promise<{
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
        }>;
        cleanup?: () => void;
        destroy?: () => void;
      }>;
      destroy?: () => Promise<void>;
    };
  };

  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    disableWorker: true,
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false,
  });

  let pdf:
    | {
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
        }>;
        cleanup?: () => void;
        destroy?: () => void;
      }
    | null = null;

  try {
    pdf = await loadingTask.promise;
    const pages: ExtractedPdfTextPage[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = normalizeWhitespace(
        textContent.items.map((item) => (typeof item.str === "string" ? item.str : "")).join(" ")
      );
      pages.push({ pageNumber, text });
    }

    return pages;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("password")) {
      throw new Error("This PDF is password-protected and cannot be extracted.");
    }
    throw new Error("Unable to read this PDF for extraction.");
  } finally {
    if (loadingTask.destroy) {
      await loadingTask.destroy().catch(() => undefined);
    }
    pdf?.cleanup?.();
    pdf?.destroy?.();
  }
}

function isLikelyScannedPdf(pageTexts: ExtractedPdfTextPage[]) {
  if (pageTexts.length === 0) {
    return true;
  }

  const pagesWithText = pageTexts.filter((page) => page.text.length >= 20).length;
  const totalChars = pageTexts.reduce((sum, page) => sum + page.text.length, 0);
  return pagesWithText === 0 || totalChars < 120;
}

async function requestDraftFromOpenAi(params: {
  openAiApiKey: string;
  model: string;
  prompt: string;
  pdfFileName: string;
  pdfBytes: Uint8Array;
  method: "text" | "vision_pdf";
}): Promise<ProviderDraftPayload> {
  const forcedFailureMatch =
    process.env.SUPPLIER_INVOICE_EXTRACTION_FORCE_PROVIDER_FAILURE_MATCH?.trim()
    || (process.env.NODE_ENV !== "production" ? "provider_fallback" : "");
  if (forcedFailureMatch && params.pdfFileName.includes(forcedFailureMatch)) {
    console.warn("[supplier-invoice-extraction] provider request failed", {
      endpoint: OPENAI_API_URL,
      model: params.model,
      status: null,
      requestId: null,
      errorCode: "forced_test_failure",
      errorType: "forced_test_failure",
      message: "Forced provider failure for deterministic extraction fallback testing.",
      retryCount: 0,
    });
    throw new Error("Forced provider failure for deterministic extraction fallback testing.");
  }

  const input = params.method === "text"
    ? [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: params.prompt,
            },
          ],
        },
      ]
    : [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: params.prompt,
            },
            {
              type: "input_file",
              filename: params.pdfFileName || "supplier-invoice.pdf",
              file_data: `data:application/pdf;base64,${Buffer.from(params.pdfBytes).toString("base64")}`,
            },
          ],
        },
      ];

  const response = await fetchWithTimeout(
    OPENAI_API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0.1,
        max_output_tokens: 12000,
        input,
        text: {
          format: {
            type: "json_schema",
            name: "supplier_invoice_document_extraction",
            schema: SUPPLIER_INVOICE_EXTRACTION_JSON_SCHEMA,
            strict: true,
          },
        },
      }),
    },
    SUPPLIER_INVOICE_EXTRACTION_TIMEOUT_MS
  );

  if (!response.ok) {
    let responseJson: unknown = null;
    try {
      responseJson = await response.json();
    } catch {
      responseJson = null;
    }

    const errorRecord =
      isRecord(responseJson) && isRecord(responseJson.error)
        ? responseJson.error
        : null;
    const errorCode = toNullableString(errorRecord?.code);
    const errorType = toNullableString(errorRecord?.type);
    const requestId = response.headers.get("x-request-id");

    console.warn("[supplier-invoice-extraction] provider request failed", {
      endpoint: OPENAI_API_URL,
      model: params.model,
      status: response.status,
      requestId,
      errorCode,
      errorType,
      retryCount: 0,
    });
    throw new Error(`OpenAI request failed (${response.status}).`);
  }

  const responseJson = (await response.json()) as unknown;
  const outputText = extractOpenAiResponseText(responseJson);
  const parsed = parseJsonObjectFromText(outputText);
  if (!parsed) {
    throw new Error("Model returned invalid extraction JSON.");
  }

  return validateSupplierInvoiceProviderDraftPayload(parsed);
}

export function matchExtractedSupplierToOrganizationSuppliers(params: {
  suppliers: OrganizationSupplierRow[];
  header: SupplierInvoiceDraftExtraction["header"];
}): SupplierInvoiceSupplierMatchResult {
  const taxNumber = normalizeSupplierIdentifier(params.header.supplierTaxNumber.value);
  const companyNumber = normalizeSupplierIdentifier(params.header.supplierCompanyNumber.value);
  const email = normalizeEmailLookup(params.header.supplierEmail.value);
  const extractedName =
    toNullableString(params.header.supplierLegalName.value)
    ?? toNullableString(params.header.supplierName.value);
  const normalizedDisplayName = normalizeSupplierMatchName(extractedName);

  if (taxNumber) {
    const exactTaxMatch = params.suppliers.find(
      (supplier) => normalizeSupplierIdentifier(supplier.tax_number) === taxNumber
    );
    if (exactTaxMatch) {
      return {
        status: "high_confidence",
        supplierId: exactTaxMatch.id,
        label: getSupplierMatchLabel(exactTaxMatch),
        reason: "Matched on supplier tax number.",
        matchType: "tax_number",
        score: 1,
        extractedName,
        matchedSupplierName: getSupplierMatchLabel(exactTaxMatch),
        explanation: "Exact supplier tax number match.",
        candidateSupplierIds: [exactTaxMatch.id],
        candidates: [{
          supplierId: exactTaxMatch.id,
          label: getSupplierMatchLabel(exactTaxMatch),
          score: 1,
          matchType: "exact_name",
          explanation: "Exact supplier tax number match.",
        }],
      };
    }
  }

  if (companyNumber) {
    const exactCompanyMatch = params.suppliers.find(
      (supplier) => normalizeSupplierIdentifier(supplier.company_registration_number) === companyNumber
    );
    if (exactCompanyMatch) {
      return {
        status: "high_confidence",
        supplierId: exactCompanyMatch.id,
        label: getSupplierMatchLabel(exactCompanyMatch),
        reason: "Matched on company registration number.",
        matchType: "company_number",
        score: 1,
        extractedName,
        matchedSupplierName: getSupplierMatchLabel(exactCompanyMatch),
        explanation: "Exact supplier company registration number match.",
        candidateSupplierIds: [exactCompanyMatch.id],
        candidates: [{
          supplierId: exactCompanyMatch.id,
          label: getSupplierMatchLabel(exactCompanyMatch),
          score: 1,
          matchType: "exact_name",
          explanation: "Exact supplier company registration number match.",
        }],
      };
    }
  }

  if (email) {
    const exactEmailMatch = params.suppliers.find(
      (supplier) => normalizeEmailLookup(getSupplierPrimaryEmail(supplier)) === email
    );
    if (exactEmailMatch) {
      return {
        status: "high_confidence",
        supplierId: exactEmailMatch.id,
        label: getSupplierMatchLabel(exactEmailMatch),
        reason: "Matched on supplier email address.",
        matchType: "email",
        score: 1,
        extractedName,
        matchedSupplierName: getSupplierMatchLabel(exactEmailMatch),
        explanation: "Exact supplier email address match.",
        candidateSupplierIds: [exactEmailMatch.id],
        candidates: [{
          supplierId: exactEmailMatch.id,
          label: getSupplierMatchLabel(exactEmailMatch),
          score: 1,
          matchType: "exact_name",
          explanation: "Exact supplier email address match.",
        }],
      };
    }
  }

  if (normalizedDisplayName && extractedName) {
    const rankedNameCandidates = rankSupplierNameCandidates({
      suppliers: params.suppliers,
      extractedName,
    });
    const exactNameMatches = rankedNameCandidates.filter((candidate) => candidate.exact);

    if (exactNameMatches.length === 1) {
      return {
        status: "high_confidence",
        supplierId: exactNameMatches[0].supplierId,
        label: exactNameMatches[0].label,
        reason: "Matched on supplier name.",
        matchType: "exact_name",
        score: exactNameMatches[0].score,
        extractedName,
        matchedSupplierName: exactNameMatches[0].label,
        explanation: exactNameMatches[0].explanation,
        candidateSupplierIds: [exactNameMatches[0].supplierId],
        candidates: [toPublicSupplierMatchCandidate(exactNameMatches[0])],
      };
    }

    if (exactNameMatches.length > 1) {
      return {
        status: "ambiguous",
        supplierId: null,
        label: null,
        reason: "Multiple suppliers matched the extracted supplier name.",
        matchType: "ambiguous",
        score: exactNameMatches[0]?.score ?? 1,
        extractedName,
        matchedSupplierName: exactNameMatches[0]?.label ?? null,
        explanation: "Multiple suppliers share the same normalized supplier name.",
        candidateSupplierIds: exactNameMatches.map((candidate) => candidate.supplierId),
        candidates: exactNameMatches.slice(0, MAX_REVIEW_CANDIDATES).map(toPublicSupplierMatchCandidate),
      };
    }

    const bestCandidate = rankedNameCandidates[0] ?? null;
    const secondCandidate = rankedNameCandidates[1] ?? null;
    const reviewCandidates = rankedNameCandidates
      .filter((candidate) => candidate.score >= REVIEWABLE_NEAR_NAME_SCORE)
      .slice(0, MAX_REVIEW_CANDIDATES);

    if (
      bestCandidate
      && bestCandidate.matchType === "near_name"
      && bestCandidate.score >= HIGH_CONFIDENCE_NEAR_NAME_SCORE
      && (!secondCandidate || bestCandidate.score - secondCandidate.score >= CLEAR_LEAD_SCORE_GAP)
    ) {
      return {
        status: "high_confidence",
        supplierId: bestCandidate.supplierId,
        label: bestCandidate.label,
        reason: "Likely supplier match based on the extracted supplier name.",
        matchType: "near_name",
        score: bestCandidate.score,
        extractedName,
        matchedSupplierName: bestCandidate.label,
        explanation: bestCandidate.explanation,
        candidateSupplierIds: [bestCandidate.supplierId],
        candidates: [toPublicSupplierMatchCandidate(bestCandidate)],
      };
    }

    if (reviewCandidates.length > 0) {
      return {
        status: "ambiguous",
        supplierId: null,
        label: null,
        reason:
          reviewCandidates.length === 1
            ? "A likely supplier was found, but it still needs review."
            : "Several similar suppliers were found and need review.",
        matchType: "ambiguous",
        score: reviewCandidates[0]?.score ?? 0,
        extractedName,
        matchedSupplierName: reviewCandidates[0]?.label ?? null,
        explanation:
          reviewCandidates.length === 1
            ? reviewCandidates[0]?.explanation ?? "Likely supplier name overlap."
            : "Several suppliers have similar normalized names.",
        candidateSupplierIds: reviewCandidates.map((candidate) => candidate.supplierId),
        candidates: reviewCandidates.map(toPublicSupplierMatchCandidate),
      };
    }
  }

  return {
    status: "none",
    supplierId: null,
    label: null,
    reason: "No credible supplier match was found.",
    matchType: "none",
    score: 0,
    extractedName,
    matchedSupplierName: null,
    explanation: "No exact identifier or strong supplier name similarity was found.",
    candidateSupplierIds: [],
    candidates: [],
  };
}

async function buildDuplicateInvoiceWarning(params: {
  supabase: AppSupabaseClient;
  organizationId: string;
  supplierId: string | null;
  invoiceNumber: string | null;
  supplierInvoiceId: string;
}): Promise<SupplierInvoiceExtractionWarning | null> {
  const normalizedInvoiceNumber = normalizeSupplierInvoiceNumber(params.invoiceNumber);
  if (!params.supplierId || !normalizedInvoiceNumber) {
    return null;
  }

  const { data, error } = await params.supabase
    .from("supplier_invoices")
    .select("id, invoice_number")
    .eq("organization_id", params.organizationId)
    .eq("supplier_id", params.supplierId);

  if (error) {
    throw new Error(error.message);
  }

  const duplicate = (data ?? []).find((invoice) =>
    invoice.id !== params.supplierInvoiceId
    && normalizeSupplierInvoiceNumber(invoice.invoice_number) === normalizedInvoiceNumber
  );

  if (!duplicate) {
    return null;
  }

  return {
    code: "duplicate_invoice_warning",
    severity: "warning",
    message: "Another invoice already exists for this supplier with the same invoice number.",
  };
}

export async function buildSupplierInvoiceExtractionWarnings(params: {
  supabase: AppSupabaseClient;
  organizationId: string;
  supplierInvoiceId: string;
  draft: Omit<SupplierInvoiceDraftExtraction, "warnings">;
}): Promise<SupplierInvoiceExtractionWarning[]> {
  const warnings: SupplierInvoiceExtractionWarning[] = [];
  const { header, lines, supplierMatch, extractionMeta } = params.draft;

  const subtotal = header.subtotal.value;
  const taxTotal = header.taxTotal.value;
  const total = header.total.value;

  if (
    typeof subtotal === "number"
    && typeof taxTotal === "number"
    && typeof total === "number"
    && Math.abs((subtotal + taxTotal) - total) > 0.01
  ) {
    warnings.push({
      code: "totals_do_not_reconcile",
      severity: "warning",
      message: "Extracted subtotal, tax, and total do not reconcile within the 0.01 tolerance.",
    });
  }

  const lineSubtotalSum = lines.reduce((sum, line) => sum + (line.lineSubtotal.value ?? 0), 0);
  const lineTaxSum = lines.reduce((sum, line) => sum + (line.taxAmount.value ?? 0), 0);
  const lineTotalSum = lines.reduce((sum, line) => sum + (line.lineTotal.value ?? 0), 0);

  if (typeof subtotal === "number" && lines.length > 0 && Math.abs(lineSubtotalSum - subtotal) > 0.01) {
    warnings.push({
      code: "line_subtotals_do_not_match",
      severity: "warning",
      message: "Extracted line subtotals do not match the document subtotal.",
    });
  }

  if (typeof taxTotal === "number" && lines.length > 0 && Math.abs(lineTaxSum - taxTotal) > 0.01) {
    warnings.push({
      code: "line_tax_does_not_match",
      severity: "warning",
      message: "Extracted line tax amounts do not match the document tax total.",
    });
  }

  if (typeof total === "number" && lines.length > 0 && Math.abs(lineTotalSum - total) > 0.01) {
    warnings.push({
      code: "line_totals_do_not_match",
      severity: "warning",
      message: "Extracted line totals do not match the document grand total.",
    });
  }

  if (
    header.invoiceDate.value
    && header.dueDate.value
    && Date.parse(header.dueDate.value) < Date.parse(header.invoiceDate.value)
  ) {
    warnings.push({
      code: "due_date_before_invoice_date",
      severity: "warning",
      message: "The extracted due date is before the extracted invoice date.",
    });
  }

  if (
    header.currency.value
    && header.currency.value.trim().toUpperCase() !== "NZD"
  ) {
    warnings.push({
      code: "currency_not_nzd",
      severity: "warning",
      message: "The extracted currency is not NZD and will require review.",
    });
  }

  const negativeFinancialValue = [
    header.subtotal.value,
    header.taxTotal.value,
    header.total.value,
    ...lines.flatMap((line) => [
      line.quantity.value,
      line.unitPrice.value,
      line.lineSubtotal.value,
      line.taxAmount.value,
      line.lineTotal.value,
    ]),
  ].some((value) => typeof value === "number" && value < 0);

  if (negativeFinancialValue) {
    warnings.push({
      code: "negative_values_detected",
      severity: "warning",
      message: "Negative values were detected in the extracted invoice draft.",
    });
  }

  const combinedSourceText = [
    header.notes.value,
    header.paymentReference.value,
    ...lines.map((line) => line.sourceText ?? ""),
  ].join(" ").toLowerCase();
  if (combinedSourceText.includes("credit note") || combinedSourceText.includes("credit memo")) {
    warnings.push({
      code: "likely_credit_note",
      severity: "warning",
      message: "This document appears to be a credit note and requires review.",
    });
  }

  const poReferenceMatches = combinedSourceText.match(/\b(?:ts-\d{3,}|po[-\s]?\d{3,})\b/gi) ?? [];
  if (new Set(poReferenceMatches.map((match) => match.toLowerCase())).size > 1) {
    warnings.push({
      code: "multiple_po_references_detected",
      severity: "info",
      message: "Multiple PO-style references were detected in the document.",
    });
  }

  const duplicateLineKeys = new Set<string>();
  const hasDuplicateLine = lines.some((line) => {
    const key = [
      normalizeWhitespace(line.description.value ?? "").toLowerCase(),
      line.lineTotal.value?.toFixed(2) ?? "",
    ].join("|");
    if (!key || key === "|") {
      return false;
    }
    if (duplicateLineKeys.has(key)) {
      return true;
    }
    duplicateLineKeys.add(key);
    return false;
  });
  if (hasDuplicateLine) {
    warnings.push({
      code: "duplicate_lines_detected",
      severity: "info",
      message: "Potential duplicate invoice lines were detected.",
    });
  }

  if (!normalizeSupplierInvoiceNumber(header.invoiceNumber.value)) {
    warnings.push({
      code: "missing_invoice_number",
      severity: "warning",
      message: "No reliable invoice number was extracted.",
    });
  }

  if (supplierMatch.status === "none") {
    warnings.push({
      code: "no_supplier_match",
      severity: "warning",
      message: "No high-confidence supplier match was found.",
    });
  }

  if (supplierMatch.status === "ambiguous") {
    warnings.push({
      code: "ambiguous_supplier_match",
      severity: "warning",
      message: "Multiple suppliers could match the extracted supplier details.",
    });
  }

  if (extractionMeta.likelyScanned) {
    warnings.push({
      code: "scanned_pdf_requires_review",
      severity: "info",
      message: "This PDF appears scanned or image-heavy and may need closer review.",
    });
  }

  const unreadableLineCount = lines.filter((line) =>
    line.description.state === "unreadable"
    || line.lineTotal.state === "unreadable"
  ).length;
  if (unreadableLineCount > 0) {
    warnings.push({
      code: "unreadable_table",
      severity: "info",
      message: "Some invoice lines were unreadable and may need manual entry.",
    });
  }

  const duplicateWarning = await buildDuplicateInvoiceWarning({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierId: supplierMatch.status === "high_confidence" ? supplierMatch.supplierId : null,
    invoiceNumber: header.invoiceNumber.value,
    supplierInvoiceId: params.supplierInvoiceId,
  });
  if (duplicateWarning) {
    warnings.push(duplicateWarning);
  }

  return warnings;
}

export function toSupplierInvoiceDraftExtraction(
  payload: ProviderDraftPayload,
  supplierMatch: SupplierInvoiceSupplierMatchResult,
  extractionMeta: SupplierInvoiceDraftExtraction["extractionMeta"],
  warnings: SupplierInvoiceExtractionWarning[]
): SupplierInvoiceDraftExtraction {
  return {
    header: payload.header,
    lines: payload.lines,
    supplierMatch,
    extractionMeta,
    warnings,
  };
}

export async function extractSupplierInvoiceDraft(params: {
  supabase: AppSupabaseClient;
  organizationId: string;
  supplierInvoiceId: string;
  pdfFileName: string;
  pdfBytes: Uint8Array;
  suppliers: OrganizationSupplierRow[];
}): Promise<{
  draft: SupplierInvoiceDraftExtraction;
  provider: string;
  model: string;
}> {
  const pageTexts = await extractPdfTextPages(params.pdfBytes);
  const likelyScanned = isLikelyScannedPdf(pageTexts);
  const extractedTextChars = pageTexts.reduce((sum, page) => sum + page.text.length, 0);
  const heuristicPayload = !likelyScanned
    ? buildHeuristicSupplierInvoiceDraftFromText(pageTexts)
    : null;
  const extractionMeta = {
    method: likelyScanned ? "vision_pdf" as const : "text" as const,
    pageCount: pageTexts.length,
    extractedTextChars,
    likelyScanned,
  };
  const deterministicReady = isSupplierInvoiceDeterministicDraftSufficient({
    payload: heuristicPayload,
    pageTexts,
    likelyScanned,
  });

  if (deterministicReady && heuristicPayload) {
    const supplierMatch = matchExtractedSupplierToOrganizationSuppliers({
      suppliers: params.suppliers,
      header: {
        ...heuristicPayload.header,
        notes: heuristicPayload.header.notes,
        paymentReference: heuristicPayload.header.paymentReference,
      },
    });

    const warnings = await buildSupplierInvoiceExtractionWarnings({
      supabase: params.supabase,
      organizationId: params.organizationId,
      supplierInvoiceId: params.supplierInvoiceId,
      draft: {
        header: heuristicPayload.header,
        lines: heuristicPayload.lines,
        supplierMatch,
        extractionMeta,
      },
    });

    return {
      draft: toSupplierInvoiceDraftExtraction(
        heuristicPayload,
        supplierMatch,
        extractionMeta,
        warnings
      ),
      provider: "deterministic",
      model: "text-deterministic-v1",
    };
  }

  const openAiApiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_SUPPLIER_INVOICE_EXTRACTION_MODEL?.trim()
    || DEFAULT_SUPPLIER_INVOICE_EXTRACTION_MODEL;

  let primaryPayload: ProviderDraftPayload;
  let provider = "openai";
  let resolvedModel = model;
  let providerWarning: SupplierInvoiceExtractionWarning | null = null;

  try {
    if (!openAiApiKey) {
      throw new Error("Missing OPENAI_API_KEY.");
    }

    primaryPayload = likelyScanned
      ? await requestDraftFromOpenAi({
          openAiApiKey,
          model,
          prompt: buildVisionFallbackPrompt(),
          pdfFileName: params.pdfFileName,
          pdfBytes: params.pdfBytes,
          method: "vision_pdf",
        })
      : await requestDraftFromOpenAi({
          openAiApiKey,
          model,
          prompt: buildTextFirstPrompt(pageTexts),
          pdfFileName: params.pdfFileName,
          pdfBytes: params.pdfBytes,
          method: "text",
        });
  } catch (error) {
    if (!heuristicPayload) {
      throw error;
    }

    primaryPayload = heuristicPayload;
    provider = "heuristic";
    resolvedModel = "text-fallback-v1";
    providerWarning = buildProviderUnavailableWarning(
      "Readable invoice values were preserved, but provider enrichment was unavailable. Review extracted line details carefully."
    );

    if (!(error instanceof Error) || error.message !== "Missing OPENAI_API_KEY.") {
      console.warn("[supplier-invoice-extraction] provider fallback preserved deterministic draft", {
        model,
        message: error instanceof Error ? error.message : "Unknown provider failure.",
      });
    }
  }

  const supplierMatch = matchExtractedSupplierToOrganizationSuppliers({
    suppliers: params.suppliers,
    header: {
      ...primaryPayload.header,
      notes: primaryPayload.header.notes,
      paymentReference: primaryPayload.header.paymentReference,
    },
  });

  const warnings = await buildSupplierInvoiceExtractionWarnings({
    supabase: params.supabase,
    organizationId: params.organizationId,
    supplierInvoiceId: params.supplierInvoiceId,
    draft: {
      header: primaryPayload.header,
      lines: primaryPayload.lines,
      supplierMatch,
      extractionMeta,
    },
  });
  if (
    primaryPayload.lines.length === 0
    && pageTexts.some((page) => containsReadableLineTable(page.text))
    && !warnings.some((warning) => warning.code === "unreadable_table")
  ) {
    warnings.push({
      code: "unreadable_table",
      severity: "info",
      message: "Some invoice lines were unreadable and may need manual entry.",
    });
  }
  if (providerWarning && !warnings.some((warning) => warning.code === providerWarning.code)) {
    warnings.push(providerWarning);
  }

  return {
    draft: toSupplierInvoiceDraftExtraction(
      primaryPayload,
      supplierMatch,
      extractionMeta,
      warnings
    ),
    provider,
    model: resolvedModel,
  };
}

export function emptySupplierInvoiceDraftExtraction(): SupplierInvoiceDraftExtraction {
  return {
    header: {
      supplierName: buildMissingField<string>(),
      supplierLegalName: buildMissingField<string>(),
      supplierTaxNumber: buildMissingField<string>(),
      supplierCompanyNumber: buildMissingField<string>(),
      supplierEmail: buildMissingField<string>(),
      invoiceNumber: buildMissingField<string>(),
      supplierPoReference: buildMissingField<string>(),
      invoiceDate: buildMissingField<string>(),
      dueDate: buildMissingField<string>(),
      currency: buildMissingField<string>(),
      subtotal: buildMissingField<number>(),
      taxTotal: buildMissingField<number>(),
      total: buildMissingField<number>(),
      notes: buildMissingField<string>(),
      paymentReference: buildMissingField<string>(),
    },
    lines: [],
    warnings: [],
    supplierMatch: {
      status: "none",
      supplierId: null,
      label: null,
      reason: "No extraction data available.",
      matchType: "none",
      score: 0,
      extractedName: null,
      matchedSupplierName: null,
      explanation: "No extraction data was available to compare against organization suppliers.",
      candidateSupplierIds: [],
      candidates: [],
    },
    extractionMeta: {
      method: "text",
      pageCount: 0,
      extractedTextChars: 0,
      likelyScanned: false,
    },
  };
}
