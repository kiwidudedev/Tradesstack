"use client";

import type { SupplierInvoiceDraftExtraction, SupplierInvoiceExtractionLineDraft } from "@/lib/supplier-invoice-document-extraction";
import { makeNewSupplierInvoiceClientId } from "./new-supplier-invoice-client-id";

export type NewSupplierInvoiceLineDraft = {
  id: string;
  description: string;
  supplierItemCode: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
  grossLineTotal?: string;
  taxAmount: string;
  taxEvidenceSource?: "document_line" | "header_distribution" | "calculated" | "manual" | "unknown";
  sourcePage: number | null;
  sourceText: string | null;
  confidence: number | null;
  provenance: string | null;
};

export type NewSupplierInvoiceCreateLinePayload = {
  id: string;
  description: string;
  supplierItemCode: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  grossLineTotal: number | null;
  taxAmount: number;
  taxEvidenceSource: "document_line" | "header_distribution" | "calculated" | "manual" | "unknown";
  costCodeId: null;
  projectId: null;
  sortOrder: number;
};

function toFixedString(value: number | null | undefined, fallback: string) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : fallback;
}

function fieldConfidence(line: SupplierInvoiceExtractionLineDraft) {
  return [
    line.description.confidence,
    line.quantity.confidence,
    line.unitPrice.confidence,
    line.lineSubtotal.confidence,
  ].find((value) => typeof value === "number" && Number.isFinite(value)) ?? null;
}

function summarizeLineProvenance(line: SupplierInvoiceExtractionLineDraft) {
  const states = [
    line.description.state,
    line.quantity.state,
    line.unitPrice.state,
    line.lineSubtotal.state,
  ];
  if (states.includes("unreadable")) {
    return "Contains unreadable values";
  }
  if (states.includes("inferred")) {
    return "Includes inferred values";
  }
  return "Extracted from PDF";
}

function numberString(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLineDraftForComparison(line: NewSupplierInvoiceLineDraft) {
  return {
    description: line.description.trim(),
    supplierItemCode: line.supplierItemCode.trim(),
    quantity: line.quantity.trim(),
    unit: line.unit.trim(),
    unitPrice: line.unitPrice.trim(),
    lineTotal: line.lineTotal.trim(),
    grossLineTotal: line.grossLineTotal?.trim() ?? "",
    taxAmount: line.taxAmount.trim(),
    taxEvidenceSource: line.taxEvidenceSource ?? "unknown",
    sourcePage: line.sourcePage ?? null,
    sourceText: line.sourceText?.trim() ?? "",
  };
}

export function makeBlankNewSupplierInvoiceLineDraft(): NewSupplierInvoiceLineDraft {
  return {
    id: makeNewSupplierInvoiceClientId(),
    description: "",
    supplierItemCode: "",
    quantity: "",
    unit: "",
    unitPrice: "",
    lineTotal: "",
    grossLineTotal: "",
    taxAmount: "",
    taxEvidenceSource: "manual",
    sourcePage: null,
    sourceText: null,
    confidence: null,
    provenance: null,
  };
}

export function lineDraftFromExtractionLine(
  line: SupplierInvoiceExtractionLineDraft
): NewSupplierInvoiceLineDraft {
  return {
    id: makeNewSupplierInvoiceClientId(),
    description: line.description.value ?? "",
    supplierItemCode: line.supplierItemCode.value ?? "",
    quantity:
      typeof line.quantity.value === "number" && Number.isFinite(line.quantity.value)
        ? String(line.quantity.value)
        : "",
    unit: line.unit.value ?? "",
    unitPrice: toFixedString(line.unitPrice.value, ""),
    lineTotal: toFixedString(line.lineSubtotal.value ?? line.lineTotal.value, ""),
    grossLineTotal: toFixedString(line.lineTotal.value, ""),
    taxAmount: toFixedString(line.taxAmount.value, ""),
    taxEvidenceSource: line.taxAmount.value === null ? "unknown" : "document_line",
    sourcePage: typeof line.sourcePage === "number" ? line.sourcePage : null,
    sourceText: line.sourceText ?? null,
    confidence: fieldConfidence(line),
    provenance: summarizeLineProvenance(line),
  };
}

export function lineDraftsFromExtraction(extraction: SupplierInvoiceDraftExtraction) {
  return extraction.lines.map(lineDraftFromExtractionLine);
}

export function hasMeaningfulLineDrafts(lines: NewSupplierInvoiceLineDraft[]) {
  return lines.some((line) =>
    Boolean(
      line.description.trim()
        || line.supplierItemCode.trim()
        || line.quantity.trim()
        || line.unit.trim()
        || line.unitPrice.trim()
        || line.lineTotal.trim()
    )
  );
}

export function lineDraftCollectionsEqual(
  left: NewSupplierInvoiceLineDraft[],
  right: NewSupplierInvoiceLineDraft[]
) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((line, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }
    return JSON.stringify(normalizeLineDraftForComparison(line)) === JSON.stringify(normalizeLineDraftForComparison(other));
  });
}

export function lineDraftsToCreatePayload(lines: NewSupplierInvoiceLineDraft[]): NewSupplierInvoiceCreateLinePayload[] {
  return lines.map((line, index) => ({
    id: line.id,
    description: line.description.trim(),
    supplierItemCode: line.supplierItemCode.trim() || null,
    quantity: numberString(line.quantity),
    unitPrice: numberString(line.unitPrice),
    lineTotal: numberString(line.lineTotal),
    grossLineTotal: line.grossLineTotal?.trim() ? numberString(line.grossLineTotal) : null,
    taxAmount: numberString(line.taxAmount),
    taxEvidenceSource: line.taxEvidenceSource ?? "unknown",
    costCodeId: null,
    projectId: null,
    sortOrder: index,
  }));
}

export function calculateLineDraftReconciliation(
  lines: NewSupplierInvoiceLineDraft[],
  documentSubtotal: string,
  documentTax: string
) {
  const lineSubtotal = lines.reduce((sum, line) => sum + numberString(line.lineTotal), 0);
  const subtotalValue = numberString(documentSubtotal);
  const taxValue = numberString(documentTax);
  const gstRate = subtotalValue > 0 ? taxValue / subtotalValue : 0;
  const calculatedTax = lineSubtotal > 0 && gstRate > 0 ? lineSubtotal * gstRate : 0;
  const lineTotal = lineSubtotal + calculatedTax;
  return {
    lineSubtotal: Number(lineSubtotal.toFixed(2)),
    calculatedTax: Number(calculatedTax.toFixed(2)),
    gstRate,
    lineTotal: Number(lineTotal.toFixed(2)),
  };
}

export function formatInvoiceSummaryGstPercent(gstRate: number) {
  if (!Number.isFinite(gstRate) || gstRate <= 0) {
    return "0";
  }

  const percent = gstRate * 100;
  const rounded = Number(percent.toFixed(2));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
}
