import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootRoute = readFileSync("app/app/(workspace)/projects/[projectId]/preconstruction/quote/page.tsx", "utf8");
const legacyRegister = readFileSync("app/app/(workspace)/projects/[projectId]/preconstruction/pricing-worksheet/page.tsx", "utf8");
const legacyDeep = readFileSync("app/app/(workspace)/projects/[projectId]/preconstruction/pricing-worksheet/[worksheetId]/page.tsx", "utf8");
const layout = readFileSync("components/app/ProjectLayoutShell.tsx", "utf8");
const nav = readFileSync("components/app/ProjectSecondaryNav.tsx", "utf8");
const detailRoute = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/page.tsx",
  "utf8",
);
const detailClient = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/ProjectQuoteDetailClient.tsx",
  "utf8",
);

describe("Project Quotation route consolidation", () => {
  it("makes the root route a canonical resolver with a no-quote creation path", () => {
    expect(rootRoute).toContain("resolveCanonicalProjectQuoteId");
    expect(rootRoute).toContain("/preconstruction/quote/new");
    expect(rootRoute).not.toContain('"use client"');
  });

  it("uses the authoritative legacy automatic Draft classifier", () => {
    const resolver = readFileSync("lib/project-quote-routing-server.ts", "utf8");
    expect(resolver).toContain("classify_legacy_automatic_project_quote_draft_v1");
    expect(resolver).toContain("is_legacy_automatic_draft");
    expect(resolver).not.toContain("finalizerWindowEnd");
  });

  it("keeps direct historical quote URLs addressable and internally consistent", () => {
    expect(detailRoute).toContain("loadProjectQuoteDetail(projectId, quoteId)");
    expect(detailRoute).toContain("if (!initialData) notFound()");
    expect(detailClient).toContain("quoteNumber={quoteNumber}");
    expect(detailClient).toContain("initialData.quote.number");
  });

  it("redirects legacy register and deep links while preserving query parameters", () => {
    expect(legacyRegister).toContain("appendSearchParams");
    expect(legacyRegister).toContain("/pricing-worksheet`");
    expect(legacyDeep).toContain("appendSearchParams");
    expect(legacyDeep).toContain("/pricing-worksheet/${worksheetId}");
  });

  it("keeps a no-quote compatibility register without restoring primary navigation", () => {
    expect(legacyRegister).toContain("No-quote Projects retain their existing worksheet capability");
    expect(legacyRegister).toContain("SharedPricingWorksheetRegisterPage");
    expect(nav).not.toContain('label: "Pricing Worksheets"');
    expect(layout).not.toContain('{ segment: "preconstruction/pricing-worksheet"');
  });
});
