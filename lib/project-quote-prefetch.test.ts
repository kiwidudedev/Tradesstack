import { describe, expect, it, vi } from "vitest";
import {
  prefetchProjectQuoteHref,
  shouldPrefetchProjectQuoteHref,
} from "@/lib/project-quote-prefetch";

describe("Project Quote detail prefetch", () => {
  it("prefetches each valid known Quote Detail href only once", () => {
    const prefetchedHrefs = new Set<string>();
    const firstHref = "/app/projects/metro-project/preconstruction/quote/quote-b";
    const nextHref = "/app/projects/metro-project/preconstruction/quote/quote-c";
    const prefetch = vi.fn();

    expect(prefetchProjectQuoteHref({
      href: firstHref,
      projectId: "metro-project",
      prefetchedHrefs,
      prefetch,
    })).toBe(true);
    expect(prefetchProjectQuoteHref({
      href: firstHref,
      projectId: "metro-project",
      prefetchedHrefs,
      prefetch,
    })).toBe(false);
    expect(prefetchProjectQuoteHref({
      href: nextHref,
      projectId: "metro-project",
      prefetchedHrefs,
      prefetch,
    })).toBe(true);
    expect(prefetchedHrefs).toEqual(new Set([firstHref, nextHref]));
    expect(prefetch.mock.calls).toEqual([[firstHref], [nextHref]]);
  });

  it.each([
    undefined,
    null,
    "/app/projects/metro-project/preconstruction/quote",
    "/app/projects/metro-project/preconstruction/quote/",
    "/app/projects/metro-project/preconstruction/quote/new",
    "/app/projects/another-project/preconstruction/quote/quote-b",
    "/app/projects/metro-project/preconstruction/quote/quote-b/pricing-worksheet",
    "/app/projects/metro-project/preconstruction/quote/quote-b/pricing-worksheet/workbook-1",
    "/app/projects/metro-project/preconstruction/quote/quote-b?mode=edit",
  ])("rejects a fallback, unrelated, or non-detail href: %s", (href) => {
    expect(shouldPrefetchProjectQuoteHref({
      href,
      projectId: "metro-project",
      prefetchedHrefs: new Set<string>(),
    })).toBe(false);
  });
});
