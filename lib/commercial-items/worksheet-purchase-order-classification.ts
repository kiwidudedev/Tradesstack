import type {
  PublishedWorksheetSelection,
  PublishedWorksheetSkippedRow,
} from "@/lib/commercial-items/published-worksheet-selection";
import type { PurchaseOrderCostSection } from "@/lib/purchase-orders/types";

export type PurchaseOrderPublishPreviewStatus = "eligible" | "excluded" | "unknown";
export type PurchaseOrderPublishPreviewReasonCode =
  | "material"
  | "subcontractor"
  | "plant"
  | "labour"
  | "margin"
  | "tax"
  | "contingency"
  | "subtotal"
  | "grand_total"
  | "overhead_admin"
  | "header"
  | "blank"
  | "ambiguous";

export interface PurchaseOrderPublishPreviewRow {
  rowId: string;
  rowIndex: number;
  rowLabel: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  sectionHeading: string | null;
  sourceRangeLabel: string;
  status: PurchaseOrderPublishPreviewStatus;
  reasonCode: PurchaseOrderPublishPreviewReasonCode;
  reasonLabel: string;
  suggestedSection: Exclude<PurchaseOrderCostSection, "Margin"> | null;
  selectedByDefault: boolean;
}

export interface PurchaseOrderPublishPreviewSeed {
  rowId: string;
  rowIndex: number;
  rowLabel: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  total: number | null;
  sectionHeading: string | null;
  sourceRangeLabel: string;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildSearchText(row: Pick<PurchaseOrderPublishPreviewSeed, "description" | "sectionHeading" | "unit">) {
  return normalize([row.sectionHeading, row.description, row.unit].filter(Boolean).join(" "));
}

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

export function classifyPurchaseOrderPublishPreviewRow(row: PurchaseOrderPublishPreviewSeed): PurchaseOrderPublishPreviewRow {
  const searchText = buildSearchText(row);

  if (includesAny(searchText, ["labour", "labor", "install labour", "installation labour", "manhour", "man hour", "hrs", "hour"])) {
    return {
      ...baseRow(row),
      status: "eligible",
      reasonCode: "labour",
      reasonLabel: "Eligible as a labour procurement line.",
      suggestedSection: "Labour",
      selectedByDefault: true,
    };
  }

  if (includesAny(searchText, ["margin", "markup", "mark up"])) {
    return {
      ...baseRow(row),
      status: "excluded",
      reasonCode: "margin",
      reasonLabel: "Margin rows are excluded from procurement publishing.",
      suggestedSection: null,
      selectedByDefault: false,
    };
  }

  if (includesAny(searchText, ["gst", "tax", "vat"])) {
    return {
      ...baseRow(row),
      status: "excluded",
      reasonCode: "tax",
      reasonLabel: "Tax rows are excluded from procurement publishing.",
      suggestedSection: null,
      selectedByDefault: false,
    };
  }

  if (includesAny(searchText, ["contingency", "allowance", "provisional sum"])) {
    return {
      ...baseRow(row),
      status: "excluded",
      reasonCode: "contingency",
      reasonLabel: "Contingency rows are excluded from procurement publishing.",
      suggestedSection: null,
      selectedByDefault: false,
    };
  }

  if (includesAny(searchText, ["overhead", "admin", "administration", "prelim"])) {
    return {
      ...baseRow(row),
      status: "excluded",
      reasonCode: "overhead_admin",
      reasonLabel: "Overhead and admin rows are excluded from procurement publishing.",
      suggestedSection: null,
      selectedByDefault: false,
    };
  }

  if (includesAny(searchText, ["subcontract", "subbie", "subcontractor"])) {
    return {
      ...baseRow(row),
      status: "eligible",
      reasonCode: "subcontractor",
      reasonLabel: "Eligible as a subcontractor procurement line.",
      suggestedSection: "Subcontractors",
      selectedByDefault: true,
    };
  }

  if (includesAny(searchText, ["plant", "equipment", "hire", "scissor lift", "excavator", "loader", "generator", "crane"])) {
    return {
      ...baseRow(row),
      status: "eligible",
      reasonCode: "plant",
      reasonLabel: "Eligible as a plant or equipment procurement line.",
      suggestedSection: "Plant",
      selectedByDefault: true,
    };
  }

  if (includesAny(searchText, ["material", "supply", "timber", "steel", "gib", "insulation", "fastener", "paint", "pipe", "cable"])) {
    return {
      ...baseRow(row),
      status: "eligible",
      reasonCode: "material",
      reasonLabel: "Eligible as a material procurement line.",
      suggestedSection: "Materials",
      selectedByDefault: true,
    };
  }

  if (includesAny(searchText, ["misc", "other", "sundry"])) {
    return {
      ...baseRow(row),
      status: "unknown",
      reasonCode: "ambiguous",
      reasonLabel: "This row needs a manual procurement section before it can be published.",
      suggestedSection: null,
      selectedByDefault: false,
    };
  }

  return {
    ...baseRow(row),
    status: "eligible",
    reasonCode: "material",
    reasonLabel: "Eligible as a material procurement line.",
    suggestedSection: "Materials",
    selectedByDefault: true,
  };
}

function mapSkippedRowToPreviewRow(row: PublishedWorksheetSkippedRow): PurchaseOrderPublishPreviewRow {
  const preview = {
    rowId: row.rowId,
    rowIndex: row.rowIndex,
    rowLabel: row.rowLabel,
    description: "",
    quantity: null,
    unit: null,
    rate: null,
    total: null,
    sectionHeading: null,
    sourceRangeLabel: row.rowLabel,
    status: "excluded" as const,
    suggestedSection: null,
    selectedByDefault: false,
  };

  switch (row.reason) {
    case "blank_row":
      return { ...preview, reasonCode: "blank", reasonLabel: "Blank rows are skipped." };
    case "heading_row":
    case "divider_row":
      return { ...preview, reasonCode: "header", reasonLabel: "Heading and decorative rows are skipped." };
    case "subtotal_row":
      return { ...preview, reasonCode: "subtotal", reasonLabel: "Subtotal rows are excluded from procurement publishing." };
    case "grand_total_row":
      return { ...preview, reasonCode: "grand_total", reasonLabel: "Grand total rows are excluded from procurement publishing." };
    case "tax_row":
      return { ...preview, reasonCode: "tax", reasonLabel: "Tax rows are excluded from procurement publishing." };
    default:
      return { ...preview, reasonCode: "ambiguous", reasonLabel: "This row could not be published safely." };
  }
}

function baseRow(row: PurchaseOrderPublishPreviewSeed) {
  return {
    rowId: row.rowId,
    rowIndex: row.rowIndex,
    rowLabel: row.rowLabel,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    rate: row.rate,
    total: row.total,
    sectionHeading: row.sectionHeading,
    sourceRangeLabel: row.sourceRangeLabel,
  };
}

export function buildPurchaseOrderPublishPreview(selection: PublishedWorksheetSelection) {
  const commercialRows = selection.commercialRows.map(classifyPurchaseOrderPublishPreviewRow);
  const skippedRows = selection.skippedRows.map(mapSkippedRowToPreviewRow);

  return {
    rows: [...commercialRows, ...skippedRows].sort((left, right) => left.rowIndex - right.rowIndex),
    commercialRows,
    skippedRows,
  };
}

export function buildPurchaseOrderPublishPreviewRows(rows: PurchaseOrderPublishPreviewSeed[]) {
  return rows.map(classifyPurchaseOrderPublishPreviewRow);
}
