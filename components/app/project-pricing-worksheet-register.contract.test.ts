import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const register = readFileSync(
  new URL("./PricingWorksheetRegisterPage.tsx", import.meta.url),
  "utf8",
);
const projectRoute = readFileSync(
  new URL("../../app/app/(workspace)/projects/[projectId]/preconstruction/pricing-worksheet/page.tsx", import.meta.url),
  "utf8",
);
const quotePage = readFileSync(
  new URL("../../app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/page.tsx", import.meta.url),
  "utf8",
);
const quoteRegisterRoute = readFileSync(
  new URL("../../app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/pricing-worksheet/page.tsx", import.meta.url),
  "utf8",
);
const quoteDeepRoute = readFileSync(
  new URL("../../app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/pricing-worksheet/[worksheetId]/page.tsx", import.meta.url),
  "utf8",
);
const lightweightRoutePage = readFileSync(
  new URL("./ProjectPricingWorksheetRoutePage.tsx", import.meta.url),
  "utf8",
);

describe("Project Pricing Worksheets register", () => {
  it("reuses the shared operational register architecture and expected columns", () => {
    expect(register).toContain("SharedPricingWorksheetRegisterPage");
    expect(register).toContain("OperationalModuleHeader");
    expect(register).toContain("OperationalPanel");
    expect(register).toContain("OperationalTable");
    expect(register).toContain(">Worksheet name<");
    expect(register).toContain(">Trade/package<");
    expect(register).toContain(">Last updated<");
    expect(register).toContain(">Actions<");
  });

  it("scopes every Project register mutation by tenant, lineage, Project, and workbook identity", () => {
    expect(register).toContain("applyPricingWorksheetMutationOwnerFilters");
    expect(register).toContain('return query.eq("project_id", owner.projectId)');
    expect(register).toContain('.eq("organization_id", context.organizationId)');
    expect(register).toContain('.eq("opportunity_id", context.opportunityId)');
    expect(register).toContain('.eq("id", actionDialog.row.id)');
    expect(register).toContain("duplicateOpportunityPricingWorkbook");
    expect(register).toContain("archiveWorksheet");
  });

  it("keeps workbook identity separate from display names", () => {
    expect(register).toContain("key={row.id}");
    expect(register).not.toMatch(/dedup[^\n]*row\.name/i);
  });

  it("loads the register from a stable logical scope and rejects stale responses", () => {
    expect(register).toContain("buildPricingWorksheetRegisterLoadScopeKey");
    expect(register).toContain("activeRegisterLoadRef");
    expect(register).toContain("const isCurrentLoad = () =>");
    expect(register).toContain("if (isCurrentLoad())");
    expect(register).toContain("registerLoadScopeKey,");
    expect(register).not.toMatch(/\n\s+worksheetOwner,\n/);
  });

  it("keeps loaded rows visible during a background register update", () => {
    expect(register).toContain("isLoading && !hasLoadedCurrentRegisterScope");
    expect(register).toContain("Updating pricing worksheets...");
  });

  it("keeps the Quote Detail page independent from the Project worksheet register", () => {
    expect(quotePage).not.toContain("buildProjectPricingWorksheetOwner");
    expect(quotePage).not.toContain("SharedPricingWorksheetRegisterPage");
    expect(quotePage).not.toContain("isPricingWorksheetTabActive");
  });

  it("renders canonical register and deep routes through the lightweight route page", () => {
    expect(quoteRegisterRoute).toContain("ProjectPricingWorksheetRoutePage");
    expect(quoteDeepRoute).toContain("ProjectPricingWorksheetRoutePage");
    expect(quoteRegisterRoute).not.toContain("PreconstructionQuotePage");
    expect(quoteDeepRoute).not.toContain("PreconstructionQuotePage");
    expect(lightweightRoutePage).toContain("resolveProjectPricingWorksheetRouteContext");
    expect(lightweightRoutePage).toContain("SharedPricingWorksheetRegisterPage");
    expect(lightweightRoutePage).toContain('contextLabel="project"');
  });

  it("retains the legacy route only as a redirect/no-quote compatibility surface", () => {
    expect(projectRoute).toContain("buildProjectPricingWorksheetOwner");
    expect(projectRoute).toContain("contextLabel=\"project\"");
    expect(projectRoute).toContain("resolveCanonicalProjectQuoteId");
    expect(projectRoute).toContain("/pricing-worksheet`");
  });
});
