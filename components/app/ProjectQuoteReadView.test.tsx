import { vi } from "vitest";

vi.mock("@/lib/fonts", () => ({
  ibmPlexSans: { className: "ibm-plex-sans" },
}));

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectQuoteReadView } from "@/components/app/ProjectQuoteReadView";

const baseProps = {
  error: null,
  saveMessage: null,
  readOnlyMessage: null,
  quoteNumber: "Q-1",
  quoteTitle: "Quote",
  quoteStatus: "Draft" as const,
  canManageQuote: true,
  onEdit: vi.fn(),
  onExport: vi.fn(),
  clientName: "Client",
  siteAddress: "Site",
  projectName: "Project",
  quoteDate: "2026-08-21",
  expiryDate: "2026-09-21",
  lineItems: [{
    id: "line-a",
    section: "Labour" as const,
    description: "Install",
    quantity: 2,
    unit: "hr",
    rate: 75,
    isOptional: false,
  }],
  termsInclusions: "Included",
  termsExclusions: "Excluded",
  clarifications: "Clarified",
  assumptions: "Assumed",
  pricingSummary: {
    baseSubtotal: 150,
    optionalSubtotal: 0,
    margin: 0,
    contingency: 0,
    discount: 0,
    gst: 22.5,
    grandTotal: 172.5,
  },
  getCommercialItemSourceHref: vi.fn(() => null),
  isCommercialMetadataPending: false,
};

describe("Project Quote read view authority", () => {
  it("renders persisted pricing immediately with the authorized Draft action", () => {
    const markup = renderToStaticMarkup(<ProjectQuoteReadView {...baseProps} />);

    expect(markup).toContain("Q-1");
    expect(markup).toContain("Install");
    expect(markup).toContain("$75.00");
    expect(markup).toContain("$150.00");
    expect(markup).toContain("Edit Quote");
    expect(markup).not.toContain("Loading saved quote");
  });

  it("renders a disabled pending revision action without flashing Edit or Create Revision", () => {
    const markup = renderToStaticMarkup(
      <ProjectQuoteReadView
        {...baseProps}
        quoteStatus="Accepted"
        canManageQuote={false}
        primaryAction={<button type="button" disabled>Resolving Revision...</button>}
      />,
    );

    expect(markup).toContain("Resolving Revision...");
    expect(markup).not.toContain("Edit Quote");
    expect(markup).not.toContain("Create Revision");
  });
});
