import { vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/fonts", () => ({
  ibmPlexSans: {
    className: "ibm-plex-sans",
  },
  interMedium: {
    className: "inter-medium",
  },
}));

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuoteEditorLayout, type LineItem, type PricingSummary } from "@/components/app/QuoteEditorShared";

const quoteEditorSource = readFileSync(resolve(process.cwd(), "components/app/QuoteEditorShared.tsx"), "utf8");

const pricingSummary: PricingSummary = {
  baseSubtotal: 325,
  optionalSubtotal: 0,
  margin: 0,
  contingency: 0,
  discount: 0,
  gst: 48.75,
  grandTotal: 373.75,
};

const linkedLineItem: LineItem = {
  id: "line-1",
  section: "Item",
  description: "Stud framing",
  quantity: 10,
  unit: "lm",
  rate: 32.5,
  isOptional: false,
  commercialItemLink: {
    commercialItemId: "item-1",
    commercialItemDescription: "Stud framing",
    sourceStatus: "current",
    sourceRange: "A1:C4",
    sourceWorkbookId: "workbook-1",
    sourceWorksheetId: "workbook-1",
    sourceSheetId: "sheet-1",
    sourceWorksheetName: "Pricing worksheet",
    sourceSheetName: "Sheet 1",
    snapshotAtLinkJson: { total: 325 },
  },
};

