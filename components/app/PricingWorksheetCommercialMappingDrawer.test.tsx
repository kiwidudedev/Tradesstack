import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PricingWorksheetCommercialMappingDrawer,
  PricingWorksheetVariationMappingDrawer,
} from "@/components/app/PricingWorksheetCommercialMappingDrawer";
import { EMPTY_COMMERCIAL_MAPPING_ERROR, type ResolvedWorksheetCommercialLine, type WorksheetCommercialMappingSession } from "@/lib/commercial-items/worksheet-commercial-mapping";

const sourceFor = (cellKey: string) => ({ workbookId: "wb-1", sheetId: "sheet-1", cellKey, structureKey: "A,B|1,2,3,4,5" });
const source = sourceFor("A5");
const session: WorksheetCommercialMappingSession = {
  destination: "quote",
  workbookId: "wb-1",
  sheetId: "sheet-1",
  structureKey: source.structureKey,
  startingCell: "A5",
  capturedSelection: { startRowIndex: 4, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 0 },
  capturedSelections: [{ startRowIndex: 4, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 0 }],
  activeField: "rate",
  description: { mode: "worksheet", source },
  mappings: { quantity: sourceFor("G5"), unit: sourceFor("H5"), rate: sourceFor("I5"), total: sourceFor("J5") },
  statusMessage: "I5 assigned to Rate.",
};
const resolved: ResolvedWorksheetCommercialLine = {
  fields: {
    description: { field: "description", source, cell: null, displayValue: "92mm 0.75BMT Stud", value: "92mm 0.75BMT Stud", error: null },
    quantity: { field: "quantity", source: sourceFor("G5"), cell: null, displayValue: "100.0000000001", value: 100.0000000001, error: null },
    unit: { field: "unit", source: sourceFor("H5"), cell: null, displayValue: "L/m", value: "L/m", error: null },
    rate: { field: "rate", source: sourceFor("I5"), cell: null, displayValue: "4.88", value: 4.88, error: null },
    total: { field: "total", source: sourceFor("J5"), cell: null, displayValue: "7720.800000000001", value: 7720.800000000001, error: null },
  },
  line: { description: "92mm 0.75BMT Stud", quantity: 100.0000000001, unit: "L/m", rate: 4.88, total: 7720.800000000001 },
  errors: [],
  warnings: ["Mapped Total differs from Quantity × Rate."],
  effective: { quantity: 100.0000000001, rate: 4.88, total: 488.000000000488, derivedQuantity: false, derivedRate: false },
};

function renderDrawer(overrides?: {
  session?: WorksheetCommercialMappingSession;
  resolved?: ResolvedWorksheetCommercialLine;
  quoteOptions?: Array<{
    id: string;
    quoteNumber: string;
    quoteTitle: string;
    status: string | null;
    updatedAt: string | null;
    lineItemCount: number;
    recipientName?: string;
    revisionNumber?: number;
  }>;
  quoteTargetIds?: string[];
}) {
  const noop = vi.fn();
  return renderToStaticMarkup(<PricingWorksheetCommercialMappingDrawer session={overrides?.session ?? session} resolved={overrides?.resolved ?? resolved} sheetName="Page 1" quoteOptions={overrides?.quoteOptions ?? []} quoteTargetMode={overrides?.quoteOptions?.length ? "existing" : "new"} quoteTargetIds={overrides?.quoteTargetIds ?? []} purchaseOrderOptions={[]} suppliers={[{ id: "supplier-1", label: "Metro Supplies" }]} purchaseOrderTargetMode="new" purchaseOrderTargetId="" purchaseOrderSupplierId="supplier-1" purchaseOrderTitle="Worksheet Purchase Order" purchaseOrderSection="Materials" isPublishing={false} onClose={noop} onEscape={noop} onArmField={noop} onClearField={noop} onAssignField={noop} onHighlightField={noop} onBeginDescriptionEdit={noop} onCommitDescription={noop} onQuoteTargetModeChange={noop} onQuoteTargetIdsChange={noop} onPurchaseOrderTargetModeChange={noop} onPurchaseOrderTargetIdChange={noop} onPurchaseOrderSupplierIdChange={noop} onPurchaseOrderTitleChange={noop} onPurchaseOrderSectionChange={noop} onPublish={noop} />);
}

