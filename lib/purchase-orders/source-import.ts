import {
  PURCHASE_ORDER_SOURCE_SECTIONS,
  type PurchaseOrderSourceSection,
} from "@/lib/purchase-orders/types";

export type PurchaseOrderImportSection = PurchaseOrderSourceSection;

export type PurchaseOrderImportLine = {
  id: string;
  sourceCostItemId: string;
  section: PurchaseOrderImportSection;
  sourceSection: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
};

export type PurchaseOrderQuoteImportSource = {
  id: string;
  quoteNumber: string;
  quoteTitle: string;
  revisionNumber: number;
  status: "Accepted";
  lines: PurchaseOrderImportLine[];
};

export type PurchaseOrderVariationImportOption = {
  id: string;
  variationNumber: string;
  variationTitle: string;
  status: "Approved";
};

export type PurchaseOrderSourceActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const COMPATIBLE_SECTIONS = new Set<PurchaseOrderImportSection>(PURCHASE_ORDER_SOURCE_SECTIONS);

export function normalizePurchaseOrderImportSection(section: string): PurchaseOrderImportSection {
  return COMPATIBLE_SECTIONS.has(section as PurchaseOrderImportSection)
    ? (section as PurchaseOrderImportSection)
    : "Labour";
}

export function buildPurchaseOrderDraftLineFromSource(
  source: PurchaseOrderImportLine,
  createId: () => string = () => crypto.randomUUID(),
) {
  return {
    id: createId(),
    lineUid: createId(),
    costItemId: null,
    sourceCostItemId: source.sourceCostItemId,
    commercialItemLink: null,
    section: source.section,
    description: source.description,
    quantity: source.quantity,
    unit: source.unit,
    rate: source.rate,
    sourceTimeSheetEntryId: null,
  };
}

export function selectNewPurchaseOrderImportLines(params: {
  lines: PurchaseOrderImportLine[];
  selectedLineIds: ReadonlySet<string>;
  existingSourceCostItemIds: ReadonlySet<string>;
}) {
  return params.lines.filter(
    (line) => params.selectedLineIds.has(line.id)
      && !params.existingSourceCostItemIds.has(line.sourceCostItemId),
  );
}