describe("QuoteEditorShared", () => {
  it("hides the worksheet-source capability while preserving linked-line provenance", () => {
    const markup = renderToStaticMarkup(
      <QuoteEditorLayout
        heroTitle="Quote"
        error={null}
        saveMessage={null}
        shouldShowEditor={true}
        isLoadingQuote={false}
        isHydratingExistingQuote={false}
        canManageQuote
        canDeleteQuote
        isSaving={false}
        isDeleting={false}
        quoteId="quote-1"
        quoteStatus="Sent"
        setQuoteStatus={vi.fn()}
        quoteTitle="Fitout"
        setQuoteTitle={vi.fn()}
        clientName="Client"
        siteAddress="123 Street"
        projectName="Project"
        setProjectName={vi.fn()}
        quoteDate="2026-07-07"
        setQuoteDate={vi.fn()}
        expiryDate="2026-08-07"
        setExpiryDate={vi.fn()}
        quoteNumber="Q-TEST-1"
        onSave={vi.fn()}
        onEdit={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
        lineItems={[linkedLineItem]}
        mainLineItems={[linkedLineItem]}
        optionalLineItems={[]}
        addLineItem={vi.fn()}
        updateLineItem={vi.fn()}
        removeLineItem={vi.fn()}
        isQuoteDetailsOpen
        setIsQuoteDetailsOpen={vi.fn()}
        isLineItemsOpen
        setIsLineItemsOpen={vi.fn()}
        isTermsOpen
        setIsTermsOpen={vi.fn()}
        onOpenScopeImport={vi.fn()}
        showWorksheetSources={false}
        getCommercialItemSourceHref={() => "/app/leads-clients/opportunities/long-bay-apartment/pricing-worksheet/workbook-1?sheetId=sheet-1"}
        sectionSubtotals={new Map()}
        validityPeriod="30 days"
        setValidityPeriod={vi.fn()}
        paymentTerms=""
        setPaymentTerms={vi.fn()}
        leadTime=""
        setLeadTime={vi.fn()}
        termsInclusions=""
        setTermsInclusions={vi.fn()}
        termsExclusions=""
        setTermsExclusions={vi.fn()}
        clarifications=""
        setClarifications={vi.fn()}
        assumptions=""
        setAssumptions={vi.fn()}
        marginPercent="0"
        setMarginPercent={vi.fn()}
        discountAmount="0"
        setDiscountAmount={vi.fn()}
        contingencyAmount="0"
        setContingencyAmount={vi.fn()}
        gstPercent="15"
        setGstPercent={vi.fn()}
        includeMarginInExport={false}
        setIncludeMarginInExport={vi.fn()}
        includeDiscountInExport={false}
        setIncludeDiscountInExport={vi.fn()}
        includeContingencyInExport={false}
        setIncludeContingencyInExport={vi.fn()}
        pricingSummary={pricingSummary}
        primaryAction={<button type="button">Create Revision</button>}
      />,
    );

    expect(markup).toContain("Create Revision");
    expect(markup).toContain("Export PDF");
    expect(markup).not.toContain("Edit Quote");
    expect(markup).toContain('value="32.50"');
    expect(markup).not.toContain("Add from Worksheet Sources");
    expect(markup).not.toContain("No worksheet sources are available for this quote yet.");
    expect(markup).not.toContain(">Worksheet Source<");
    expect(markup).not.toContain("Commercial Item");
    expect(markup).toContain("View Source");
    expect(markup).not.toContain(">Current<");
    expect(markup).not.toContain("Sheet 1");
    expect(markup).not.toContain("A1:C4");
    expect(markup).toContain("/app/leads-clients/opportunities/long-bay-apartment/pricing-worksheet/workbook-1?sheetId=sheet-1");
  });

  it("uses worksheet source wording in the quote import UI", () => {
    const markup = renderToStaticMarkup(
      <QuoteEditorLayout
        heroTitle="Quote"
        error={null}
        saveMessage={null}
        shouldShowEditor={true}
        isLoadingQuote={false}
        isHydratingExistingQuote={false}
        canManageQuote
        canDeleteQuote
        isSaving={false}
        isDeleting={false}
        quoteId="quote-1"
        quoteStatus="Sent"
        setQuoteStatus={vi.fn()}
        quoteTitle="Fitout"
        setQuoteTitle={vi.fn()}
        clientName="Client"
        siteAddress="123 Street"
        projectName="Project"
        setProjectName={vi.fn()}
        quoteDate="2026-07-07"
        setQuoteDate={vi.fn()}
        expiryDate="2026-08-07"
        setExpiryDate={vi.fn()}
        quoteNumber="Q-TEST-1"
        onSave={vi.fn()}
        onEdit={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
        lineItems={[linkedLineItem]}
        mainLineItems={[linkedLineItem]}
        optionalLineItems={[]}
        addLineItem={vi.fn()}
        updateLineItem={vi.fn()}
        removeLineItem={vi.fn()}
        isQuoteDetailsOpen
        setIsQuoteDetailsOpen={vi.fn()}
        isLineItemsOpen
        setIsLineItemsOpen={vi.fn()}
        isTermsOpen
        setIsTermsOpen={vi.fn()}
        onOpenScopeImport={vi.fn()}
        showWorksheetSources
        isCommercialItemsOpen
        setIsCommercialItemsOpen={vi.fn()}
        isLoadingCommercialItems={false}
        availableCommercialItems={[]}
        selectedCommercialItemIds={[]}
        toggleCommercialItem={vi.fn()}
        importSelectedCommercialItems={vi.fn()}
        canUseMaterials
        onOpenMaterials={vi.fn()}
        getCommercialItemSourceHref={() => "/app/leads-clients/opportunities/long-bay-apartment/pricing-worksheet/workbook-1?sheetId=sheet-1"}
        sectionSubtotals={new Map()}
        validityPeriod="30 days"
        setValidityPeriod={vi.fn()}
        paymentTerms=""
        setPaymentTerms={vi.fn()}
        leadTime=""
        setLeadTime={vi.fn()}
        termsInclusions=""
        setTermsInclusions={vi.fn()}
        termsExclusions=""
        setTermsExclusions={vi.fn()}
        clarifications=""
        setClarifications={vi.fn()}
        assumptions=""
        setAssumptions={vi.fn()}
        marginPercent="0"
        setMarginPercent={vi.fn()}
        discountAmount="0"
        setDiscountAmount={vi.fn()}
        contingencyAmount="0"
        setContingencyAmount={vi.fn()}
        gstPercent="15"
        setGstPercent={vi.fn()}
        includeMarginInExport={false}
        setIncludeMarginInExport={vi.fn()}
        includeDiscountInExport={false}
        setIncludeDiscountInExport={vi.fn()}
        includeContingencyInExport={false}
        setIncludeContingencyInExport={vi.fn()}
        pricingSummary={pricingSummary}
      />,
    );

    expect(markup).toContain("Add from Worksheet Sources");
    expect(markup).toContain("Import Scope Items");
    expect(markup).toContain("Materials");
    expect(markup).not.toContain("Cost Breakdown Categories");
    expect(markup).not.toContain("Loading Scope Builder items");
    expect(markup).toContain("Worksheet Sources");
    expect(markup).toContain("No worksheet sources are available for this quote yet.");
    expect(markup).not.toContain("Commercial Item");
    expect(markup.match(/h-10 rounded-full border-\[var\(--border\)\] bg-\[var\(--surface\)\] px-4/g)).toHaveLength(3);
    expect(markup.match(/mr-1 h-4 w-4/g)).toHaveLength(3);
    expect(markup).toContain("flex flex-wrap items-center gap-3 pb-4 pt-6");
    expect(markup).toContain("ml-auto flex flex-wrap items-center justify-end gap-2");
  });

  it("preserves the three Quote action handlers while keeping Scope presentation outside the layout", () => {
    const headerStart = quoteEditorSource.indexOf('className="flex flex-wrap items-center gap-3 pb-4 pt-6"');
    const headerEnd = quoteEditorSource.indexOf("\n\n            <section>", headerStart);
    const actionHeader = quoteEditorSource.slice(headerStart, headerEnd);

    expect(headerStart).toBeGreaterThan(-1);
    expect(headerEnd).toBeGreaterThan(headerStart);
    expect(actionHeader).toContain("showWorksheetSources ? (");
    expect(actionHeader).toContain("setIsCommercialItemsOpen?.((current) => !current)");
    expect(actionHeader).toContain("onClick={onOpenScopeImport}");
    expect(actionHeader).toContain("ref={scopeImportTriggerRef}");
    expect(actionHeader).toContain("canUseMaterials && onOpenMaterials");
    expect(actionHeader).toContain("onClick={onOpenMaterials}");
    expect(actionHeader.match(/variant="outline"/g)).toHaveLength(3);
    expect(actionHeader.match(/styles\.quoteButtonLabel/g)).toHaveLength(3);
    expect(quoteEditorSource).not.toContain("Cost Breakdown Categories");
  });

  it("uses the shared no-source grid for normal and optional tables without changing mobile cards", () => {
    expect(quoteEditorSource).toContain("COMMERCIAL_LINE_GRID_WITHOUT_SOURCE");
    expect(quoteEditorSource).toContain("COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITHOUT_SOURCE");
    expect(quoteEditorSource.match(/gridTemplateColumns: COMMERCIAL_LINE_GRID_WITHOUT_SOURCE/g)).toHaveLength(4);
    expect(quoteEditorSource.match(/className=\{COMMERCIAL_LINE_TABLE_MIN_WIDTH_WITHOUT_SOURCE\}/g)).toHaveLength(2);
    expect(quoteEditorSource.match(/className="space-y-2 md:hidden"/g)).toHaveLength(2);
    expect(quoteEditorSource).not.toContain("min-w-[820px]");
  });
});
