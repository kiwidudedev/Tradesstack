import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const quotePage = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/page.tsx",
  "utf8",
);
const quoteClient = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/ProjectQuoteDetailClient.tsx",
  "utf8",
);
const quoteLayout = readFileSync("components/app/QuoteEditorShared.tsx", "utf8");
const projectNav = readFileSync("components/app/ProjectSecondaryNav.tsx", "utf8");
const ownerSource = readFileSync("lib/pricing-worksheet-owner.ts", "utf8");
const sharedRegister = readFileSync("components/app/PricingWorksheetRegisterPage.tsx", "utf8");
const lightweightRoutePage = readFileSync("components/app/ProjectPricingWorksheetRoutePage.tsx", "utf8");

describe("Project Quote pricing worksheet surface", () => {
  it("exposes stable nested quote worksheet routes and tabs", () => {
    expect(lightweightRoutePage).toContain("registerPath={context.registerPath}");
    expect(quotePage).not.toContain("<CommercialRecordTabs");
    expect(projectNav).toContain("<DropdownMenu");
    expect(projectNav).toContain("Quotes");
    expect(projectNav).toContain("Pricing Worksheets");
    expect(projectNav).toContain("<Link href={quoteRootHref}");
    expect(projectNav).toContain("<Link href={pricingWorksheetHref}");
    expect(projectNav).not.toContain("currentQuoteId");
    expect(quoteLayout).toContain("contentOverride");
  });

  it("mounts the shared Project register rather than bespoke quote worksheet cards", () => {
    expect(lightweightRoutePage).toContain("<SharedPricingWorksheetRegisterPage");
    expect(quotePage).not.toContain("SharedPricingWorksheetRegisterPage");
    expect(lightweightRoutePage).not.toContain("PricingWorksheetEntryPanel");
    expect(sharedRegister).toContain("OperationalTable");
    expect(sharedRegister).toContain('title="Pricing Worksheets"');
    expect(sharedRegister).toContain('"New Worksheet"');
  });

  it("does not duplicate quote revision lifecycle actions on the Pricing Worksheets surface", () => {
    expect(quotePage).not.toContain("Keep this issued revision stable and continue in a linked draft successor.");
    expect(quotePage).not.toContain("The issued quote stays locked; commercial changes belong in its working revision.");
    expect(lightweightRoutePage).not.toContain("revisionPrimaryAction");
    expect(quoteClient).toContain("primaryAction={revisionPrimaryAction}");
  });

  it("keeps accepted evidence distinct from editable Project working pricing", () => {
    expect(quoteClient).toContain("Open Quote");
    expect(ownerSource).toContain("readOnly: input.readOnly === true");
  });

  it("does not mount placeholder quote authority before server data is available", () => {
    expect(quotePage).toContain("loadProjectQuoteDetail");
    expect(quotePage).toContain("if (!initialData) notFound()");
    expect(quoteClient).toContain("initialData.quote.status");
  });

  it("offers deterministic successor creation for issued Project revisions", () => {
    expect(quoteClient).toContain("create_project_quote_revision_v1");
    expect(quoteClient).toContain("Create Revision");
    expect(quoteClient).toContain("disabled={!canManageQuote || isCreatingRevision || isLoadingQuote}");
  });

  it("creates Project-owned workbooks through the shared register", () => {
    expect(sharedRegister).toContain('projectOwned: worksheetOwner.ownerType === "project"');
    expect(sharedRegister).toContain('ownerType === "project" ? worksheetOwner.projectId : null');
    expect(ownerSource).toContain('ownerType: "project"');
  });

  it("keeps issued and accepted quote revisions immutable", () => {
    expect(quoteClient).toContain("isQuoteImmutable({ quoteId, status: quoteStatus, awardLockedAt })");
    expect(quoteClient).toContain("isImmutableQuoteRevision");
    expect(quoteClient).toContain("Create a successor Draft revision");
  });
});
