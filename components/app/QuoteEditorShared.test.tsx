import { vi } from "vitest";

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
  it("renders only the source action for linked lines", () => {
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
        isScopeImportOpen={false}
        setIsScopeImportOpen={vi.fn()}
        isLoadingScopeItems={false}
        availableScopeCostItems={[]}
        selectedScopeCostItemIds={[]}
        toggleScopeCostItem={vi.fn()}
        importSelectedScopeItems={vi.fn()}
        isCommercialItemsOpen={false}
        setIsCommercialItemsOpen={vi.fn()}
        isLoadingCommercialItems={false}
        availableCommercialItems={[]}
        selectedCommercialItemIds={[]}
        toggleCommercialItem={vi.fn()}
        importSelectedCommercialItems={vi.fn()}
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
        isScopeImportOpen={false}
        setIsScopeImportOpen={vi.fn()}
        isLoadingScopeItems={false}
        availableScopeCostItems={[]}
        selectedScopeCostItemIds={[]}
        toggleScopeCostItem={vi.fn()}
        importSelectedScopeItems={vi.fn()}
        isCommercialItemsOpen
        setIsCommercialItemsOpen={vi.fn()}
        isLoadingCommercialItems={false}
        availableCommercialItems={[]}
        selectedCommercialItemIds={[]}
        toggleCommercialItem={vi.fn()}
        importSelectedCommercialItems={vi.fn()}
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
    expect(markup).toContain("Worksheet Sources");
    expect(markup).not.toContain("Commercial Item");
  });
});