describe("PricingWorksheetCommercialMappingDrawer", () => {
  it("renders Quote-like commercial mapping groups with subordinate sources and formatted values", () => {
    const markup = renderDrawer();
    expect(markup).toContain("Add to Quote");
    expect(markup).toContain("Page 1");
    expect(markup).not.toContain("Page 1 · Commercial Mapping Mode");
    expect(markup).toContain('data-testid="commercial-mapping-description-row"');
    expect(markup).toContain('data-testid="commercial-mapping-quantity-unit-row"');
    expect(markup).toContain('data-testid="commercial-mapping-rate-total-row"');
    expect(markup).toContain("Qty.");
    expect(markup).toContain("92mm 0.75BMT Stud");
    expect(markup).toContain("Source A5");
    expect(markup).toContain('aria-label="Source cell A5"');
    expect(markup).toContain("$4.88");
    expect(markup).toContain("NZ$7,720.80");
    expect(markup).toContain("NZ$488.00");
    expect(markup).toContain("Mapped total");
    expect(markup).toContain("Persisted total");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-label="Clear Rate mapping"');
    expect(markup).toContain('aria-label="Edit description"');
    expect(markup).toContain('data-testid="commercial-mapping-preview"');
    expect(markup).toContain("Quote destination");
  });

  it("summarizes exact multi-company destination selections", () => {
    const markup = renderDrawer({
      quoteOptions: [
        { id: "fletcher", quoteNumber: "Q-26008-2", quoteTitle: "Skycity Auckland Quotation", status: "Draft", updatedAt: null, lineItemCount: 0, recipientName: "Fletcher Construction", revisionNumber: 1 },
        { id: "harbour", quoteNumber: "Q-26008-3", quoteTitle: "Skycity Auckland Quotation", status: "Draft", updatedAt: null, lineItemCount: 0, recipientName: "Harbour Side Builders", revisionNumber: 2 },
      ],
      quoteTargetIds: ["fletcher", "harbour"],
    });

    expect(markup).toContain("2 draft Quotes selected");
    expect(markup).toContain("Add to Quotes");
    expect(markup).not.toContain("Skycity Auckland Quotation");
  });

  it("associates invalid field errors and keeps the clear target available", () => {
    const invalidResolved: ResolvedWorksheetCommercialLine = {
      ...resolved,
      fields: {
        ...resolved.fields,
        quantity: { ...resolved.fields.quantity, value: null, error: "Quantity requires a numeric worksheet cell." },
      },
      errors: ["Quantity requires a numeric worksheet cell."],
    };
    const markup = renderDrawer({ resolved: invalidResolved });
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="commercial-mapping-field-quantity-error"');
    expect(markup).toContain('id="commercial-mapping-field-quantity-error"');
    expect(markup).toContain('aria-label="Clear Qty. mapping"');
    expect(markup).toContain("Quantity requires a numeric worksheet cell.");
  });

  it("keeps empty and armed fields explicit in the flattened layout", () => {
    const emptySession: WorksheetCommercialMappingSession = {
      ...session,
      activeField: "quantity",
      description: { mode: "empty" },
      mappings: { quantity: null, unit: null, rate: null, total: null },
      statusMessage: "Quantity field armed. Select a worksheet cell.",
    };
    const emptyResolved: ResolvedWorksheetCommercialLine = {
      fields: {
        description: { field: "description", source: null, cell: null, displayValue: "", value: null, error: null },
        quantity: { field: "quantity", source: null, cell: null, displayValue: "", value: null, error: null },
        unit: { field: "unit", source: null, cell: null, displayValue: "", value: null, error: null },
        rate: { field: "rate", source: null, cell: null, displayValue: "", value: null, error: null },
        total: { field: "total", source: null, cell: null, displayValue: "", value: null, error: null },
      },
      line: { description: "", quantity: null, unit: null, rate: null, total: null },
      errors: [EMPTY_COMMERCIAL_MAPPING_ERROR],
      warnings: [],
      effective: { quantity: 1, rate: 0, total: 0, derivedQuantity: false, derivedRate: false },
    };
    const markup = renderDrawer({ session: emptySession, resolved: emptyResolved });
    expect(markup).toContain("Select worksheet cell");
    expect(markup).toContain("Select a cell from worksheet…");
    expect(markup).toContain('data-testid="commercial-mapping-field-quantity"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('data-testid="commercial-mapping-empty-helper"');
    expect(markup).toContain(EMPTY_COMMERCIAL_MAPPING_ERROR);
    expect(markup).not.toContain('data-testid="commercial-mapping-preview"');
    expect(markup).toMatch(/data-testid="commercial-mapping-publish"[^>]*disabled/);
  });

  it("publishes Description only while leaving every other source slot neutral", () => {
    const descriptionOnlySession: WorksheetCommercialMappingSession = {
      ...session,
      description: { mode: "worksheet", source },
      mappings: { quantity: null, unit: null, rate: null, total: null },
    };
    const descriptionOnlyResolved: ResolvedWorksheetCommercialLine = {
      fields: {
        description: resolved.fields.description,
        quantity: { field: "quantity", source: null, cell: null, displayValue: "", value: null, error: null },
        unit: { field: "unit", source: null, cell: null, displayValue: "", value: null, error: null },
        rate: { field: "rate", source: null, cell: null, displayValue: "", value: null, error: null },
        total: { field: "total", source: null, cell: null, displayValue: "", value: null, error: null },
      },
      line: { description: "92mm 0.75BMT Stud", quantity: null, unit: null, rate: null, total: null },
      errors: [],
      warnings: [],
      effective: { quantity: 1, rate: 0, total: 0, derivedQuantity: false, derivedRate: false },
    };
    const markup = renderDrawer({ session: descriptionOnlySession, resolved: descriptionOnlyResolved });
    expect(markup).toContain("92mm 0.75BMT Stud");
    expect(markup).not.toContain("Untitled item");
    expect(markup).not.toContain(" × ");
    expect(markup).not.toMatch(/data-testid="commercial-mapping-publish"[^>]*disabled/);
    expect(markup).not.toContain('aria-invalid="true"');
  });

  it("marks manual Description without a clear-mapping action and includes it in Preview", () => {
    const manualSession: WorksheetCommercialMappingSession = {
      ...session,
      activeField: null,
      description: { mode: "manual", value: "Plasterboard Linings" },
      mappings: { quantity: null, unit: null, rate: null, total: null },
    };
    const manualResolved: ResolvedWorksheetCommercialLine = {
      fields: {
        description: { field: "description", source: null, cell: null, displayValue: "Plasterboard Linings", value: "Plasterboard Linings", error: null },
        quantity: { field: "quantity", source: null, cell: null, displayValue: "", value: null, error: null },
        unit: { field: "unit", source: null, cell: null, displayValue: "", value: null, error: null },
        rate: { field: "rate", source: null, cell: null, displayValue: "", value: null, error: null },
        total: { field: "total", source: null, cell: null, displayValue: "", value: null, error: null },
      },
      line: { description: "Plasterboard Linings", quantity: null, unit: null, rate: null, total: null },
      errors: [],
      warnings: [],
      effective: { quantity: 1, rate: 0, total: 0, derivedQuantity: false, derivedRate: false },
    };
    const markup = renderDrawer({ session: manualSession, resolved: manualResolved });
    expect(markup).toContain("Manual entry");
    expect(markup).toContain('aria-label="Edit description"');
    expect(markup).not.toContain('aria-label="Clear Description mapping"');
    expect(markup).toContain('data-testid="commercial-mapping-preview"');
    expect(markup).toContain("Plasterboard Linings");
  });

  it("previews Total-only mapping with destination-derived Quantity and Rate", () => {
    const totalOnlySession: WorksheetCommercialMappingSession = {
      ...session,
      description: { mode: "empty" },
      mappings: { quantity: null, unit: null, rate: null, total: sourceFor("J5") },
    };
    const totalOnlyResolved: ResolvedWorksheetCommercialLine = {
      fields: {
        description: { field: "description", source: null, cell: null, displayValue: "", value: null, error: null },
        quantity: { field: "quantity", source: null, cell: null, displayValue: "", value: null, error: null },
        unit: { field: "unit", source: null, cell: null, displayValue: "", value: null, error: null },
        rate: { field: "rate", source: null, cell: null, displayValue: "", value: null, error: null },
        total: { ...resolved.fields.total, source: sourceFor("J5"), value: 50, displayValue: "50", error: null },
      },
      line: { description: "", quantity: null, unit: null, rate: null, total: 50 },
      errors: [],
      warnings: [],
      effective: { quantity: 1, rate: 50, total: 50, derivedQuantity: true, derivedRate: true },
    };
    const markup = renderDrawer({ session: totalOnlySession, resolved: totalOnlyResolved });
    expect(markup).not.toContain("Untitled item");
    expect(markup).toContain("1 Item × $50.00");
    expect(markup).toContain("NZ$50.00");
    expect(markup).toContain("Quantity defaults to 1");
    expect(markup).not.toMatch(/data-testid="commercial-mapping-publish"[^>]*disabled/);
  });

  it("uses the same commercial hierarchy and visible compact labels for Purchase Orders", () => {
    const purchaseOrderSession: WorksheetCommercialMappingSession = { ...session, destination: "purchase_order" };
    const markup = renderDrawer({ session: purchaseOrderSession });
    expect(markup).toContain("Add to Purchase Order");
    expect(markup).toContain("Purchase Order destination");
    expect(markup).toContain(">Supplier<");
    expect(markup).toContain(">Procurement section<");
    expect(markup).toContain(">Title<");
    expect(markup).toContain("Metro Supplies");
    expect(markup).toContain('aria-pressed="true"');
  });

  it("renders multi-line Variation mapping with route identity, per-line sections, and independent totals", () => {
    const noop = vi.fn();
    const variationSession = { ...session, destination: "variation" as const };
    const variationResolved = {
      ...resolved,
      effective: { quantity: 100.0000000001, rate: 4.88, total: 7720.800000000001, derivedQuantity: false, derivedRate: false },
      warnings: [],
    };
    const markup = renderToStaticMarkup(<PricingWorksheetVariationMappingDrawer
      variationNumber="V1"
      variationTitle="Client changes"
      variationStatus="Draft"
      sheetName="Page 1"
      lines={[
        { line: { id: "line-1", section: "Materials", mapping: variationSession }, resolved: variationResolved },
        { line: { id: "line-2", section: "Labour", mapping: { ...variationSession, activeField: null } }, resolved: variationResolved },
      ]}
      isPublishing={false}
      onClose={noop}
      onEscape={noop}
      onArmField={noop}
      onClearField={noop}
      onAssignField={noop}
      onHighlightField={noop}
      onBeginDescriptionEdit={noop}
      onCommitDescription={noop}
      onSectionChange={noop}
      onAddLine={noop}
      onRemoveLine={noop}
      onPublish={noop}
    />);

    expect(markup).toContain("Add to Variation");
    expect(markup).toContain("V1");
    expect(markup).toContain("Client changes");
    expect(markup).not.toContain("Commercial line 1");
    expect(markup).not.toContain("Commercial line 2");
    expect(markup).toContain("Add Another");
    expect(markup).toContain('aria-label="Remove commercial line 1"');
    expect(markup).toContain('aria-label="Remove commercial line 2"');
    expect(markup).toContain('aria-label="Variation section for commercial line 1"');
    expect(markup).toContain('value="Materials" selected');
    expect(markup).toContain("NZ$7,720.80");
    expect(markup).not.toContain("View selected cells");
  });

  it("formats floating-point quantity noise in the variation preview line", () => {
    const noop = vi.fn();
    const noisyResolved = {
      ...resolved,
      fields: {
        ...resolved.fields,
        quantity: { ...resolved.fields.quantity, value: 600.0000000000001, displayValue: "600.0000000000001" },
      },
      line: { ...resolved.line, description: "100 × 50 Timber", quantity: 600.0000000000001, unit: null, rate: 4.55, total: 2730 },
      effective: { quantity: 600.0000000000001, rate: 4.55, total: 2730, derivedQuantity: false, derivedRate: false },
    } as ResolvedWorksheetCommercialLine;
    const markup = renderToStaticMarkup(<PricingWorksheetVariationMappingDrawer
      variationNumber="V2"
      variationTitle="Timber supply"
      variationStatus="Draft"
      sheetName="Page 1"
      lines={[{ line: { id: "line-1", section: "Materials", mapping: { ...session, destination: "variation" as const } }, resolved: noisyResolved }]}
      isPublishing={false}
      onClose={noop}
      onEscape={noop}
      onArmField={noop}
      onClearField={noop}
      onAssignField={noop}
      onHighlightField={noop}
      onBeginDescriptionEdit={noop}
      onCommitDescription={noop}
      onSectionChange={noop}
      onAddLine={noop}
      onRemoveLine={noop}
      onPublish={noop}
    />);

    expect(markup).toContain("600 × $4.55");
    expect(markup).not.toContain("600.0000000000001");
  });
});
