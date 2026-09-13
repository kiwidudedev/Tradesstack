import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const quotePage = readFileSync(
  "app/app/(workspace)/projects/[projectId]/preconstruction/quote/[quoteId]/ProjectQuoteDetailClient.tsx",
  "utf8",
);
const quoteLayout = readFileSync("components/app/QuoteEditorShared.tsx", "utf8");

describe("Project quote explicit revision UI", () => {
  it("offers Create Revision for an accepted award with no existing successor", () => {
    expect(quotePage).toContain("const revisionPrimaryAction = isImmutableQuoteRevision");
    expect(quotePage).toContain("primaryAction={revisionPrimaryAction}");
    expect(quotePage).toContain("Create Revision");
    expect(quotePage).toContain("Resolving Revision...");
    expect(quotePage).toContain("Creating Revision...");
    expect(quotePage).toContain("disabled={!canManageQuote || isCreatingRevision || isLoadingQuote}");
    expect(quotePage).toContain("create_project_quote_revision_v1");
    expect(quotePage).toContain("classify_legacy_automatic_project_quote_draft_v1");
    expect(quotePage).not.toContain("finalizerWindowEnd");
  });

  it("replaces Edit Quote with the immutable record action while preserving Draft defaults", () => {
    expect(quoteLayout).toContain("primaryAction?: ReactNode");
    expect(quoteLayout).toContain("primaryAction !== undefined ? primaryAction");
    expect(quoteLayout).toContain('"Edit Quote"');
    expect(quoteLayout).toContain("Export PDF");
    expect(quotePage).toContain("isQuoteImmutable({ quoteId, status: quoteStatus, awardLockedAt })");
  });

  it("opens an existing meaningful working revision instead of creating another", () => {
    expect(quotePage).toContain("const currentWorkingQuoteHref = currentWorkingQuoteId && routeProjectSlug");
    expect(quotePage).toContain("? `/app/projects/${routeProjectSlug}/preconstruction/quote/${currentWorkingQuoteId}`");
    expect(quotePage).not.toContain("${currentWorkingQuoteId}/pricing-worksheet");
    expect(quotePage).toContain("prefetchProjectQuoteHref({");
    expect(quotePage).toContain("href: currentWorkingQuoteHref");
    expect(quotePage).toContain("prefetch: (href) => router.prefetch(href)");
    expect(quotePage).toContain("Open Quote");
    expect(quotePage).toContain("disabled={!canManageQuote || isLoadingQuote}");
    expect(quotePage).toContain("onClick={() => router.push(currentWorkingQuoteHref)}");
    expect(quotePage).toContain(
      "router.push(`/app/projects/${routeProjectSlug}/preconstruction/quote/${nextQuoteId}/pricing-worksheet`)",
    );
  });

  it("does not show the Project working pricing helper banner", () => {
    expect(quotePage).not.toContain("Project working pricing.");
    expect(quotePage).not.toContain("Project-owned worksheets remain separate");
  });
});
